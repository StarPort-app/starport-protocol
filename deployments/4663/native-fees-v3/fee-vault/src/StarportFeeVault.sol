// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IFeeAsset {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}
interface IPonsFeeEscrow {
    function balanceOf(address recipient) external view returns (uint256);
    function claim() external;
}
interface IPonsFeeRecipient {
    function transferCreatorFeeRecipient(address token, address recipient) external;
}
interface INativeOrbitRewards {
    function CHAIN_ID() external view returns (uint256);
    function rewardAsset() external view returns (address);
    function retired() external view returns (bool);
    function fundingAuthority() external view returns (address);
    function lots(bytes32 lotId) external view returns (address funder, bytes32 policyHash, uint256 funded, uint256 available);
    function fundLot(bytes32 lotId, uint256 amount, bytes32 policyHash) external payable;
}

/// @notice Native fee collector/splitter. Not a stake vault, swapper or budget/approval bureaucracy.
/// @dev Controller chooses future split; ordinary withdrawals cannot spend rewards; an explicit emergency override can rescue them.
///      Initial target binding is one-time. A retired target may be replaced only in emergency;
///      policy remains fixed and all target code/roles require independent review.
contract StarportFeeVault {
    uint256 public constant CHAIN_ID = 4663;
    uint256 public constant BPS = 10000;
    uint256 public constant INTERFACE_REVISION = 3;
    address public immutable feeAsset;
    address public immutable feeEscrow;
    address public immutable ponsFactory;
    address public immutable payoutRecipient;
    address public controller;
    address public pendingController;
    uint16 public operatingBps;
    uint256 public operatingBalance;
    uint256 public rewardReserve;
    uint256 public totalCollected;
    uint256 public totalOperatingWithdrawn;
    uint256 public totalRewardInjected;
    uint256 public totalRewardReturned;
    uint256 public totalEmergencyNativeWithdrawn;
    uint256 public totalEmergencyRewardReserveWithdrawn;
    bytes32 public lastEmergencyReasonHash;
    uint256 public injectionNonce;
    bytes32 public rewardLotId;
    address public rewardDistributor;
    bytes32 public rewardDistributorCodeHash;
    bytes32 public rewardPolicyHash;
    bool public collectionPaused;
    bool public rewardInjectionPaused;
    bool public emergencyMode;
    bool private claimingEscrow;
    uint256 private entered;

    error Unauthorized();
    error InvalidConfiguration();
    error ReentrantCall();
    error CollectionPaused();
    error InjectionPaused();
    error UnexpectedReceipt();
    error InvalidAmount();
    error TransferFailed();
    error RewardTargetUnavailable();
    error RewardFundingMismatch();
    error EmergencyRequired();

    event FeesCollected(address indexed caller, uint256 amount);
    event NativeReceived(address indexed sender, uint256 amount);
    event NativeSplit(uint256 amount, uint256 operatingAmount, uint256 rewardAmount, uint16 operatingBps);
    event UntrackedNativeAllocated(uint256 amount);
    event OperatingSplitChanged(uint16 previous, uint16 next);
    event OperatingWithdrawn(address indexed recipient, uint256 amount);
    event RewardTargetConfigured(address indexed target, bytes32 codeHash, bytes32 policyHash);
    event RetiredRewardTargetReplaced(address indexed previous, address indexed replacement,
        bytes32 codeHash, bytes32 policyHash);
    event RewardsInjected(bytes32 indexed lotId, address indexed target, uint256 amount, uint256 nonce);
    event RewardBudgetReturned(address indexed distributor, uint256 amount);
    event CollectionPauseChanged(bool paused);
    event RewardInjectionPauseChanged(bool paused);
    event EmergencyModeChanged(bool enabled);
    event ControllerProposed(address indexed candidate);
    event ControllerChanged(address indexed previous, address indexed next);
    event FutureFeeRecipientChanged(address indexed token, address indexed next);
    event AccidentalTokenRecovered(address indexed token, address indexed recipient, uint256 amount);
    event EmergencyAssetWithdrawn(address indexed asset, address indexed recipient, uint256 amount,
        uint256 operatingDebit, uint256 rewardDebit, bytes32 indexed reasonHash);

    constructor(address asset_, address escrow_, address factory_, address controller_, address payout_, uint16 operatingBps_) {
        if (block.chainid != CHAIN_ID || asset_ != address(0) || escrow_.code.length == 0 || factory_.code.length == 0
            || controller_ == address(0) || controller_ == address(this) || payout_ == address(0) || payout_ == address(this)
            || operatingBps_ > BPS) revert InvalidConfiguration();
        feeAsset = asset_; feeEscrow = escrow_; ponsFactory = factory_;
        controller = controller_; payoutRecipient = payout_; operatingBps = operatingBps_;
    }
    modifier onlyController() { if (msg.sender != controller) revert Unauthorized(); _; }
    modifier nonReentrant() {
        if (entered != 0) revert ReentrantCall(); entered = 1; _; entered = 0;
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
        // A fixed escrow receipt is measured/split by collectFees only, not counted twice here.
        if (claimingEscrow && msg.sender == feeEscrow) return;
        if (rewardDistributor != address(0) && msg.sender == rewardDistributor) {
            rewardReserve += msg.value;
            totalRewardReturned += msg.value;
            emit RewardBudgetReturned(msg.sender, msg.value); // Returned budget, not new trading revenue.
        } else {
            _split(msg.value); // Real subsidy/donation; never increments totalCollected.
        }
    }

    function claimable() public view returns (uint256) { return IPonsFeeEscrow(feeEscrow).balanceOf(address(this)); }

    /// @notice Permissionless; no owner key needed, no transfer to the caller and no outflow here.
    function collectFees() external nonReentrant returns (uint256 received) {
        if (collectionPaused || emergencyMode) revert CollectionPaused();
        _syncUntracked();
        uint256 owed = claimable();
        if (owed == 0) return 0;
        uint256 beforeBalance = address(this).balance;
        claimingEscrow = true;
        IPonsFeeEscrow(feeEscrow).claim();
        claimingEscrow = false;
        if (address(this).balance < beforeBalance || address(this).balance - beforeBalance != owed
            || IPonsFeeEscrow(feeEscrow).balanceOf(address(this)) != 0) revert UnexpectedReceipt();
        received = owed; totalCollected += received;
        _split(received);
        emit FeesCollected(msg.sender, received);
    }

    /// @notice Ratio affects only new money. Existing reward reserve never becomes operating money.
    function setOperatingBps(uint16 next) external onlyController nonReentrant {
        if (next > BPS) revert InvalidConfiguration();
        _syncUntracked();
        uint16 previous = operatingBps; operatingBps = next;
        emit OperatingSplitChanged(previous, next);
    }

    /// @notice No timelock, per-payment cap or approval period. Only the controller's operating share.
    function withdrawOperating(uint256 amount) external onlyController nonReentrant {
        _syncUntracked();
        if (amount == 0 || amount > operatingBalance) revert InvalidAmount();
        operatingBalance -= amount;
        totalOperatingWithdrawn += amount;
        uint256 beforeBalance = address(this).balance;
        (bool ok,) = payoutRecipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        if (address(this).balance != beforeBalance - amount) revert UnexpectedReceipt();
        emit OperatingWithdrawn(payoutRecipient, amount);
    }

    /// @notice One-time target binding; interface responses do not prove code safety or non-upgradeability.
    function configureRewardDistributor(address target, bytes32 policyHash, bytes32 reviewedRuntimeHash)
        external onlyController nonReentrant
    {
        if (rewardDistributor != address(0)) revert InvalidConfiguration();
        _bindRewardTarget(target, policyHash, reviewedRuntimeHash);
    }

    /// @notice Incident continuity only: retired receiver, recorded vault emergency, same policy.
    ///         No arbitrary ETH sweep, ordinary target rotation or old-claim migration is authorized.
    function replaceRetiredRewardDistributor(address target, bytes32 reviewedRuntimeHash)
        external onlyController nonReentrant
    {
        if (!emergencyMode) revert EmergencyRequired();
        address previous = rewardDistributor;
        if (previous == address(0) || previous == target || previous.codehash != rewardDistributorCodeHash
            || !INativeOrbitRewards(previous).retired()) revert RewardTargetUnavailable();
        _bindRewardTarget(target, rewardPolicyHash, reviewedRuntimeHash);
        if (INativeOrbitRewards(target).retired()) revert RewardTargetUnavailable();
        emit RetiredRewardTargetReplaced(previous, target, reviewedRuntimeHash, rewardPolicyHash);
    }
    function _bindRewardTarget(address target, bytes32 policyHash, bytes32 reviewedRuntimeHash) private {
        if (target == address(this) || target.code.length == 0 || policyHash == bytes32(0)
            || reviewedRuntimeHash == bytes32(0) || target.codehash != reviewedRuntimeHash) revert InvalidConfiguration();
        if (INativeOrbitRewards(target).CHAIN_ID() != CHAIN_ID || INativeOrbitRewards(target).rewardAsset() != address(0)
            || INativeOrbitRewards(target).fundingAuthority() != address(this)) revert InvalidConfiguration();
        rewardDistributor = target; rewardPolicyHash = policyHash; rewardDistributorCodeHash = reviewedRuntimeHash;
        rewardLotId = keccak256(abi.encode("starport.native-fee-lot.v3", CHAIN_ID, address(this), target, policyHash));
        emit RewardTargetConfigured(target, reviewedRuntimeHash, policyHash);
    }
    function nextRewardLotId() public view returns (bytes32) {
        return rewardLotId;
    }

    /// @notice Permissionless fixed-purpose trigger. Entire reward reserve, fixed internally generated lot ID,
    ///         fixed reviewed receiver/policy. No caller-chosen amount, asset, destination or calldata.
    function injectRewardReserve() external nonReentrant returns (bytes32 lotId, uint256 amount) {
        if (rewardInjectionPaused || emergencyMode) revert InjectionPaused();
        _syncUntracked();
        address target = rewardDistributor;
        if (target == address(0) || target.codehash != rewardDistributorCodeHash) revert RewardTargetUnavailable();
        if (INativeOrbitRewards(target).rewardAsset() != address(0) || INativeOrbitRewards(target).fundingAuthority() != address(this))
            revert RewardTargetUnavailable();
        amount = rewardReserve;
        if (amount == 0) revert InvalidAmount();
        lotId = nextRewardLotId();
        (,,uint256 fundedBefore, uint256 availableBefore) = INativeOrbitRewards(target).lots(lotId);
        // Reuse one bound lot so permissionless triggers cannot fragment a daily reward budget.
        (address previousFunder, bytes32 previousPolicy,,) = INativeOrbitRewards(target).lots(lotId);
        if (fundedBefore != 0 && (previousFunder != address(this) || previousPolicy != rewardPolicyHash)) revert RewardFundingMismatch();
        rewardReserve = 0;
        injectionNonce++;
        totalRewardInjected += amount;
        uint256 beforeBalance = address(this).balance;
        uint256 receiverBefore = target.balance;
        INativeOrbitRewards(target).fundLot{value: amount}(lotId, amount, rewardPolicyHash);
        (address funder, bytes32 policy, uint256 funded, uint256 available) = INativeOrbitRewards(target).lots(lotId);
        if (address(this).balance != beforeBalance - amount || target.balance != receiverBefore + amount
            || funder != address(this) || policy != rewardPolicyHash || funded != fundedBefore + amount || available != availableBefore + amount)
            revert RewardFundingMismatch();
        emit RewardsInjected(lotId, target, amount, injectionNonce);
    }

    function setCollectionPaused(bool paused) external onlyController nonReentrant {
        if (!paused && emergencyMode) revert CollectionPaused();
        collectionPaused = paused; emit CollectionPauseChanged(paused);
    }
    function setRewardInjectionPaused(bool paused) external onlyController nonReentrant {
        if (!paused && emergencyMode) revert InjectionPaused();
        rewardInjectionPaused = paused; emit RewardInjectionPauseChanged(paused);
    }
    function setEmergencyMode(bool enabled) external onlyController nonReentrant {
        emergencyMode = enabled;
        if (enabled) {
            collectionPaused = true; rewardInjectionPaused = true; pendingController = address(0);
        }
        // Exiting containment never resumes collection/injection automatically.
        emit EmergencyModeChanged(enabled);
    }
    /// @dev This function recovers accidental ERC20 only; native custody uses separate emergencyWithdraw.
    function recoverAccidentalToken(address token, uint256 amount) external onlyController nonReentrant {
        if (!emergencyMode) revert EmergencyRequired();
        if (token == address(this) || token == rewardDistributor || token.code.length == 0) revert InvalidConfiguration();
        uint256 beforeBalance = IFeeAsset(token).balanceOf(address(this));
        if (amount == 0 || amount > beforeBalance) revert InvalidAmount();
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IFeeAsset.transfer, (payoutRecipient, amount)));
        if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert TransferFailed();
        if (IFeeAsset(token).balanceOf(address(this)) != beforeBalance - amount) revert UnexpectedReceipt();
        emit AccidentalTokenRecovered(token, payoutRecipient, amount);
    }
    /// @notice Immediate controller custody rescue, including native reward reserve.
    ///         This override is discretionary custody, not an ordinary user payout.
    function emergencyWithdraw(address asset, address recipient, uint256 amount, bytes32 reasonHash)
        external onlyController nonReentrant
    {
        if (!emergencyMode) revert EmergencyRequired();
        if (recipient == address(0) || recipient == address(this) || amount == 0 || reasonHash == bytes32(0))
            revert InvalidConfiguration();
        uint256 operations; uint256 rewards;
        lastEmergencyReasonHash = reasonHash;
        if (asset == address(0)) {
            _syncUntracked();
            if (amount > address(this).balance) revert InvalidAmount();
            operations = amount < operatingBalance ? amount : operatingBalance;
            rewards = amount - operations;
            if (rewards > rewardReserve) revert InvalidAmount();
            operatingBalance -= operations; rewardReserve -= rewards;
            totalEmergencyNativeWithdrawn += amount; totalEmergencyRewardReserveWithdrawn += rewards;
            uint256 beforeBalance = address(this).balance;
            (bool ok,) = recipient.call{value:amount}("");
            if (!ok) revert TransferFailed();
            if (address(this).balance != beforeBalance - amount) revert UnexpectedReceipt();
        } else {
            if (asset.code.length == 0 || asset == address(this)) revert InvalidConfiguration();
            uint256 beforeBalance = IFeeAsset(asset).balanceOf(address(this));
            if (amount > beforeBalance) revert InvalidAmount();
            (bool ok, bytes memory data) = asset.call(abi.encodeCall(IFeeAsset.transfer,(recipient,amount)));
            if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data,(bool))))) revert TransferFailed();
            if (IFeeAsset(asset).balanceOf(address(this)) != beforeBalance - amount) revert UnexpectedReceipt();
        }
        emit EmergencyAssetWithdrawn(asset,recipient,amount,operations,rewards,reasonHash);
    }
    function proposeController(address candidate) external onlyController nonReentrant {
        if (candidate == address(0) || candidate == address(this)) revert InvalidConfiguration();
        pendingController = candidate; emit ControllerProposed(candidate);
    }
    function acceptController() external nonReentrant {
        if (msg.sender != pendingController) revert Unauthorized();
        address previous = controller; controller = msg.sender; pendingController = address(0);
        emit ControllerChanged(previous, msg.sender);
    }
    /// @dev Maintenance of future PONS rights only; cannot move already allocated ETH rewards.
    function transferFutureFeeRecipient(address token, address recipient) external onlyController nonReentrant {
        if (token.code.length == 0 || recipient == address(0) || recipient == address(this)) revert InvalidConfiguration();
        IPonsFeeRecipient(ponsFactory).transferCreatorFeeRecipient(token, recipient);
        emit FutureFeeRecipientChanged(token, recipient);
    }

    function _syncUntracked() private {
        uint256 tracked = operatingBalance + rewardReserve;
        if (address(this).balance < tracked) revert UnexpectedReceipt();
        uint256 extra = address(this).balance - tracked;
        if (extra != 0) { _split(extra); emit UntrackedNativeAllocated(extra); }
    }
    function _split(uint256 amount) private {
        // Exact floor(amount * bps / 10000), without a uint256 multiplication overflow.
        uint256 operations = amount / BPS * operatingBps + (amount % BPS) * operatingBps / BPS;
        uint256 rewards = amount - operations;
        operatingBalance += operations; rewardReserve += rewards;
        emit NativeSplit(amount, operations, rewards, operatingBps);
    }
}
