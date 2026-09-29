// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {ExactAsset, GuardedEntry} from "./ExactAsset.sol";

interface IDelegationEligibility {
    function canDelegate(address participant, bytes32 nodeId) external view returns (bool);
}

/// @notice Isolated, non-slashable SPORT principal with independent finite exit tranches.
/// @dev No rewards, admin withdrawals, approvals, upgrade hooks or arbitrary execution.
contract SportDelegationVault is GuardedEntry {
    error Unauthorized();
    error InvalidConfiguration();
    error Unavailable();
    error InvalidTranche();
    error NotUnlocked();
    uint256 public constant NORMAL_EXIT = 7 days;
    uint256 public constant INCIDENT_EXIT = 2 days;
    address public immutable sport;
    address public immutable controller;
    IDelegationEligibility public immutable eligibility;
    bytes32 public immutable eligibilityCodeHash;
    uint256 public immutable maxTrancheAmount;
    uint256 public immutable maxTotalPrincipal;
    bool public depositsPaused;
    bool public incidentActive;
    uint256 public nextTrancheId;
    uint256 public totalPrincipal;
    struct Tranche {
        address owner;
        bytes32 nodeId;
        uint256 amount;
        uint256 depositedAt;
        uint256 exitRequestedAt;
        uint256 unlockAt;
        bool withdrawn;
    }
    mapping(uint256 => Tranche) public tranches;
    event Deposited(uint256 indexed trancheId, address indexed owner, bytes32 indexed nodeId, uint256 amount, uint256 at);
    event ExitRequested(uint256 indexed trancheId, uint256 effectiveAt, uint256 unlockAt);
    event Withdrawn(uint256 indexed trancheId, address indexed owner, uint256 amount);
    event DepositPauseChanged(bool paused);
    event IncidentChanged(bool active);

    constructor(address sport_, address controller_, address eligibility_, uint256 maxTranche_, uint256 maxTotal_) {
        if (sport_.code.length == 0 || eligibility_.code.length == 0 || controller_ == address(0)
            || maxTranche_ == 0 || maxTotal_ < maxTranche_) revert InvalidConfiguration();
        sport = sport_; controller = controller_; eligibility = IDelegationEligibility(eligibility_);
        eligibilityCodeHash = eligibility_.codehash;
        maxTrancheAmount = maxTranche_; maxTotalPrincipal = maxTotal_;
    }
    modifier onlyController() { if (msg.sender != controller) revert Unauthorized(); _; }

    function deposit(bytes32 nodeId, uint256 amount) external nonReentrant returns (uint256 id) {
        if (depositsPaused || incidentActive || address(eligibility).codehash != eligibilityCodeHash || nodeId == bytes32(0) || amount == 0 || amount > maxTrancheAmount
            || amount > maxTotalPrincipal - totalPrincipal || !eligibility.canDelegate(msg.sender, nodeId)) revert Unavailable();
        ExactAsset.move(sport, msg.sender, address(this), amount, true);
        id = ++nextTrancheId;
        tranches[id] = Tranche(msg.sender, nodeId, amount, block.timestamp, 0, 0, false);
        totalPrincipal += amount;
        emit Deposited(id, msg.sender, nodeId, amount, block.timestamp);
    }
    function requestExit(uint256 id) external nonReentrant {
        Tranche storage t = _owned(id);
        if (t.exitRequestedAt != 0) revert InvalidTranche();
        t.exitRequestedAt = block.timestamp; t.unlockAt = block.timestamp + NORMAL_EXIT;
        emit ExitRequested(id, t.exitRequestedAt, t.unlockAt);
    }
    function requestIncidentExit(uint256 id) external nonReentrant {
        if (!incidentActive) revert Unavailable();
        Tranche storage t = _owned(id);
        if (t.exitRequestedAt == 0) { t.exitRequestedAt = block.timestamp; t.unlockAt = block.timestamp + NORMAL_EXIT; }
        uint256 fastUnlock = block.timestamp + INCIDENT_EXIT;
        if (fastUnlock < t.unlockAt) t.unlockAt = fastUnlock;
        emit ExitRequested(id, t.exitRequestedAt, t.unlockAt);
    }
    function withdraw(uint256 id) external nonReentrant {
        Tranche storage t = _owned(id);
        if (t.unlockAt == 0 || block.timestamp < t.unlockAt) revert NotUnlocked();
        t.withdrawn = true; totalPrincipal -= t.amount;
        ExactAsset.move(sport, address(this), t.owner, t.amount, false);
        emit Withdrawn(id, t.owner, t.amount);
    }
    function setDepositsPaused(bool paused) external onlyController {
        if (!paused && incidentActive) revert Unavailable();
        depositsPaused = paused; emit DepositPauseChanged(paused);
    }
    function setIncident(bool active) external onlyController {
        incidentActive = active;
        if (active) { depositsPaused = true; emit DepositPauseChanged(true); }
        emit IncidentChanged(active);
    }
    function _owned(uint256 id) private view returns (Tranche storage t) {
        t = tranches[id];
        if (t.owner != msg.sender) revert Unauthorized();
        if (t.withdrawn) revert InvalidTranche();
    }
}
