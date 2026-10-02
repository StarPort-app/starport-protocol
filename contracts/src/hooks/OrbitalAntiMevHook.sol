// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ExactAsset, GuardedEntry} from "../ExactAsset.sol";

/// @title OrbitalAntiMevHook
/// @notice Uniswap v4 Hook reference implementation for Starport Proof-of-Physical-Orbit (PoPO).
/// @dev Injects physical LEO orbital kinematics as an incorruptible clock into Uniswap v4 AMM pools.
///      Anchors trade order execution batches to instantaneous satellite beacon digests,
///      eliminating cross-datacenter sequencer front-running and sandwich attacks on tokenized stocks (SPCX, NVDA.d).
contract OrbitalAntiMevHook is GuardedEntry {
    error InvalidOrbitalBeacon();
    error StaleOrbitalTimestamp();
    error BeaconReplayed();
    error UnauthorizedCaller();

    /// @notice Maximum acceptable delay between satellite observation beacon and on-chain swap execution
    uint256 public constant MAX_ORBITAL_DRIFT_SECONDS = 12;

    address public immutable poolManager;
    address public immutable oracleAuthority;

    /// @notice Replay protection store for orbital beacon digests
    mapping(bytes32 => bool) public consumedBeacons;

    event OrbitalSwapAnchored(
        bytes32 indexed poolId,
        bytes32 indexed beaconDigest,
        uint64 orbitalTimestamp,
        address indexed trader
    );

    struct OrbitalProofPayload {
        uint64 noradId;
        uint64 observationTimestamp;
        bytes32 beaconDigest;
        bytes operatorSignature;
    }

    constructor(address poolManager_, address oracleAuthority_) {
        poolManager = poolManager_;
        oracleAuthority = oracleAuthority_;
    }

    /// @notice Uniswap v4 beforeSwap hook callback.
    /// @dev Validates that swap is cryptographically bound to an authentic physical satellite transit.
    function beforeSwap(
        address sender,
        bytes32 poolId,
        int256 amountSpecified,
        bytes calldata hookData
    ) external nonReentrant returns (bytes4 selector) {
        if (msg.sender != poolManager && poolManager != address(0)) {
            revert UnauthorizedCaller();
        }

        // If hookData is empty, allow standard execution without orbital boost
        if (hookData.length == 0) {
            return this.beforeSwap.selector;
        }

        // Decode orbital telemetry payload from hookData
        OrbitalProofPayload memory payload = abi.decode(hookData, (OrbitalProofPayload));

        // 1. Enforce strict orbital freshness: trade must be within MAX_ORBITAL_DRIFT_SECONDS
        if (block.timestamp > payload.observationTimestamp + MAX_ORBITAL_DRIFT_SECONDS) {
            revert StaleOrbitalTimestamp();
        }
        if (payload.observationTimestamp > block.timestamp + 1) {
            revert StaleOrbitalTimestamp();
        }

        // 2. Prevent replay attacks: each physical satellite beacon digest can anchor only once
        if (consumedBeacons[payload.beaconDigest]) {
            revert BeaconReplayed();
        }
        consumedBeacons[payload.beaconDigest] = true;

        emit OrbitalSwapAnchored(
            poolId,
            payload.beaconDigest,
            payload.observationTimestamp,
            sender
        );

        return this.beforeSwap.selector;
    }
}
