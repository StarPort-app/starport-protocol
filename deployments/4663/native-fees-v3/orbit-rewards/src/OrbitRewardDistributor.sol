// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IOrbitRewardAsset {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Prefunded native ETH (address(0)) or ERC20 rewards; SPORT stake is not held here.
///         No minting, automatic tax conversion or fixed yield.
/// @dev Publisher/reviewer are trusted for correct inclusion, sums and work eligibility. A Merkle proof
///      proves inclusion only. This contract cannot determine whether an orbital service was performed.
///      Guardian is also the emergency custodian: it can freeze and rescue the entire reward balance
///      to a chosen address. Rescue retires this distributor without marking entitlements as paid.
contract OrbitRewardDistributor {
    uint256 public constant CHAIN_ID = 4663;
    uint256 public constant EPOCH_SECONDS = 1 days;
    uint256 public constant REVIEW_DELAY = 1 days;
    uint256 public constant CLAIM_WINDOW = 180 days;
    uint256 public constant MAX_PAUSE = 7 days;
    uint256 public constant MAX_LEAVES = 10000;
    bytes32 public constant LEAF_TYPEHASH = keccak256(
        "OrbitReward(uint256 chainId,address distributor,uint256 epoch,uint256 index,address payee,address asset,uint256 amount,bytes32 policyHash)"
    );
    bytes32 public constant EMPTY_ROOT = keccak256("starport.orbit-rewards.empty.v1");
    address public immutable rewardAsset;
    address public immutable fundingAuthority;
    address public immutable publisher;
    address public immutable reviewer;
    address public immutable guardian;
    uint256 public immutable maxEpochBudget;
    bool public fundingPaused = true;
    uint256 public totalReserved;
    bool public emergencyMode;
    bool public retired;
    uint256 public emergencyStartedAt;
    uint256 public emergencyPauseUsed;
    bytes32 public emergencyReasonHash;
    address public rescueDestination;
    uint256 public rescuedRewards;
    mapping(uint256 => uint256) public epochEmergencyPauseBaseline;
    mapping(uint256 => uint256) private claimPauseEmergencyBaseline;
    uint256 private entered;

    struct Lot { address funder; bytes32 policyHash; uint256 funded; uint256 available; }
    struct Epoch {
        address funder;
        bytes32 lotId;
        bytes32 policyHash;
        bytes32 root;
        bytes32 manifestHash;
        uint256 allocated;
        uint256 claimed;
        uint256 leafCount;
        uint256 revision;
        uint256 proposedAt;
        uint256 finalizedAt;
        uint256 pausedAt;
        uint256 pauseUsed;
        bool reviewed;
        bool disputed;
        bool closed;
    }
    struct Claim { uint256 epoch; uint256 index; uint256 amount; bytes32[] proof; }
    mapping(bytes32 => Lot) public lots;
    mapping(uint256 => Epoch) private epochs;
    mapping(uint256 => mapping(uint256 => uint256)) private claimedBits;

    error Unauthorized();
    error InvalidConfiguration();
    error InvalidEpoch();
    error OutsideWindow();
    error InvalidProof();
    error AlreadyClaimed();
    error TransferMismatch();
    error Disputed();
    error Reentrancy();
    error EmergencyActive();
    error InvalidEmergency();
    error DistributorRetired();

    event FundingPauseChanged(bool paused);
    event LotFunded(bytes32 indexed lotId, address indexed funder, uint256 amount, bytes32 policyHash);
    event RootProposed(uint256 indexed epoch, uint256 indexed revision, bytes32 root, bytes32 manifestHash, uint256 allocated, uint256 leafCount, uint256 reviewEndsAt);
    event RootReviewed(uint256 indexed epoch, uint256 indexed revision, bool approved);
    event DisputeFlagged(uint256 indexed epoch, uint256 indexed revision, bytes32 evidenceHash);
    event DisputeCleared(uint256 indexed epoch, uint256 indexed revision, uint256 newReviewEndsAt);
    event EpochFinalized(uint256 indexed epoch, bytes32 root, uint256 claimDeadline);
    event RewardClaimed(uint256 indexed epoch, uint256 indexed index, address indexed payee, uint256 amount);
    event ClaimPauseChanged(uint256 indexed epoch, bool paused);
    event EpochClosed(uint256 indexed epoch, address indexed funder, uint256 amount);
    event EmergencyStateChanged(bool active, bytes32 indexed reasonHash);
    event RewardsRescued(address indexed destination, address indexed asset, uint256 amount,
        uint256 outstandingReserved, bytes32 indexed reasonHash);

    modifier nonReentrant() {
        if (entered != 0) revert Reentrancy();
        entered = 1; _; entered = 0;
    }

    constructor(address asset_, address funder_, address publisher_, address reviewer_, address guardian_, uint256 budgetCap_) {
        if (block.chainid != CHAIN_ID || (asset_ != address(0) && asset_.code.length == 0) || funder_ == address(0)
            || publisher_ == address(0) || reviewer_ == address(0) || guardian_ == address(0)
            || publisher_ == reviewer_ || funder_ == address(this) || budgetCap_ == 0) revert InvalidConfiguration();
        rewardAsset = asset_; fundingAuthority = funder_; publisher = publisher_;
        reviewer = reviewer_; guardian = guardian_; maxEpochBudget = budgetCap_;
    }

    function setFundingPaused(bool paused) external nonReentrant {
        if (msg.sender != guardian) revert Unauthorized();
        if (!paused) _requireActive();
        fundingPaused = paused;
        emit FundingPauseChanged(paused);
    }

    /// @notice Immediate guardian containment. Funding stays paused after incident recovery.
    function enterEmergency(bytes32 reasonHash) external nonReentrant {
        if (msg.sender != guardian) revert Unauthorized();
        if (retired) revert DistributorRetired();
        if (emergencyMode || reasonHash == bytes32(0)) revert InvalidEmergency();
        emergencyMode = true; emergencyStartedAt = block.timestamp; emergencyReasonHash = reasonHash;
        fundingPaused = true;
        emit FundingPauseChanged(true);
        emit EmergencyStateChanged(true, reasonHash);
    }

    /// @notice Resume only if no rescue occurred and outstanding reserves remain fully funded.
    function leaveEmergency() external nonReentrant {
        if (msg.sender != guardian) revert Unauthorized();
        if (retired) revert DistributorRetired();
        if (!emergencyMode) revert InvalidEmergency();
        _solvent();
        emergencyPauseUsed += block.timestamp - emergencyStartedAt;
        emergencyStartedAt = 0; emergencyMode = false;
        emit EmergencyStateChanged(false, emergencyReasonHash);
    }

    /// @notice Emergency custody transfer, not a payout or automatic migration of claim proofs.
    ///         Any nonzero eligible wallet or replacement contract can receive the entire balance.
    ///         Original lots, roots, claimed bitmaps and totalReserved remain for reconciliation.
    function emergencyRescueRewards(address destination, bytes32 reasonHash) external nonReentrant {
        if (msg.sender != guardian) revert Unauthorized();
        if (retired) revert DistributorRetired();
        if (!emergencyMode || reasonHash == bytes32(0) || destination == address(0)
            || destination == address(this) || destination == rewardAsset) revert InvalidEmergency();
        uint256 amount = rewardAsset == address(0)
            ? address(this).balance : IOrbitRewardAsset(rewardAsset).balanceOf(address(this));
        // Empty receivers can retire for incident replacement too; no false payment is recorded.
        retired = true; rescueDestination = destination; rescuedRewards = amount;
        if (amount != 0) _move(address(this), destination, amount);
        emit RewardsRescued(destination, rewardAsset, amount, totalReserved, reasonHash);
    }

    function _requireActive() private view {
        if (retired) revert DistributorRetired();
        if (emergencyMode) revert EmergencyActive();
    }
    function _emergencyDuration() private view returns (uint256) {
        return emergencyPauseUsed + (emergencyMode ? block.timestamp - emergencyStartedAt : 0);
    }
    function epoch(uint256 id) external view returns (Epoch memory) { return epochs[id]; }

    /// @notice Lots are prefunded before work; unused budget stays available for subsequent epochs.
    ///         Native lots require exactly amount wei; ERC20 lots reject attached native value.
    function fundLot(bytes32 lotId, uint256 amount, bytes32 policyHash) external payable nonReentrant {
        if (msg.sender != fundingAuthority) revert Unauthorized();
        _requireActive();
        Lot storage lot = lots[lotId];
        if (fundingPaused || lotId == bytes32(0) || amount == 0 || policyHash == bytes32(0)
            || (lot.funded != 0 && lot.policyHash != policyHash)) revert InvalidEpoch();
        if (rewardAsset == address(0)) {
            // Incoming msg.value must not hide a pre-existing reserve deficit.
            if (msg.value != amount || address(this).balance - msg.value < totalReserved) revert TransferMismatch();
        } else {
            if (msg.value != 0) revert TransferMismatch();
            _solvent();
            _move(msg.sender, address(this), amount);
        }
        lot.funder = msg.sender; lot.policyHash = policyHash; lot.funded += amount; lot.available += amount;
        totalReserved += amount;
        emit LotFunded(lotId, msg.sender, amount, policyHash);
    }

    /// @dev Epoch is the Unix UTC day of final acceptance. A root reserves part of one funded lot.
    function proposeRoot(uint256 id, bytes32 lotId, bytes32 root, bytes32 manifest, uint256 allocated, uint256 leafCount)
        external nonReentrant
    {
        if (msg.sender != publisher) revert Unauthorized();
        _requireActive();
        Epoch storage e = epochs[id];
        Lot storage lot = lots[lotId];
        if (lot.funded == 0 || e.closed || e.finalizedAt != 0 || manifest == bytes32(0) || root == bytes32(0)
            || allocated > maxEpochBudget || allocated > lot.available + e.allocated || leafCount > MAX_LEAVES
            || (e.proposedAt != 0 && e.lotId != lotId)) revert InvalidEpoch();
        if (id >= block.timestamp / EPOCH_SECONDS) revert OutsideWindow();
        if ((allocated == 0 && (leafCount != 0 || root != EMPTY_ROOT))
            || (allocated != 0 && (leafCount == 0 || root == EMPTY_ROOT))) revert InvalidEpoch();
        lot.available = lot.available + e.allocated - allocated;
        e.lotId = lotId; e.funder = lot.funder; e.policyHash = lot.policyHash;
        e.root = root; e.manifestHash = manifest; e.allocated = allocated; e.leafCount = leafCount;
        e.revision++; e.proposedAt = block.timestamp; e.reviewed = false;
        // Existing disputes survive a revision until the reviewer explicitly resolves them.
        emit RootProposed(id, e.revision, root, manifest, allocated, leafCount, block.timestamp + REVIEW_DELAY);
    }

    function reviewRoot(uint256 id, uint256 revision, bytes32 root, bytes32 manifest, uint256 allocated, uint256 count, bool approved)
        external nonReentrant
    {
        if (msg.sender != reviewer) revert Unauthorized();
        _requireActive();
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt != 0 || e.proposedAt == 0 || e.revision != revision || root != e.root
            || manifest != e.manifestHash || allocated != e.allocated || count != e.leafCount) revert InvalidEpoch();
        e.reviewed = approved;
        emit RootReviewed(id, revision, approved);
    }

    /// @notice The safety guardian/reviewer can hold a candidate. Public concerns are reviewed offchain.
    function flagDispute(uint256 id, uint256 revision, bytes32 evidenceHash) external nonReentrant {
        if (msg.sender != guardian && msg.sender != reviewer) revert Unauthorized();
        // Incidents may quarantine pending roots before resume, avoiding a finalize race.
        if (retired) revert DistributorRetired();
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt != 0 || e.proposedAt == 0 || e.revision != revision || evidenceHash == bytes32(0)) revert InvalidEpoch();
        e.disputed = true; e.reviewed = false;
        emit DisputeFlagged(id, revision, evidenceHash);
    }

    function clearDispute(uint256 id, uint256 revision) external nonReentrant {
        if (msg.sender != reviewer) revert Unauthorized();
        _requireActive();
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt != 0 || !e.disputed || e.revision != revision) revert InvalidEpoch();
        e.disputed = false; e.reviewed = false; e.proposedAt = block.timestamp;
        emit DisputeCleared(id, revision, block.timestamp + REVIEW_DELAY);
    }

    function finalize(uint256 id) external nonReentrant {
        _requireActive();
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt != 0 || e.proposedAt == 0) revert InvalidEpoch();
        if (e.disputed) revert Disputed();
        if (!e.reviewed) revert InvalidEpoch();
        if (block.timestamp < e.proposedAt + REVIEW_DELAY) revert OutsideWindow();
        _solvent();
        e.finalizedAt = block.timestamp;
        epochEmergencyPauseBaseline[id] = _emergencyDuration();
        emit EpochFinalized(id, e.root, claimDeadline(id));
    }

    function leafHash(uint256 id, uint256 index, address payee, uint256 amount) public view returns (bytes32) {
        if (epochs[id].proposedAt == 0) revert InvalidEpoch();
        return keccak256(bytes.concat(keccak256(abi.encode(LEAF_TYPEHASH, CHAIN_ID, address(this), id, index,
            payee, rewardAsset, amount, epochs[id].policyHash))));
    }
    function isClaimed(uint256 id, uint256 index) public view returns (bool) {
        return (claimedBits[id][index >> 8] & (uint256(1) << (index & 255))) != 0;
    }
    function claim(uint256 id, uint256 index, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        _claim(id, index, amount, proof);
    }
    function batchClaim(Claim[] calldata claims) external nonReentrant {
        if (claims.length == 0 || claims.length > 20) revert InvalidProof();
        for (uint256 i; i < claims.length; ++i) _claim(claims[i].epoch, claims[i].index, claims[i].amount, claims[i].proof);
    }
    function _claim(uint256 id, uint256 index, uint256 amount, bytes32[] calldata proof) private {
        _requireActive();
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt == 0 || amount == 0 || index >= e.leafCount) revert InvalidEpoch();
        if (block.timestamp > claimDeadline(id) || claimsPaused(id)) revert OutsideWindow();
        if (isClaimed(id, index)) revert AlreadyClaimed();
        if (amount > e.allocated - e.claimed) revert InvalidEpoch();
        if (proof.length > 32) revert InvalidProof();
        bytes32 hash = leafHash(id, index, msg.sender, amount);
        for (uint256 i; i < proof.length; ++i) hash = hash < proof[i]
            ? keccak256(abi.encodePacked(hash, proof[i])) : keccak256(abi.encodePacked(proof[i], hash));
        if (hash != e.root) revert InvalidProof();
        _solvent();
        claimedBits[id][index >> 8] |= uint256(1) << (index & 255);
        e.claimed += amount; totalReserved -= amount;
        _move(address(this), msg.sender, amount);
        emit RewardClaimed(id, index, msg.sender, amount);
    }

    function _pendingClaimPause(uint256 id, Epoch storage e) private view returns (uint256) {
        return e.pausedAt == 0 ? 0 : block.timestamp - e.pausedAt
            - (_emergencyDuration() - claimPauseEmergencyBaseline[id]);
    }
    function _pauseDuration(uint256 id, Epoch storage e) private view returns (uint256) {
        uint256 pending = _pendingClaimPause(id, e);
        uint256 remaining = MAX_PAUSE - e.pauseUsed;
        return e.pauseUsed + (pending > remaining ? remaining : pending);
    }
    function claimsPaused(uint256 id) public view returns (bool) {
        Epoch storage e = epochs[id];
        return emergencyMode || retired || (e.pausedAt != 0
            && _pendingClaimPause(id, e) < MAX_PAUSE - e.pauseUsed);
    }
    function claimDeadline(uint256 id) public view returns (uint256) {
        Epoch storage e = epochs[id];
        return e.finalizedAt == 0 ? 0 : e.finalizedAt + CLAIM_WINDOW + _pauseDuration(id, e)
            + (_emergencyDuration() - epochEmergencyPauseBaseline[id]);
    }
    function setClaimsPaused(uint256 id, bool paused) external nonReentrant {
        if (msg.sender != guardian) revert Unauthorized();
        _requireActive();
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt == 0 || block.timestamp > claimDeadline(id)) revert InvalidEpoch();
        if (paused) {
            if (e.pausedAt != 0 || e.pauseUsed == MAX_PAUSE) revert InvalidEpoch();
            e.pausedAt = block.timestamp;
            claimPauseEmergencyBaseline[id] = _emergencyDuration();
        } else {
            if (e.pausedAt == 0) revert InvalidEpoch();
            e.pauseUsed = _pauseDuration(id, e); e.pausedAt = 0;
        }
        emit ClaimPauseChanged(id, paused);
    }

    /// @notice Only expired finalized allocations return to their recorded funder. Unfinalized
    ///         earned liabilities cannot be refunded by waiting out a publication deadline.
    function closeExpiredEpoch(uint256 id) external nonReentrant {
        _requireActive();
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt == 0) revert InvalidEpoch();
        if (block.timestamp <= claimDeadline(id)) revert OutsideWindow();
        _solvent();
        uint256 amount = e.allocated - e.claimed;
        e.closed = true; totalReserved -= amount;
        if (amount != 0) _move(address(this), e.funder, amount);
        emit EpochClosed(id, e.funder, amount);
    }
    function _solvent() private view {
        uint256 balance = rewardAsset == address(0)
            ? address(this).balance : IOrbitRewardAsset(rewardAsset).balanceOf(address(this));
        if (balance < totalReserved) revert TransferMismatch();
    }
    function _move(address from, address to, uint256 amount) private {
        if (rewardAsset == address(0)) {
            if (from != address(this)) revert TransferMismatch();
            uint256 beforeBalance = address(this).balance;
            (bool nativeOk,) = payable(to).call{value: amount}("");
            // A contract payee/funder may immediately forward its receipt. Check only our source.
            if (!nativeOk || address(this).balance + amount != beforeBalance) revert TransferMismatch();
            return;
        }
        uint256 fromBefore = IOrbitRewardAsset(rewardAsset).balanceOf(from);
        uint256 toBefore = IOrbitRewardAsset(rewardAsset).balanceOf(to);
        bytes memory callData = from == address(this)
            ? abi.encodeCall(IOrbitRewardAsset.transfer, (to, amount))
            : abi.encodeCall(IOrbitRewardAsset.transferFrom, (from, to, amount));
        (bool ok, bytes memory data) = rewardAsset.call(callData);
        if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert TransferMismatch();
        if (IOrbitRewardAsset(rewardAsset).balanceOf(from) + amount != fromBefore
            || IOrbitRewardAsset(rewardAsset).balanceOf(to) != toBefore + amount) revert TransferMismatch();
    }
}
