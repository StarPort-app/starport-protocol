// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ExactAsset, GuardedEntry} from "./ExactAsset.sol";

/// @title OrbitStakeVault
/// @notice Pure, segregated, non-slashable principal custody vault for Starport Orbit Earn.
/// @dev 100% Non-Custodial: Zero administrator withdrawals, zero migration transfer hooks,
///      zero custody rescue backdoors, and zero principal slashing.
///      Only the position owner can withdraw their principal after the timelock expires.
contract OrbitStakeVault is GuardedEntry {
    error Unauthorized();
    error InvalidConfiguration();
    error Unavailable();
    error InvalidPosition();
    error NotUnlocked();
    error CapacityExceeded();

    uint256 public constant CHAIN_ID = 4663;
    uint64 public constant EXIT_DELAY = 2 days;             // 48-hour standard unbonding
    uint64 public constant EMERGENCY_EXIT_DELAY = 6 hours;   // 6-hour rapid exit during emergency
    uint64 public constant CAPACITY_TIMELOCK = 1 days;       // 24-hour timelock for capacity expansion

    bytes32 public constant FORECAST = keccak256("orbit_forecast");
    bytes32 public constant CATALOG = keccak256("catalog_watch");
    bytes32 public constant REVIEW = keccak256("orbit_review");

    struct Position {
        address owner;
        bytes32 pool;
        uint256 principal;
        uint64 depositedAt;
        uint64 exitRequestedAt;
        uint64 unlockAt;
        bool withdrawn;
    }

    struct CapacityProposal {
        uint256 newCapacity;
        uint64 executableAt;
    }

    address public immutable asset;
    address public immutable controller;

    bool public paused;
    bool public emergencyActive;

    uint256 public totalPrincipal;
    uint256 public nextPositionId;

    mapping(bytes32 => Position) public positions;
    mapping(bytes32 => uint256) public poolPrincipal;
    mapping(bytes32 => uint256) public poolCapacity;
    mapping(bytes32 => CapacityProposal) public pendingCapacity;

    event Deposited(bytes32 indexed positionId, address indexed owner, bytes32 indexed pool, uint256 amount, uint64 at);
    event ExitRequested(bytes32 indexed positionId, uint64 requestedAt, uint64 unlockAt);
    event EmergencyExitRequested(bytes32 indexed positionId, uint64 requestedAt, uint64 unlockAt);
    event Withdrawn(bytes32 indexed positionId, address indexed owner, uint256 amount);
    event PauseUpdated(bool paused);
    event EmergencyUpdated(bool active);
    event CapacityProposed(bytes32 indexed pool, uint256 newCapacity, uint64 executableAt);
    event CapacityUpdated(bytes32 indexed pool, uint256 newCapacity);

    constructor(address asset_, address controller_, uint256 forecastCap_, uint256 catalogCap_, uint256 reviewCap_) {
        if (asset_ == address(0) || controller_ == address(0)) revert InvalidConfiguration();
        asset = asset_;
        controller = controller_;
        poolCapacity[FORECAST] = forecastCap_;
        poolCapacity[CATALOG] = catalogCap_;
        poolCapacity[REVIEW] = reviewCap_;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    /// @notice Deposits SPORT principal into a verified Orbit Earn service pool.
    function deposit(bytes32 pool, uint256 amount) external nonReentrant returns (bytes32 positionId) {
        if (paused || emergencyActive) revert Unavailable();
        if (pool != FORECAST && pool != CATALOG && pool != REVIEW) revert InvalidConfiguration();
        if (amount == 0) revert InvalidConfiguration();

        uint256 cap = poolCapacity[pool];
        if (poolPrincipal[pool] + amount > cap) revert CapacityExceeded();

        // Exact balance delta transfer prevents fee-on-transfer / rebasing manipulation
        ExactAsset.move(asset, msg.sender, address(this), amount, true);

        uint256 id = ++nextPositionId;
        positionId = keccak256(abi.encodePacked(block.chainid, address(this), msg.sender, id));

        positions[positionId] = Position({
            owner: msg.sender,
            pool: pool,
            principal: amount,
            depositedAt: uint64(block.timestamp),
            exitRequestedAt: 0,
            unlockAt: 0,
            withdrawn: false
        });

        poolPrincipal[pool] += amount;
        totalPrincipal += amount;

        emit Deposited(positionId, msg.sender, pool, amount, uint64(block.timestamp));
    }

    /// @notice Initiates standard 48-hour unbonding cooldown for a position.
    function requestExit(bytes32 positionId) external nonReentrant {
        Position storage pos = _owned(positionId);
        if (pos.exitRequestedAt != 0) revert InvalidPosition();

        uint64 unlock = uint64(block.timestamp) + EXIT_DELAY;
        pos.exitRequestedAt = uint64(block.timestamp);
        pos.unlockAt = unlock;

        emit ExitRequested(positionId, pos.exitRequestedAt, unlock);
    }

    /// @notice Initiates rapid 6-hour unbonding cooldown when emergency mode is active.
    function requestEmergencyExit(bytes32 positionId) external nonReentrant {
        if (!emergencyActive) revert Unavailable();
        Position storage pos = _owned(positionId);

        uint64 fastUnlock = uint64(block.timestamp) + EMERGENCY_EXIT_DELAY;
        if (pos.exitRequestedAt == 0) {
            pos.exitRequestedAt = uint64(block.timestamp);
            pos.unlockAt = fastUnlock;
        } else if (fastUnlock < pos.unlockAt) {
            pos.unlockAt = fastUnlock;
        }

        emit EmergencyExitRequested(positionId, pos.exitRequestedAt, pos.unlockAt);
    }

    /// @notice Withdraws 100% of delegated principal back to the owner after unlockAt.
    /// @dev Zero slashing penalty on delegator principal under any circumstances.
    function withdraw(bytes32 positionId) external nonReentrant {
        Position storage pos = _owned(positionId);
        if (pos.unlockAt == 0 || block.timestamp < pos.unlockAt) revert NotUnlocked();

        uint256 principal = pos.principal;
        pos.withdrawn = true;
        poolPrincipal[pos.pool] -= principal;
        totalPrincipal -= principal;

        // Moves exact amount directly back to the original depositor
        ExactAsset.move(asset, address(this), pos.owner, principal, false);

        emit Withdrawn(positionId, pos.owner, principal);
    }

    /// @notice Controller pauses deposits during infrastructure maintenance.
    function setPaused(bool paused_) external onlyController {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    /// @notice Controller declares emergency mode, enabling the 6-hour rapid exit window.
    function setEmergency(bool active_) external onlyController {
        emergencyActive = active_;
        if (active_) {
            paused = true;
            emit PauseUpdated(true);
        }
        emit EmergencyUpdated(active_);
    }

    /// @notice Proposes a new capacity ceiling subject to a 24-hour timelock.
    function proposeCapacity(bytes32 pool, uint256 newCapacity) external onlyController {
        if (pool != FORECAST && pool != CATALOG && pool != REVIEW) revert InvalidConfiguration();
        uint64 executableAt = uint64(block.timestamp) + CAPACITY_TIMELOCK;
        pendingCapacity[pool] = CapacityProposal({
            newCapacity: newCapacity,
            executableAt: executableAt
        });
        emit CapacityProposed(pool, newCapacity, executableAt);
    }

    /// @notice Executes a proposed capacity change after the 24-hour timelock has elapsed.
    function executeCapacity(bytes32 pool) external onlyController {
        CapacityProposal memory prop = pendingCapacity[pool];
        if (prop.executableAt == 0 || block.timestamp < prop.executableAt) revert NotUnlocked();

        poolCapacity[pool] = prop.newCapacity;
        delete pendingCapacity[pool];

        emit CapacityUpdated(pool, prop.newCapacity);
    }

    function _owned(bytes32 positionId) private view returns (Position storage pos) {
        pos = positions[positionId];
        if (pos.owner != msg.sender) revert Unauthorized();
        if (pos.withdrawn) revert InvalidPosition();
    }
}
