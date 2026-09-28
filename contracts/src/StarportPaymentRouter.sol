// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ExactAsset, GuardedEntry} from "./ExactAsset.sol";
import {ActionNonces} from "./ActionNonces.sol";

interface IPaymentEligibility {
    function canPay(address payer, address recipient, address asset, uint256 amount, bytes32 termsDigest) external view returns (bool);
}

/// @notice Exact, wallet-called ERC-20 payment and issuer-authorized invoice settlement.
/// @dev One immutable asset; no backend signer, arbitrary relay, standing custody or wrapper fee.
contract StarportPaymentRouter is EIP712, GuardedEntry, ActionNonces {
    error InvalidConfiguration();
    error InvalidPayment();
    error PaymentUnavailable();
    error InvoiceUnavailable();
    error InvalidIssuerSignature();
    error Unauthorized();
    address public immutable paymentAsset;
    address public immutable guardian;
    IPaymentEligibility public immutable eligibility;
    bytes32 public immutable eligibilityCodeHash;
    uint256 public immutable maxPaymentAmount;
    uint256 public constant MAX_REQUEST_LIFETIME = 1 days;
    bool public paused;
    bytes32 public constant INVOICE_TYPEHASH = keccak256("InvoiceTerms(bytes32 invoiceId,uint64 version,address issuer,address payee,address asset,uint256 amountRaw,address authorizedPayer,uint256 expiresAt,bytes32 termsHash)");
    struct PaymentRequest {
        bytes32 preparationId;
        address payer;
        address recipient;
        address asset;
        uint256 amountRaw;
        uint256 deadline;
        uint256 nonce;
        bytes32 expectedTermsDigest;
    }
    struct InvoiceTerms {
        bytes32 invoiceId;
        uint64 version;
        address issuer;
        address payee;
        address asset;
        uint256 amountRaw;
        address authorizedPayer;
        uint256 expiresAt;
        bytes32 termsHash;
    }
    struct InvoiceState { uint64 version; bool cancelled; bool settled; bytes32 settlementDigest; }
    mapping(bytes32 => InvoiceState) private invoices;
    mapping(address => mapping(bytes32 => bool)) public paidPreparations;
    event PaymentSettled(bytes32 indexed paymentKey, bytes32 indexed preparationId, address indexed payer, address recipient, address asset, uint256 amountRaw, uint256 nonce);
    event InvoiceSettled(bytes32 indexed invoiceKey, bytes32 indexed invoiceId, address indexed issuer, uint64 version, bytes32 invoiceDigest, address payer, address recipient, address asset, uint256 amountRaw, bytes32 preparationId);
    event InvoiceCancelled(bytes32 indexed invoiceKey, address indexed issuer);
    event InvoiceVersionAdvanced(bytes32 indexed invoiceKey, uint64 previousVersion, uint64 nextVersion);
    event PauseChanged(bool paused);

    constructor(address asset_, address guardian_, address eligibility_, uint256 maxPayment_) EIP712("Starport Pay", "1") {
        if (asset_.code.length == 0 || eligibility_.code.length == 0 || guardian_ == address(0) || maxPayment_ == 0) revert InvalidConfiguration();
        paymentAsset = asset_; guardian = guardian_; eligibility = IPaymentEligibility(eligibility_);
        eligibilityCodeHash = eligibility_.codehash; maxPaymentAmount = maxPayment_;
    }
    function invoiceKey(address issuer, bytes32 id) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), issuer, id));
    }
    function invoiceState(address issuer, bytes32 id) external view returns (InvoiceState memory result) {
        result = invoices[invoiceKey(issuer, id)];
        if (result.version == 0) result.version = 1;
    }
    function invoiceDigest(InvoiceTerms calldata terms) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(INVOICE_TYPEHASH, terms)));
    }
    function payDirect(PaymentRequest calldata request) external nonReentrant returns (bytes32) {
        _authorize(request);
        return _pay(request);
    }
    function payInvoice(PaymentRequest calldata request, InvoiceTerms calldata terms, bytes calldata issuerSignature) external nonReentrant returns (bytes32 key) {
        _authorize(request);
        key = invoiceKey(terms.issuer, terms.invoiceId);
        InvoiceState storage state = invoices[key];
        uint64 currentVersion = state.version == 0 ? 1 : state.version;
        bytes32 digest = invoiceDigest(terms);
        if (state.cancelled || state.settled || terms.version != currentVersion || terms.invoiceId == bytes32(0)
            || terms.issuer == address(0) || terms.expiresAt < block.timestamp || terms.termsHash == bytes32(0)
            || (terms.authorizedPayer != address(0) && terms.authorizedPayer != msg.sender)
            || request.expectedTermsDigest != digest || request.asset != terms.asset
            || request.recipient != terms.payee || request.amountRaw != terms.amountRaw) revert InvoiceUnavailable();
        if (issuerSignature.length > 4096 || !SignatureChecker.isValidSignatureNowCalldata(terms.issuer, digest, issuerSignature)) revert InvalidIssuerSignature();
        state.version = currentVersion; state.settled = true; state.settlementDigest = digest;
        _pay(request);
        _emitInvoiceSettled(key, terms, digest, request.preparationId);
    }
    function _emitInvoiceSettled(bytes32 key, InvoiceTerms calldata terms, bytes32 digest, bytes32 preparationId) private {
        emit InvoiceSettled(key, terms.invoiceId, terms.issuer, terms.version, digest, msg.sender, terms.payee, terms.asset, terms.amountRaw, preparationId);
    }
    function cancelInvoice(bytes32 id) external {
        if (id == bytes32(0)) revert InvoiceUnavailable();
        bytes32 key = invoiceKey(msg.sender, id); InvoiceState storage state = invoices[key];
        if (state.settled || state.cancelled) revert InvoiceUnavailable();
        state.cancelled = true; emit InvoiceCancelled(key, msg.sender);
    }
    function advanceInvoiceVersion(bytes32 id, uint64 nextVersion) external {
        bytes32 key = invoiceKey(msg.sender, id); InvoiceState storage state = invoices[key];
        uint64 previous = state.version == 0 ? 1 : state.version;
        if (id == bytes32(0) || state.settled || state.cancelled || nextVersion <= previous) revert InvoiceUnavailable();
        state.version = nextVersion; emit InvoiceVersionAdvanced(key, previous, nextVersion);
    }
    function setPaused(bool value) external {
        if (msg.sender != guardian) revert Unauthorized();
        paused = value; emit PauseChanged(value);
    }
    function _authorize(PaymentRequest calldata request) private {
        if (paused || address(eligibility).codehash != eligibilityCodeHash) revert PaymentUnavailable();
        if (request.payer != msg.sender || request.recipient == address(0) || request.recipient == address(this)
            || request.recipient == msg.sender || request.asset != paymentAsset || request.amountRaw == 0
            || request.amountRaw > maxPaymentAmount || request.preparationId == bytes32(0)
            || request.expectedTermsDigest == bytes32(0) || request.deadline < block.timestamp
            || request.deadline > block.timestamp + MAX_REQUEST_LIFETIME
            || paidPreparations[msg.sender][request.preparationId]) revert InvalidPayment();
        _consumeNonce(request.nonce);
        paidPreparations[msg.sender][request.preparationId] = true;
        if (!eligibility.canPay(msg.sender, request.recipient, request.asset, request.amountRaw, request.expectedTermsDigest)) revert PaymentUnavailable();
    }
    function _pay(PaymentRequest calldata request) private returns (bytes32 key) {
        ExactAsset.move(paymentAsset, msg.sender, request.recipient, request.amountRaw, true);
        key = keccak256(abi.encode(block.chainid, address(this), msg.sender, request.preparationId, request.nonce));
        emit PaymentSettled(key, request.preparationId, msg.sender, request.recipient, paymentAsset, request.amountRaw, request.nonce);
    }
}
