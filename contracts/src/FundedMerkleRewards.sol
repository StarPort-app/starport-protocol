// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {ExactAsset, GuardedEntry} from "./ExactAsset.sol";

interface IRewardEligibility {
    function canClaim(address participant, uint256 epochId, bytes32 policyHash) external view returns (bool);
}

/// @notice Actually funded, per-epoch rewards. No mint, yield promise or access to delegated principal.
/// @dev Publisher and independent reviewer are trusted for allocation correctness and eligibility policy.
contract FundedMerkleRewards is GuardedEntry {
    error Unauthorized();
    error InvalidConfiguration();
    error InvalidEpoch();
    error OutsideWindow();
    error InvalidProof();
    error AlreadyClaimed();
    error Ineligible();
    error Challenged();
    uint256 public constant EPOCH_SECONDS = 3 days;
    uint256 public constant PROPOSAL_WINDOW = 2 days;
    uint256 public constant REVIEW_DELAY = 3 days;
    uint256 public constant FINALIZATION_WINDOW = 14 days;
    uint256 public constant CLAIM_WINDOW = 90 days;
    uint256 public constant MAX_PAUSE = 7 days;
    address public immutable rewardAsset;
    address public immutable publisher;
    address public immutable reviewer;
    address public immutable fundingAuthority;
    uint256 public immutable maxEpochBudget;
    IRewardEligibility public immutable eligibility;
    bytes32 public immutable eligibilityCodeHash;
    uint256 public immutable firstEpochStart;
    uint256 public totalReserved;
    struct Epoch {
        address funder;
        uint256 funded;
        uint256 allocated;
        uint256 claimed;
        bytes32 policyHash;
        bytes32 root;
        bytes32 manifestHash;
        uint256 proposedAt;
        uint256 finalizedAt;
        uint256 pausedAt;
        uint256 pauseUsed;
        bool reviewed;
        bool closed;
    }
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(uint256 => uint256)) private claimedBits;
    mapping(uint256 => bool) public epochDisputed;
    mapping(uint256 => bytes32) public epochChallengeEvidence;
    uint256 public immutable challengeBond;
    mapping(uint256 => address) public epochChallenger;
    mapping(uint256 => uint256) public epochChallengeBond;
    event EpochFunded(uint256 indexed id, address indexed funder, uint256 amount, bytes32 policyHash);
    event RootProposed(uint256 indexed id, bytes32 root, bytes32 manifestHash, uint256 allocated, uint256 reviewEndsAt);
    event RootReviewed(uint256 indexed id, bytes32 root, bool approved);
    event RootChallenged(uint256 indexed id, address indexed challenger, bytes32 evidenceHash);
    event ChallengeResolved(uint256 indexed id, bool cleared);
    event ChallengeBondSlashed(uint256 indexed id, address indexed challenger, uint256 amount);
    event ChallengeBondRefunded(uint256 indexed id, address indexed challenger, uint256 amount);
    event EpochFinalized(uint256 indexed id, bytes32 root, uint256 deadline);
    event RewardClaimed(uint256 indexed id, uint256 indexed index, address indexed participant, uint256 amount);
    event ClaimPauseChanged(uint256 indexed id, bool paused);
    event EpochClosed(uint256 indexed id, address indexed funder, uint256 returned);

    constructor(address asset_, address publisher_, address reviewer_, address eligibility_, uint256 start_, address funder_, uint256 budgetCap_, uint256 bond_) {
        if (asset_.code.length == 0 || eligibility_.code.length == 0 || publisher_ == address(0)
            || reviewer_ == address(0) || publisher_ == reviewer_ || start_ <= block.timestamp
            || funder_ == address(0) || funder_ == address(this) || budgetCap_ == 0 || bond_ == 0) revert InvalidConfiguration();
        rewardAsset = asset_; publisher = publisher_; reviewer = reviewer_;
        eligibility = IRewardEligibility(eligibility_); firstEpochStart = start_;
        eligibilityCodeHash = eligibility_.codehash;
        fundingAuthority = funder_; maxEpochBudget = budgetCap_;
        challengeBond = bond_;
    }
    function epochStart(uint256 id) public view returns (uint256) { return firstEpochStart + id * EPOCH_SECONDS; }
    function epochEnd(uint256 id) public view returns (uint256) { return epochStart(id) + EPOCH_SECONDS; }
    function fundEpoch(uint256 id, uint256 amount, bytes32 policyHash) external nonReentrant {
        if (msg.sender != fundingAuthority) revert Unauthorized();
        Epoch storage e = epochs[id];
        if (e.funded != 0 || amount == 0 || amount > maxEpochBudget || policyHash == bytes32(0)
            || block.timestamp >= epochStart(id)) revert InvalidEpoch();
        ExactAsset.move(rewardAsset, msg.sender, address(this), amount, true);
        e.funder = msg.sender; e.funded = amount; e.policyHash = policyHash; totalReserved += amount;
        emit EpochFunded(id, msg.sender, amount, policyHash);
    }
    function proposeRoot(uint256 id, bytes32 root, bytes32 manifestHash, uint256 allocated) external {
        if (msg.sender != publisher) revert Unauthorized();
        Epoch storage e = epochs[id];
        uint256 end = epochEnd(id);
        if (block.timestamp < end || block.timestamp > end + PROPOSAL_WINDOW) revert OutsideWindow();
        if (e.closed || e.funded == 0 || e.finalizedAt != 0 || root == bytes32(0) || manifestHash == bytes32(0)
            || allocated == 0 || allocated > e.funded) revert InvalidEpoch();
        e.root = root; e.manifestHash = manifestHash; e.allocated = allocated;
        e.proposedAt = block.timestamp; e.reviewed = false;
        emit RootProposed(id, root, manifestHash, allocated, block.timestamp + REVIEW_DELAY);
    }
    function reviewRoot(uint256 id, bytes32 expectedRoot, bytes32 expectedManifest, uint256 expectedAllocated, bool approved) external {
        if (msg.sender != reviewer) revert Unauthorized();
        Epoch storage e = epochs[id];
        if (e.closed || e.proposedAt == 0 || e.finalizedAt != 0 || expectedRoot != e.root
            || expectedManifest != e.manifestHash || expectedAllocated != e.allocated
            || block.timestamp > epochEnd(id) + FINALIZATION_WINDOW) revert InvalidEpoch();
        e.reviewed = approved; emit RootReviewed(id, e.root, approved);
    }
    /// @dev A public evidence notice and dispute gate: halts finalization until resolved by independent reviewer.
    /// Strictly requires depositing challengeBond to prevent frivolous or griefing denial-of-service.
    function challengeRoot(uint256 id, bytes32 evidenceHash) external nonReentrant {
        Epoch storage e = epochs[id];
        if (e.closed || e.proposedAt == 0 || e.finalizedAt != 0 || evidenceHash == bytes32(0)
            || epochDisputed[id] || block.timestamp > epochEnd(id) + FINALIZATION_WINDOW) revert InvalidEpoch();
        ExactAsset.move(rewardAsset, msg.sender, address(this), challengeBond, true);
        epochChallenger[id] = msg.sender;
        epochChallengeBond[id] = challengeBond;
        epochDisputed[id] = true;
        epochChallengeEvidence[id] = evidenceHash;
        emit RootChallenged(id, msg.sender, evidenceHash);
    }
    /// @notice Allows the independent reviewer to explicitly clear or uphold a challenge after offchain evidence review.
    /// Slashes the bond to the epoch funder if the challenge is dismissed as spam; refunds the bond if upheld.
    function resolveChallenge(uint256 id, bool clearDispute) external nonReentrant {
        if (msg.sender != reviewer) revert Unauthorized();
        Epoch storage e = epochs[id];
        if (e.closed || e.proposedAt == 0 || e.finalizedAt != 0 || !epochDisputed[id]) revert InvalidEpoch();
        epochDisputed[id] = !clearDispute;
        uint256 bond = epochChallengeBond[id];
        address challenger = epochChallenger[id];
        delete epochChallengeBond[id];
        delete epochChallenger[id];
        if (bond != 0) {
            if (clearDispute) {
                // Spam challenge dismissed: bond is slashed and credited to the epoch funder
                ExactAsset.move(rewardAsset, address(this), e.funder, bond, false);
                emit ChallengeBondSlashed(id, challenger, bond);
            } else {
                // Challenge upheld: bond refunded in full to challenger
                ExactAsset.move(rewardAsset, address(this), challenger, bond, false);
                emit ChallengeBondRefunded(id, challenger, bond);
            }
        }
        emit ChallengeResolved(id, clearDispute);
    }
    function finalize(uint256 id) external {
        Epoch storage e = epochs[id];
        if (e.closed || !e.reviewed || e.proposedAt == 0 || e.finalizedAt != 0) revert InvalidEpoch();
        if (epochDisputed[id]) revert Challenged();
        if (block.timestamp < e.proposedAt + REVIEW_DELAY || block.timestamp > epochEnd(id) + FINALIZATION_WINDOW) revert OutsideWindow();
        e.finalizedAt = block.timestamp;
        emit EpochFinalized(id, e.root, claimDeadline(id));
    }
    function leafHash(uint256 id, uint256 index, address participant, uint256 amount) public view returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(block.chainid, address(this), id, index, participant, rewardAsset, amount, epochs[id].policyHash))));
    }
    function isClaimed(uint256 id, uint256 index) public view returns (bool) {
        return claimedBits[id][index >> 8] & (uint256(1) << (index & 255)) != 0;
    }
    function claim(uint256 id, uint256 index, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt == 0 || amount == 0 || amount > e.allocated - e.claimed) revert InvalidEpoch();
        if (block.timestamp > claimDeadline(id) || claimsPaused(id)) revert OutsideWindow();
        if (isClaimed(id, index)) revert AlreadyClaimed();
        if (proof.length > 32) revert InvalidProof();
        bytes32 hash = leafHash(id, index, msg.sender, amount);
        for (uint256 i; i < proof.length; ++i) hash = hash < proof[i]
            ? keccak256(abi.encodePacked(hash, proof[i])) : keccak256(abi.encodePacked(proof[i], hash));
        if (hash != e.root) revert InvalidProof();
        if (address(eligibility).codehash != eligibilityCodeHash || !eligibility.canClaim(msg.sender, id, e.policyHash)) revert Ineligible();
        claimedBits[id][index >> 8] |= uint256(1) << (index & 255);
        e.claimed += amount; totalReserved -= amount;
        ExactAsset.move(rewardAsset, address(this), msg.sender, amount, false);
        emit RewardClaimed(id, index, msg.sender, amount);
    }
    function claimsPaused(uint256 id) public view returns (bool) {
        Epoch storage e = epochs[id];
        return e.pausedAt != 0 && block.timestamp < e.pausedAt + (MAX_PAUSE - e.pauseUsed);
    }
    function _pauseDuration(Epoch storage e) private view returns (uint256) {
        uint256 pending = e.pausedAt == 0 ? 0 : block.timestamp - e.pausedAt;
        uint256 remaining = MAX_PAUSE - e.pauseUsed;
        return e.pauseUsed + (pending > remaining ? remaining : pending);
    }
    function claimDeadline(uint256 id) public view returns (uint256) {
        Epoch storage e = epochs[id];
        return e.finalizedAt == 0 ? 0 : e.finalizedAt + CLAIM_WINDOW + _pauseDuration(e);
    }
    function setClaimsPaused(uint256 id, bool paused) external {
        if (msg.sender != reviewer) revert Unauthorized();
        Epoch storage e = epochs[id];
        if (e.closed || e.finalizedAt == 0 || block.timestamp > claimDeadline(id)) revert InvalidEpoch();
        if (paused) {
            if (e.pausedAt != 0 || e.pauseUsed == MAX_PAUSE) revert InvalidEpoch();
            e.pausedAt = block.timestamp;
        } else {
            if (e.pausedAt == 0) revert InvalidEpoch();
            e.pauseUsed = _pauseDuration(e); e.pausedAt = 0;
        }
        emit ClaimPauseChanged(id, paused);
    }
    function closeEpoch(uint256 id) external nonReentrant {
        Epoch storage e = epochs[id];
        if (e.closed || e.funded == 0) revert InvalidEpoch();
        uint256 deadline = e.finalizedAt == 0 ? epochEnd(id) + FINALIZATION_WINDOW : claimDeadline(id);
        if (block.timestamp <= deadline) revert OutsideWindow();
        e.closed = true;
        uint256 bond = epochChallengeBond[id];
        if (bond != 0) {
            address challenger = epochChallenger[id];
            delete epochChallengeBond[id];
            delete epochChallenger[id];
            ExactAsset.move(rewardAsset, address(this), challenger, bond, false);
            emit ChallengeBondRefunded(id, challenger, bond);
        }
        uint256 remaining = e.funded - e.claimed; totalReserved -= remaining;
        if (remaining != 0) ExactAsset.move(rewardAsset, address(this), e.funder, remaining, false);
        emit EpochClosed(id, e.funder, remaining);
    }
}
