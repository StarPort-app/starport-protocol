// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IFeeAsset {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}
interface IPonsFeeEscrow {
    function balanceOfToken(address recipient, address token) external view returns (uint256);
    function claimToken(address token) external;
}
interface IPonsFeeRecipient {
    function transferCreatorFeeRecipient(address token, address newRecipient) external;
}

/// @notice Pulls a single configured fee asset from a single PONS escrow.
/// @dev Not a user deposit vault, trading router, reward distributor or autonomous clock.
contract StarportFeeVault {
    error Unauthorized();
    error InvalidConfiguration();
    error ReentrantCall();
    error CollectionPaused();
    error UnexpectedReceipt();
    error InvalidAmount();
    error TransferFailed();
    error MigrationNotReady();
    error EmergencyActive();
    error EmergencyRequired();

    address public immutable feeAsset;
    address public immutable feeEscrow;
    address public immutable ponsFactory;
    address public immutable payoutRecipient;
    address public controller;
    address public pendingController;
    bool public collectionPaused;
    bool public emergencyMode;
    uint256 public totalCollected;
    uint256 private entered;
    uint256 public constant RECIPIENT_CHANGE_DELAY = 2 days;
    struct RecipientChange { address token; address recipient; uint256 readyAt; }
    RecipientChange public pendingRecipientChange;

    event FeesCollected(address indexed caller, address indexed asset, uint256 amount);
    event FundsPaid(address indexed recipient, uint256 amount);
    event ControllerProposed(address indexed candidate);
    event ControllerChanged(address indexed previous, address indexed next);
    event CollectionPauseChanged(bool paused);
    event FutureRecipientProposed(address indexed token, address indexed recipient, uint256 readyAt);
    event FutureRecipientChanged(address indexed token, address indexed recipient);
    event FutureRecipientCancelled();
    event NativeReceived(address indexed sender, uint256 amount);
    event EmergencyModeChanged(bool enabled);
    event ControllerProposalCancelled();
    /// @dev Amount is the verified vault debit, not a promise about net recipient credit.
    event EmergencyTokenRecovered(address indexed token, address indexed recipient, uint256 amount);
    event EmergencyNativeRecovered(address indexed recipient, uint256 amount);

    constructor(address asset_, address escrow_, address factory_, address controller_, address payout_) {
        if (asset_.code.length == 0 || escrow_.code.length == 0 || factory_.code.length == 0
            || controller_ == address(0) || controller_ == address(this) || payout_ == address(0) || payout_ == address(this)) revert InvalidConfiguration();
        feeAsset = asset_;
        feeEscrow = escrow_;
        ponsFactory = factory_;
        controller = controller_;
        payoutRecipient = payout_;
    }

    modifier onlyController() { if (msg.sender != controller) revert Unauthorized(); _; }
    modifier nonReentrant() { if (entered != 0) revert ReentrantCall(); entered = 1; _; entered = 0; }

    receive() external payable { emit NativeReceived(msg.sender, msg.value); }

    function claimable() public view returns (uint256) {
        return IPonsFeeEscrow(feeEscrow).balanceOfToken(address(this), feeAsset);
    }

    /// @notice Anyone may trigger collection; only this vault receives the fees.
    function collectFees() external nonReentrant returns (uint256 received) {
        if (collectionPaused || emergencyMode) revert CollectionPaused();
        uint256 owed = claimable();
        if (owed == 0) return 0;
        uint256 beforeBalance = IFeeAsset(feeAsset).balanceOf(address(this));
        IPonsFeeEscrow(feeEscrow).claimToken(feeAsset);
        uint256 afterBalance = IFeeAsset(feeAsset).balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != owed) revert UnexpectedReceipt();
        received = afterBalance - beforeBalance;
        totalCollected += received;
        emit FeesCollected(msg.sender, feeAsset, received);
    }

    /// @notice Manual spending to the immutable payout address, never to a keeper-selected target.
    function payOperatingFunds(uint256 amount) external onlyController nonReentrant {
        if (emergencyMode) revert EmergencyActive();
        uint256 beforeVault = IFeeAsset(feeAsset).balanceOf(address(this));
        if (amount == 0 || amount > beforeVault) revert InvalidAmount();
        uint256 beforeRecipient = IFeeAsset(feeAsset).balanceOf(payoutRecipient);
        (bool ok, bytes memory data) = feeAsset.call(abi.encodeCall(IFeeAsset.transfer, (payoutRecipient, amount)));
        if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert TransferFailed();
        if (IFeeAsset(feeAsset).balanceOf(address(this)) != beforeVault - amount
            || IFeeAsset(feeAsset).balanceOf(payoutRecipient) != beforeRecipient + amount) revert UnexpectedReceipt();
        emit FundsPaid(payoutRecipient, amount);
    }

    function setCollectionPaused(bool paused) external onlyController {
        if (!paused && emergencyMode) revert EmergencyActive();
        collectionPaused = paused; emit CollectionPauseChanged(paused);
    }

    /// @notice Freeze collection and invalidate previously queued authority/recipient changes.
    /// Leaving emergency mode deliberately does not resume collection automatically.
    function setEmergencyMode(bool enabled) external onlyController nonReentrant {
        emergencyMode = enabled;
        if (enabled) {
            collectionPaused = true;
            emit CollectionPauseChanged(true);
            if (pendingController != address(0)) {
                pendingController = address(0);
                emit ControllerProposalCancelled();
            }
            if (pendingRecipientChange.readyAt != 0) {
                delete pendingRecipientChange;
                emit FutureRecipientCancelled();
            }
        }
        emit EmergencyModeChanged(enabled);
    }

    /// @notice Recover ERC-20 assets, including SPCX, only to the immutable payout wallet.
    /// Nonstandard/rebasing/blocked assets may still refuse recovery. No approvals or arbitrary calls.
    function emergencyRecoverToken(address token, uint256 amount) external onlyController nonReentrant {
        if (!emergencyMode) revert EmergencyRequired();
        if (token == address(this) || token.code.length == 0) revert InvalidConfiguration();
        uint256 beforeBalance = IFeeAsset(token).balanceOf(address(this));
        if (amount == 0 || amount > beforeBalance) revert InvalidAmount();
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IFeeAsset.transfer, (payoutRecipient, amount)));
        if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert TransferFailed();
        if (IFeeAsset(token).balanceOf(address(this)) != beforeBalance - amount) revert UnexpectedReceipt();
        emit EmergencyTokenRecovered(token, payoutRecipient, amount);
    }

    function emergencyRecoverNative(uint256 amount) external onlyController nonReentrant {
        if (!emergencyMode) revert EmergencyRequired();
        if (amount == 0 || amount > address(this).balance) revert InvalidAmount();
        (bool ok,) = payoutRecipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit EmergencyNativeRecovered(payoutRecipient, amount);
    }
    function proposeController(address candidate) external onlyController {
        if (candidate == address(0) || candidate == address(this)) revert InvalidConfiguration();
        pendingController = candidate; emit ControllerProposed(candidate);
    }
    function acceptController() external {
        if (msg.sender != pendingController) revert Unauthorized();
        address previous = controller; controller = msg.sender; pendingController = address(0);
        emit ControllerChanged(previous, msg.sender);
    }

    /// @dev Keeps future PONS fee rights from becoming trapped in an immutable vault.
    /// Old escrow credits and current vault funds are not moved by this operation.
    function proposeFutureRecipient(address token, address recipient) external onlyController {
        if (emergencyMode) revert EmergencyActive();
        if (token.code.length == 0 || recipient == address(0) || recipient == address(this)) revert InvalidConfiguration();
        uint256 readyAt = block.timestamp + RECIPIENT_CHANGE_DELAY;
        pendingRecipientChange = RecipientChange(token, recipient, readyAt);
        emit FutureRecipientProposed(token, recipient, readyAt);
    }
    function cancelFutureRecipient() external onlyController { delete pendingRecipientChange; emit FutureRecipientCancelled(); }
    function executeFutureRecipient() external onlyController nonReentrant {
        if (emergencyMode) revert EmergencyActive();
        RecipientChange memory change = pendingRecipientChange;
        if (change.readyAt == 0 || block.timestamp < change.readyAt) revert MigrationNotReady();
        delete pendingRecipientChange;
        IPonsFeeRecipient(ponsFactory).transferCreatorFeeRecipient(change.token, change.recipient);
        emit FutureRecipientChanged(change.token, change.recipient);
    }
}
