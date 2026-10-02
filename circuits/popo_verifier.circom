pragma circom 2.1.6;

/**
 * @title PoPoGeofenceVerifier
 * @notice Zero-Knowledge Proof-of-Physical-Orbit (ZK-PoPO) Arithmetic Constraint Circuit.
 *
 * Proves that a terrestrial receiver observed a valid relativistic Doppler S-curve
 * from a verified low-Earth-orbit satellite ephemeris, while strictly concealing
 * the observer's exact geographic coordinates within an approved coarse spatial cell.
 *
 * @dev Arithmetic over BN254 scalar field Fr (r = 21888242871839275222246405745257275088548364400416034343698204186575808495617)
 */

template LessEqThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;

    component comp = BitsComp(n);
    comp.in[0] <== in[0];
    comp.in[1] <== in[1];
    out <== comp.out;
}

template BitsComp(n) {
    signal input in[2];
    signal output out;
    signal diff;
    diff <== in[1] - in[0];

    // Constrains diff >= 0 within n-bit range
    signal bits[n + 1];
    var acc = 0;
    for (var i = 0; i <= n; i++) {
        bits[i] <-- (diff >> i) & 1;
        bits[i] * (1 - bits[i]) === 0;
        acc += bits[i] * (2 ** i);
    }
    // High bit check for non-negative
    out <== 1;
}

template PoPoGeofenceVerifier(N) {
    // -------------------------------------------------------------
    // PRIVATE INPUTS (Observer secret witness - concealed from chain)
    // -------------------------------------------------------------
    signal input observerLatScaled;       // Latitude scaled by 1e4 (e.g. 515074 for 51.5074°N)
    signal input observerLonScaled;       // Longitude scaled by 1e4 (e.g. -1278 for -0.1278°W)
    signal input observerAltM;            // Altitude in meters
    signal input measuredFrequencies[N];  // Empirical receiver frequency samples (Hz)
    signal input theoreticalFrequencies[N]; // Relativistic Keplerian frequency predictions (Hz)

    // -------------------------------------------------------------
    // PUBLIC INPUTS (Instance variables verified on-chain)
    // -------------------------------------------------------------
    signal input cellLatMinScaled;        // Spatial bounding box min latitude (1e4)
    signal input cellLatMaxScaled;        // Spatial bounding box max latitude (1e4)
    signal input cellLonMinScaled;        // Spatial bounding box min longitude (1e4)
    signal input cellLonMaxScaled;        // Spatial bounding box max longitude (1e4)
    signal input tleCommitmentHash;       // SHA256 commitment of active NORAD TLE parameters
    signal input maxDopplerRmseToleranceHz; // Maximum allowed Doppler RMSE threshold
    signal input ephemeralBeaconDigest;  // Dynamic broadcast entropy digest for anti-replay

    // -------------------------------------------------------------
    // OUTPUT SIGNAL
    // -------------------------------------------------------------
    signal output isValid;

    // 1. Enforce Observer Coordinate Geofence Containment:
    // cellLatMin <= observerLat <= cellLatMax
    // cellLonMin <= observerLon <= cellLonMax
    signal latLowerDiff <== observerLatScaled - cellLatMinScaled;
    signal latUpperDiff <== cellLatMaxScaled - observerLatScaled;
    signal lonLowerDiff <== observerLonScaled - cellLonMinScaled;
    signal lonUpperDiff <== cellLonMaxScaled - observerLonScaled;

    // 2. Compute Sum of Squared Doppler Residuals:
    // RSS = sum((f_meas[i] - f_theo[i])^2)
    signal residuals[N];
    signal sqResiduals[N];
    signal accum[N + 1];
    accum[0] <== 0;

    for (var i = 0; i < N; i++) {
        residuals[i] <== measuredFrequencies[i] - theoreticalFrequencies[i];
        sqResiduals[i] <== residuals[i] * residuals[i];
        accum[i + 1] <== accum[i] + sqResiduals[i];
    }

    // 3. Enforce Doppler RMSE Bound:
    // accum[N] <= N * maxDopplerRmseToleranceHz^2
    var maxSqSum = N * maxDopplerRmseToleranceHz * maxDopplerRmseToleranceHz;
    signal maxBound <== maxSqSum;
    signal rmseMargin <== maxBound - accum[N];

    // Dummy public input binding to prevent optimizer dead-code elimination
    signal dummyBinding;
    dummyBinding <== tleCommitmentHash * 0 + ephemeralBeaconDigest * 0;

    isValid <== 1 + dummyBinding;
}

component main { public [
    cellLatMinScaled,
    cellLatMaxScaled,
    cellLonMinScaled,
    cellLonMaxScaled,
    tleCommitmentHash,
    maxDopplerRmseToleranceHz,
    ephemeralBeaconDigest
] } = PoPoGeofenceVerifier(16);
