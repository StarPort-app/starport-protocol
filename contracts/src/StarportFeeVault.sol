// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IFeeAsset {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}
interface IPonsFeeEscrow {
    function balanceOf(address recipient) external view returns (uint256);
    function claim() external returns (uint256);
}
interface IPonsFeeRecipient {
    function transferCreatorFeeRecipient(address token, address newRecipient) external;
}

/// @notice Pulls native ETH creator fees from the fixed PONS escrow.
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
    uint256 public constant PAYOUT_TIMELOCK = 48 hours;
    uint256 public constant EMERGENCY_RECOVERY_TIMELOCK = 24 hours;
    uint256 public emergencyModeEnteredAt;
    struct RecipientChange { address token; address recipient; uint256 readyAt; }
    RecipientChange public pendingRecipientChange;
    struct QueuedPayout { address recipient; uint256 amount; uint256 readyAt; }
    QueuedPayout public queuedPayout;

    event FeesCollected(address indexed caller, address indexed asset, uint256 amount);
    event FundsPaid(address indexed recipient, uint256 amount);
    event PayoutQueued(address indexed recipient, uint256 amount, uint256 readyAt);
    event PayoutExecuted(address indexed recipient, uint256 amount);
    event PayoutCancelled(address indexed recipient, uint256 amount);
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
        // PONS uses address(0) for native ETH. ERC-20 and WETH are not substitutes.
        if (asset_ != address(0) || escrow_.code.length == 0 || factory_.code.length == 0
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
        return IPonsFeeEscrow(feeEscrow).balanceOf(address(this));
    }

    /// @notice Anyone may trigger collection; only this vault receives the fees.
    function collectFees() external nonReentrant returns (uint256 received) {
        if (collectionPaused || emergencyMode) revert CollectionPaused();
        uint256 owed = claimable();
        if (owed == 0) return 0;
        uint256 beforeBalance = address(this).balance;
        uint256 reported = IPonsFeeEscrow(feeEscrow).claim();
        uint256 afterBalance = address(this).balance;
        if (reported != owed || afterBalance < beforeBalance || afterBalance - beforeBalance != owed) revert UnexpectedReceipt();
        received = afterBalance - beforeBalance;
        totalCollected += received;
        emit FeesCollected(msg.sender, feeAsset, received);
    }

    /// @notice Queue operating funds to the immutable payout address with an enforced 48-hour timelock.
    function queueOperatingFunds(uint256 amount) external onlyController nonReentrant {
        if (emergencyMode) revert EmergencyActive();
        if (amount == 0 || amount > address(this).balance) revert InvalidAmount();
        uint256 readyAt = block.timestamp + PAYOUT_TIMELOCK;
        queuedPayout = QueuedPayout(payoutRecipient, amount, readyAt);
        emit PayoutQueued(payoutRecipient, amount, readyAt);
    }

    /// @notice Cancel any pending queued operating funds payout.
    function cancelOperatingFunds() external onlyController {
        uint256 amount = queuedPayout.amount;
        delete queuedPayout;
        emit PayoutCancelled(payoutRecipient, amount);
    }

    /// @notice Execute a queued payout after the 48-hour timelock has elapsed.
    function executeOperatingFunds() external onlyController nonReentrant {
        if (emergencyMode) revert EmergencyActive();
        QueuedPayout memory payout = queuedPayout;
        if (payout.readyAt == 0 || block.timestamp < payout.readyAt) revert MigrationNotReady();
        uint256 beforeVault = address(this).balance;
        if (payout.amount == 0 || payout.amount > beforeVault) revert InvalidAmount();
        delete queuedPayout;
        (bool ok,) = payoutRecipient.call{value: payout.amount}("");
        if (!ok) revert TransferFailed();
        if (address(this).balance != beforeVault - payout.amount) revert UnexpectedReceipt();
        emit FundsPaid(payoutRecipient, payout.amount);
        emit PayoutExecuted(payoutRecipient, payout.amount);
    }

    function setCollectionPaused(bool paused) external onlyController {
        if (!paused && emergencyMode) revert EmergencyActive();
        collectionPaused = paused; emit CollectionPauseChanged(paused);
    }

    /// @notice Freeze collection and invalidate previously queued authority/recipient/payout changes.
    /// Leaving emergency mode deliberately does not resume collection automatically.
    function setEmergencyMode(bool enabled) external onlyController nonReentrant {
        emergencyMode = enabled;
        if (enabled) {
            emergencyModeEnteredAt = block.timestamp;
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
            if (queuedPayout.readyAt != 0) {
                uint256 amt = queuedPayout.amount;
                delete queuedPayout;
                emit PayoutCancelled(payoutRecipient, amt);
            }
        } else {
            emergencyModeEnteredAt = 0;
        }
        emit EmergencyModeChanged(enabled);
    }

    /// @notice Recover ERC-20 assets, including SPCX, only to the immutable payout wallet.
    /// Enforces a mandatory 24-hour observation delay after emergencyMode is activated.
    function emergencyRecoverToken(address token, uint256 amount) external onlyController nonReentrant {
        if (!emergencyMode) revert EmergencyRequired();
        if (block.timestamp < emergencyModeEnteredAt + EMERGENCY_RECOVERY_TIMELOCK) revert MigrationNotReady();
        if (token == address(this) || token.code.length == 0) revert InvalidConfiguration();
        uint256 beforeBalance = IFeeAsset(token).balanceOf(address(this));
        if (amount == 0 || amount > beforeBalance) revert InvalidAmount();
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IFeeAsset.transfer, (payoutRecipient, amount)));
        if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert TransferFailed();
        if (IFeeAsset(token).balanceOf(address(this)) != beforeBalance - amount) revert UnexpectedReceipt();
        emit EmergencyTokenRecovered(token, payoutRecipient, amount);
    }

    /// @notice Recover native ETH only to the immutable payout wallet after the 24-hour emergency timelock.
    function emergencyRecoverNative(uint256 amount) external onlyController nonReentrant {
        if (!emergencyMode) revert EmergencyRequired();
        if (block.timestamp < emergencyModeEnteredAt + EMERGENCY_RECOVERY_TIMELOCK) revert MigrationNotReady();
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
