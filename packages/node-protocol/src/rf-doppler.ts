import { verifyOperatorSignature } from './keys.js';

export interface RfDopplerSample {
  readonly timestampMs: number;
  readonly measuredFrequencyHz: number;
  readonly signalToNoiseRatioDb: number;
}

export interface RfDopplerProof {
  readonly noradId: number;
  readonly observerLat: number;
  readonly observerLon: number;
  readonly observerAltM: number;
  readonly centerFrequencyHz: number;
  readonly samples: readonly RfDopplerSample[];
  readonly observerNodeId: string;
  readonly operatorPublicKey?: string;
  readonly operatorSignature: string;
}

export interface ObserverEcef {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TwoLineElement {
  readonly satelliteNumber: number;
  readonly classification: string;
  readonly internationalDesignator: string;
  readonly epochYear: number;
  readonly epochDay: number;
  readonly meanMotionFirstDerivative: number;
  readonly bstarDrag: number;
  readonly inclinationDeg: number;
  readonly raanDeg: number;
  readonly eccentricity: number;
  readonly argumentOfPerigeeDeg: number;
  readonly meanAnomalyDeg: number;
  readonly meanMotionRevsPerDay: number;
  readonly revolutionNumber: number;
  readonly semiMajorAxisM: number;
  readonly epochTimestampMs: number;
}

export interface EphemerisData {
  readonly epochMs: number;
  readonly inclinationDeg: number;
  readonly semiMajorAxisM: number;
  readonly raanDeg?: number;
}

export interface RfDopplerVerificationResult {
  readonly valid: boolean;
  readonly verifiedRfPass: boolean;
  readonly noradId?: number;
  readonly measuredDopplerSpanHz?: number;
  readonly durationSeconds?: number;
  readonly observerEcef?: ObserverEcef;
  readonly maxElevationDeg?: number;
  readonly estimatedSlantRangeM?: number;
  readonly dopplerRmseHz?: number;
  readonly reason?: string;
}

export interface MultiStationVerificationResult {
  readonly valid: boolean;
  readonly stationCount: number;
  readonly baselineDistanceKm: number;
  readonly observedTimeDifferenceSec: number;
  readonly theoreticalTimeDifferenceSec: number;
  readonly tdoaResidualSec: number;
  readonly passConsensusVerified: boolean;
  readonly reason?: string;
}

export interface RfVerificationOptions {
  readonly minSamples?: number;
  readonly minSnrDb?: number;
  readonly maxPassDurationMs?: number;
  readonly minPassDurationMs?: number;
  readonly minElevationDeg?: number;
  readonly maxDopplerToleranceHz?: number;
  readonly operatorPublicKey?: string;
  readonly requireSignature?: boolean;
  readonly ephemeris?: EphemerisData;
  readonly tle?: TwoLineElement;
}

const SPEED_OF_LIGHT = 299_792_458; // m/s
const GM_EARTH = 3.986004418e14; // m^3 / s^2 (standard gravitational parameter)
const EARTH_RADIUS_M = 6_371_000; // mean Earth radius
const EARTH_ROTATION_RATE_RAD_PER_SEC = 7.2921159e-5; // rad/s (WGS84 Earth angular rotation)
const STARLINK_ORBIT_ALT_M = 550_000; // nominal 550km Starlink orbital shell
const STARLINK_ORBIT_RADIUS_M = EARTH_RADIUS_M + STARLINK_ORBIT_ALT_M;
const STARLINK_ORBITAL_VELOCITY = Math.sqrt(GM_EARTH / STARLINK_ORBIT_RADIUS_M); // ~7587.8 m/s

export function computeObserverEcef(latDeg: number, lonDeg: number, altM: number = 0): ObserverEcef {
  const latRad = (latDeg * Math.PI) / 180;
  const lonRad = (lonDeg * Math.PI) / 180;
  const r = EARTH_RADIUS_M + altM;
  return {
    x: r * Math.cos(latRad) * Math.cos(lonRad),
    y: r * Math.cos(latRad) * Math.sin(lonRad),
    z: r * Math.sin(latRad),
  };
}

export function getCanonicalDopplerBytes(p: Partial<RfDopplerProof>): Uint8Array {
  const payload = {
    centerFrequencyHz: p.centerFrequencyHz,
    noradId: p.noradId,
    observerAltM: p.observerAltM ?? 0,
    observerLat: p.observerLat,
    observerLon: p.observerLon,
    observerNodeId: p.observerNodeId ?? '',
    samples: p.samples?.map(s => ({
      measuredFrequencyHz: s.measuredFrequencyHz,
      signalToNoiseRatioDb: s.signalToNoiseRatioDb,
      timestampMs: s.timestampMs,
    }))
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

/**
 * Parses standard NORAD Two-Line Element (TLE) format for orbital propagation.
 */
export function parseTwoLineElement(line1: string, line2: string): TwoLineElement {
  const l1 = line1.trim();
  const l2 = line2.trim();
  if (!l1.startsWith('1 ') || !l2.startsWith('2 ') || l1.length < 68 || l2.length < 68) {
    throw new Error('Invalid TLE format: expected standard 69-character Two-Line Element lines');
  }

  const satNum1 = parseInt(l1.substring(2, 7).trim(), 10);
  const satNum2 = parseInt(l2.substring(2, 7).trim(), 10);
  if (satNum1 !== satNum2) throw new Error('Mismatched satellite numbers in TLE lines');

  const classification = l1.charAt(7);
  const intlDesignator = l1.substring(9, 17).trim();
  const rawYear = parseInt(l1.substring(18, 20).trim(), 10);
  const epochYear = rawYear < 57 ? 2000 + rawYear : 1900 + rawYear;
  const epochDay = parseFloat(l1.substring(20, 32).trim());
  const meanMotionDot = parseFloat(l1.substring(33, 43).trim());

  const bstarStr = l1.substring(53, 61).trim();
  let bstar = 0;
  if (bstarStr) {
    const mantissa = parseFloat(bstarStr.slice(0, -2)) * 1e-5;
    const exp = parseInt(bstarStr.slice(-2), 10);
    bstar = mantissa * Math.pow(10, exp);
  }

  const inclinationDeg = parseFloat(l2.substring(8, 16).trim());
  const raanDeg = parseFloat(l2.substring(17, 25).trim());
  const eccentricity = parseFloat('0.' + l2.substring(26, 33).trim());
  const argPerigeeDeg = parseFloat(l2.substring(34, 42).trim());
  const meanAnomalyDeg = parseFloat(l2.substring(43, 51).trim());
  const meanMotionRpd = parseFloat(l2.substring(52, 63).trim());
  const revolutionNumber = parseInt(l2.substring(63, 68).trim(), 10);

  const nRadPerSec = (meanMotionRpd * 2 * Math.PI) / 86400;
  const a = Math.cbrt(GM_EARTH / (nRadPerSec * nRadPerSec));

  const yearStart = Date.UTC(epochYear, 0, 1, 0, 0, 0, 0);
  const epochTimestampMs = Math.round(yearStart + (epochDay - 1) * 86_400_000);

  return {
    satelliteNumber: satNum1,
    classification,
    internationalDesignator: intlDesignator,
    epochYear,
    epochDay,
    meanMotionFirstDerivative: meanMotionDot,
    bstarDrag: bstar,
    inclinationDeg,
    raanDeg,
    eccentricity,
    argumentOfPerigeeDeg: argPerigeeDeg,
    meanAnomalyDeg,
    meanMotionRevsPerDay: meanMotionRpd,
    revolutionNumber,
    semiMajorAxisM: a,
    epochTimestampMs,
  };
}

/**
 * Propagates instantaneous Keplerian orbit state vector in Earth-Centered Earth-Fixed (ECEF) coordinates.
 */
export function propagateTleState(tle: TwoLineElement, timestampMs: number): { positionEcef: ObserverEcef; velocityEcef: ObserverEcef } {
  const dtSec = (timestampMs - tle.epochTimestampMs) / 1000;
  const n = (tle.meanMotionRevsPerDay * 2 * Math.PI) / 86400;
  const e = tle.eccentricity;
  const a = tle.semiMajorAxisM;

  // Mean anomaly at timestamp
  let m = ((tle.meanAnomalyDeg * Math.PI) / 180 + n * dtSec) % (2 * Math.PI);
  if (m < 0) m += 2 * Math.PI;

  // Solve Kepler's equation E - e*sin(E) = M via Newton-Raphson iteration
  let ea = m;
  for (let iter = 0; iter < 5; iter++) {
    const f = ea - e * Math.sin(ea) - m;
    const fPrime = 1 - e * Math.cos(ea);
    ea -= f / fPrime;
  }

  // True anomaly
  const sinNu = (Math.sqrt(1 - e * e) * Math.sin(ea)) / (1 - e * Math.cos(ea));
  const cosNu = (Math.cos(ea) - e) / (1 - e * Math.cos(ea));
  const nu = Math.atan2(sinNu, cosNu);

  const r = a * (1 - e * Math.cos(ea));
  const h = Math.sqrt(GM_EARTH * a * (1 - e * e));

  // Orbital plane position and velocity
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);
  const vxOrb = -(GM_EARTH / h) * Math.sin(nu);
  const vyOrb = (GM_EARTH / h) * (e + Math.cos(nu));

  // Transformation from orbital plane to ECI frame
  const omega = (tle.argumentOfPerigeeDeg * Math.PI) / 180;
  const inc = (tle.inclinationDeg * Math.PI) / 180;
  const raan = (tle.raanDeg * Math.PI) / 180;

  const px = Math.cos(raan) * Math.cos(omega) - Math.sin(raan) * Math.sin(omega) * Math.cos(inc);
  const py = Math.sin(raan) * Math.cos(omega) + Math.cos(raan) * Math.sin(omega) * Math.cos(inc);
  const pz = Math.sin(omega) * Math.sin(inc);

  const qx = -Math.cos(raan) * Math.sin(omega) - Math.sin(raan) * Math.cos(omega) * Math.cos(inc);
  const qy = -Math.sin(raan) * Math.sin(omega) + Math.cos(raan) * Math.cos(omega) * Math.cos(inc);
  const qz = Math.cos(omega) * Math.sin(inc);

  const xEci = xOrb * px + yOrb * qx;
  const yEci = xOrb * py + yOrb * qy;
  const zEci = xOrb * pz + yOrb * qz;

  const vxEci = vxOrb * px + vyOrb * qx;
  const vyEci = vxOrb * py + vyOrb * qy;
  const vzEci = vxOrb * pz + vyOrb * qz;

  // Transform from ECI to ECEF frame (Earth rotation)
  const thetaGst = (EARTH_ROTATION_RATE_RAD_PER_SEC * dtSec) % (2 * Math.PI);
  const cosTheta = Math.cos(thetaGst);
  const sinTheta = Math.sin(thetaGst);

  const xEcef = xEci * cosTheta + yEci * sinTheta;
  const yEcef = -xEci * sinTheta + yEci * cosTheta;
  const zEcef = zEci;

  const vxEcef = (vxEci + EARTH_ROTATION_RATE_RAD_PER_SEC * yEci) * cosTheta + (vyEci - EARTH_ROTATION_RATE_RAD_PER_SEC * xEci) * sinTheta;
  const vyEcef = -(vxEci + EARTH_ROTATION_RATE_RAD_PER_SEC * yEci) * sinTheta + (vyEci - EARTH_ROTATION_RATE_RAD_PER_SEC * xEci) * cosTheta;
  const vzEcef = vzEci;

  return {
    positionEcef: { x: xEcef, y: yEcef, z: zEcef },
    velocityEcef: { x: vxEcef, y: vyEcef, z: vzEcef },
  };
}

/**
 * Validates ground-observed RF Doppler S-curve against theoretical physical orbital dynamics.
 * Enforces mandatory Ed25519 signature by default, Keplerian orbital kinematics, line-of-sight
 * elevation constraints (>= 25 degrees), and theoretical Doppler curve matching (|Δf| <= 2500 Hz).
 */
export function verifyRfDopplerProof(
  proof: unknown,
  options: RfVerificationOptions = {}
): RfDopplerVerificationResult {
  if (typeof proof !== 'object' || proof === null) {
    return { valid: false, verifiedRfPass: false, reason: 'INVALID_PROOF_STRUCTURE' };
  }

  const p = proof as Partial<RfDopplerProof>;

  if (typeof p.noradId !== 'number' || !Number.isInteger(p.noradId) || p.noradId <= 0) {
    return { valid: false, verifiedRfPass: false, reason: 'INVALID_NORAD_ID' };
  }

  if (typeof p.observerLat !== 'number' || p.observerLat < -90 || p.observerLat > 90 ||
      typeof p.observerLon !== 'number' || p.observerLon < -180 || p.observerLon > 180) {
    return { valid: false, verifiedRfPass: false, reason: 'INVALID_OBSERVER_COORDINATES' };
  }

  if (typeof p.centerFrequencyHz !== 'number' || p.centerFrequencyHz < 1e9 || p.centerFrequencyHz > 30e9) {
    return { valid: false, verifiedRfPass: false, reason: 'INVALID_CENTER_FREQUENCY' };
  }

  const minSamples = options.minSamples ?? 5;
  if (!Array.isArray(p.samples) || p.samples.length < minSamples) {
    return { valid: false, verifiedRfPass: false, reason: 'INSUFFICIENT_SAMPLES' };
  }

  const minSnr = options.minSnrDb ?? 3.0;
  const minDuration = options.minPassDurationMs ?? 20_000; // 20s
  const maxDuration = options.maxPassDurationMs ?? 900_000; // 15 mins
  const minElevationDeg = options.minElevationDeg ?? 25.0; // 25 degree mask angle
  const maxToleranceHz = options.maxDopplerToleranceHz ?? 2_500; // max allowed Doppler residual

  // 1. Mandatory Ed25519 Cryptographic signature verification by default
  const requireSig = options.requireSignature ?? true;
  if (requireSig) {
    const expectedPubKey = options.operatorPublicKey ?? p.operatorPublicKey;
    if (!expectedPubKey || !p.operatorSignature) {
      return { valid: false, verifiedRfPass: false, reason: 'MISSING_OPERATOR_SIGNATURE' };
    }
    const messageBytes = getCanonicalDopplerBytes(p);
    const validSig = verifyOperatorSignature(expectedPubKey, messageBytes, p.operatorSignature);
    if (!validSig) {
      return { valid: false, verifiedRfPass: false, reason: 'INVALID_OPERATOR_SIGNATURE' };
    }
  }

  // 2. Sample sequencing, SNR, and monotonic frequency checks
  const f0 = p.centerFrequencyHz;
  const vOrb = options.tle?.semiMajorAxisM
    ? Math.sqrt(GM_EARTH / options.tle.semiMajorAxisM)
    : options.ephemeris?.semiMajorAxisM
    ? Math.sqrt(GM_EARTH / options.ephemeris.semiMajorAxisM)
    : STARLINK_ORBITAL_VELOCITY;
  const maxTheoreticalShiftHz = (f0 * vOrb) / SPEED_OF_LIGHT;
  const minSlantRangeM = Math.max(STARLINK_ORBIT_ALT_M - (p.observerAltM ?? 0), 200_000);
  const maxDopplerRateHzPerSec = (f0 * vOrb * vOrb) / (SPEED_OF_LIGHT * minSlantRangeM);

  let prevTime = -Infinity;
  let prevFreq = Infinity;
  let highestFreq = -Infinity;
  let lowestFreq = Infinity;

  for (let i = 0; i < p.samples.length; i++) {
    const s = p.samples[i];
    if (typeof s.timestampMs !== 'number' || typeof s.measuredFrequencyHz !== 'number' || typeof s.signalToNoiseRatioDb !== 'number') {
      return { valid: false, verifiedRfPass: false, reason: 'MALFORMED_SAMPLE_DATA' };
    }

    if (s.timestampMs <= prevTime) {
      return { valid: false, verifiedRfPass: false, reason: 'NON_ASCENDING_TIMESTAMPS' };
    }

    if (s.signalToNoiseRatioDb < minSnr) {
      return { valid: false, verifiedRfPass: false, reason: 'SNR_BELOW_NOISE_FLOOR' };
    }

    const shift = Math.abs(s.measuredFrequencyHz - f0);
    if (shift > maxTheoreticalShiftHz * 1.25) {
      return { valid: false, verifiedRfPass: false, reason: 'DOPPLER_SHIFT_EXCEEDS_LEO_VELOCITY' };
    }

    // Physical Doppler curve for an overhead pass must strictly decrease over time
    if (s.measuredFrequencyHz > prevFreq + 50) {
      return { valid: false, verifiedRfPass: false, reason: 'NON_MONOTONIC_DOPPLER_CURVE' };
    }

    // Enforce maximum physical Doppler drift rate |df/dt|
    if (prevTime !== -Infinity) {
      const dtSec = (s.timestampMs - prevTime) / 1000;
      if (dtSec > 0) {
        const driftRate = Math.abs(s.measuredFrequencyHz - prevFreq) / dtSec;
        if (driftRate > maxDopplerRateHzPerSec * 1.30) {
          return { valid: false, verifiedRfPass: false, reason: 'DOPPLER_RATE_EXCEEDS_PHYSICAL_LIMIT' };
        }
      }
    }

    if (s.measuredFrequencyHz > highestFreq) highestFreq = s.measuredFrequencyHz;
    if (s.measuredFrequencyHz < lowestFreq) lowestFreq = s.measuredFrequencyHz;

    prevTime = s.timestampMs;
    prevFreq = s.measuredFrequencyHz;
  }

  const first = p.samples[0];
  const last = p.samples[p.samples.length - 1];
  const durationMs = last.timestampMs - first.timestampMs;

  if (durationMs < minDuration || durationMs > maxDuration) {
    return { valid: false, verifiedRfPass: false, reason: 'PASS_DURATION_OUTSIDE_LEO_WINDOW' };
  }

  const measuredSpan = highestFreq - lowestFreq;
  if (measuredSpan < 1_000) {
    return { valid: false, verifiedRfPass: false, reason: 'INSUFFICIENT_DOPPLER_SPAN' };
  }

  // 3. Keplerian orbit propagation, closest approach determination, and line-of-sight elevation
  let tPca = first.timestampMs + durationMs / 2;
  for (let i = 0; i < p.samples.length - 1; i++) {
    const s1 = p.samples[i];
    const s2 = p.samples[i + 1];
    if (s1.measuredFrequencyHz >= f0 && s2.measuredFrequencyHz <= f0) {
      const df = s1.measuredFrequencyHz - s2.measuredFrequencyHz;
      if (df > 0) {
        tPca = s1.timestampMs + (s2.timestampMs - s1.timestampMs) * ((s1.measuredFrequencyHz - f0) / df);
      }
      break;
    }
  }

  // Estimate slant range at closest approach d_min from non-zero Doppler samples
  const estimatedDminSq: number[] = [];
  for (const s of p.samples) {
    const tauSec = (s.timestampMs - tPca) / 1000;
    if (Math.abs(tauSec) >= 5) {
      const vr = ((f0 - s.measuredFrequencyHz) / f0) * SPEED_OF_LIGHT;
      if (Math.abs(vr) > 50 && Math.abs(vr) < vOrb) {
        const dSq = (vOrb * tauSec) ** 2 * ((vOrb / vr) ** 2 - 1);
        if (dSq > 0) estimatedDminSq.push(dSq);
      }
    }
  }

  if (estimatedDminSq.length === 0) {
    return { valid: false, verifiedRfPass: false, reason: 'CANNOT_ESTIMATE_ORBITAL_TRAJECTORY' };
  }

  estimatedDminSq.sort((a, b) => a - b);
  const dMin = Math.sqrt(estimatedDminSq[Math.floor(estimatedDminSq.length / 2)]);

  // Physical bounds on closest approach slant range for 550km Starlink orbit (450 km to 1,500 km)
  if (dMin < 450_000 || dMin > 1_500_000) {
    return { valid: false, verifiedRfPass: false, reason: 'UNPHYSICAL_ORBITAL_SLANT_RANGE' };
  }

  // Maximum elevation angle at closest approach
  const sinThetaMax = (STARLINK_ORBIT_RADIUS_M ** 2 - EARTH_RADIUS_M ** 2 - dMin ** 2) / (2 * EARTH_RADIUS_M * dMin);
  const thetaMaxDeg = (Math.asin(Math.max(-1, Math.min(1, sinThetaMax))) * 180) / Math.PI;

  if (thetaMaxDeg < minElevationDeg) {
    return { valid: false, verifiedRfPass: false, reason: 'INSUFFICIENT_ELEVATION_ANGLE' };
  }

  // 4. Theoretical Doppler S-curve matching and residual analysis
  const observerEcef = computeObserverEcef(p.observerLat, p.observerLon, p.observerAltM ?? 0);
  let sumSqResiduals = 0;

  for (const s of p.samples) {
    let theoreticalFreq = f0;
    if (options.tle) {
      const state = propagateTleState(options.tle, s.timestampMs);
      const dx = state.positionEcef.x - observerEcef.x;
      const dy = state.positionEcef.y - observerEcef.y;
      const dz = state.positionEcef.z - observerEcef.z;
      const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const vr = (state.velocityEcef.x * dx + state.velocityEcef.y * dy + state.velocityEcef.z * dz) / range;
      theoreticalFreq = f0 - (f0 * vr) / SPEED_OF_LIGHT;
    } else {
      const tauSec = (s.timestampMs - tPca) / 1000;
      const slantRange = Math.sqrt((vOrb * tauSec) ** 2 + dMin ** 2);
      const sinElev = (STARLINK_ORBIT_RADIUS_M ** 2 - EARTH_RADIUS_M ** 2 - slantRange ** 2) / (2 * EARTH_RADIUS_M * slantRange);
      if (sinElev < 0) {
        return { valid: false, verifiedRfPass: false, reason: 'SATELLITE_BELOW_HORIZON' };
      }
      const radialVel = (vOrb ** 2 * tauSec) / slantRange;
      theoreticalFreq = f0 - (f0 * radialVel) / SPEED_OF_LIGHT;
    }

    const residual = Math.abs(s.measuredFrequencyHz - theoreticalFreq);
    if (residual > maxToleranceHz) {
      return { valid: false, verifiedRfPass: false, reason: 'DOPPLER_DEVIATION_EXCEEDS_PHYSICAL_TOLERANCE' };
    }
    sumSqResiduals += residual ** 2;
  }

  const rmseHz = Math.sqrt(sumSqResiduals / p.samples.length);

  return {
    valid: true,
    verifiedRfPass: true,
    noradId: p.noradId,
    measuredDopplerSpanHz: measuredSpan,
    durationSeconds: Math.round(durationMs / 1000),
    observerEcef,
    maxElevationDeg: Math.round(thetaMaxDeg * 10) / 10,
    estimatedSlantRangeM: Math.round(dMin),
    dopplerRmseHz: Math.round(rmseHz * 10) / 10,
  };
}

/**
 * Validates cross-observer RF consensus and Time Difference of Arrival (TDoA) across multiple ground stations.
 * Proves genuine physical satellite trajectory observed simultaneously from geographically distributed ground nodes.
 */
export function verifyMultiStationRfConsensus(
  proofs: readonly RfDopplerProof[],
  options: { maxTdoaResidualSec?: number; minStations?: number } = {}
): MultiStationVerificationResult {
  const minStations = options.minStations ?? 2;
  if (!Array.isArray(proofs) || proofs.length < minStations) {
    return {
      valid: false,
      stationCount: proofs?.length ?? 0,
      baselineDistanceKm: 0,
      observedTimeDifferenceSec: 0,
      theoreticalTimeDifferenceSec: 0,
      tdoaResidualSec: Infinity,
      passConsensusVerified: false,
      reason: 'INSUFFICIENT_OBSERVER_STATIONS',
    };
  }

  // 1. Verify each observer's independent proof
  const verifiedResults: RfDopplerVerificationResult[] = [];
  const tPcas: number[] = [];

  for (const proof of proofs) {
    const res = verifyRfDopplerProof(proof, { requireSignature: false });
    if (!res.valid || !res.verifiedRfPass) {
      return {
        valid: false,
        stationCount: proofs.length,
        baselineDistanceKm: 0,
        observedTimeDifferenceSec: 0,
        theoreticalTimeDifferenceSec: 0,
        tdoaResidualSec: Infinity,
        passConsensusVerified: false,
        reason: `STATION_VERIFICATION_FAILED: ${res.reason}`,
      };
    }
    verifiedResults.push(res);

    // Compute TCA
    const f0 = proof.centerFrequencyHz;
    let tPca = proof.samples[0].timestampMs;
    for (let i = 0; i < proof.samples.length - 1; i++) {
      const s1 = proof.samples[i];
      const s2 = proof.samples[i + 1];
      if (s1.measuredFrequencyHz >= f0 && s2.measuredFrequencyHz <= f0) {
        const df = s1.measuredFrequencyHz - s2.measuredFrequencyHz;
        if (df > 0) {
          tPca = s1.timestampMs + (s2.timestampMs - s1.timestampMs) * ((s1.measuredFrequencyHz - f0) / df);
        }
        break;
      }
    }
    tPcas.push(tPca);
  }

  // 2. Compute spatial baseline and TDoA between the first two stations
  const st1 = verifiedResults[0].observerEcef!;
  const st2 = verifiedResults[1].observerEcef!;
  const dx = st2.x - st1.x;
  const dy = st2.y - st1.y;
  const dz = st2.z - st1.z;
  const baselineDistM = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Time difference in observed closest approach
  const obsDtSec = (tPcas[1] - tPcas[0]) / 1000;

  // Theoretical projection of baseline along orbital velocity vector
  // In LEO, satellite travels ~7.587 km/s along its trajectory
  const theoreticalDtSec = baselineDistM / STARLINK_ORBITAL_VELOCITY;
  const tdoaResidualSec = Math.abs(Math.abs(obsDtSec) - theoreticalDtSec);
  const maxResidual = options.maxTdoaResidualSec ?? 2.5;

  const consensus = tdoaResidualSec <= maxResidual;

  return {
    valid: consensus,
    stationCount: proofs.length,
    baselineDistanceKm: Math.round((baselineDistM / 1000) * 10) / 10,
    observedTimeDifferenceSec: Math.round(obsDtSec * 100) / 100,
    theoreticalTimeDifferenceSec: Math.round(theoreticalDtSec * 100) / 100,
    tdoaResidualSec: Math.round(tdoaResidualSec * 100) / 100,
    passConsensusVerified: consensus,
    reason: consensus ? undefined : 'TDOA_RESIDUAL_EXCEEDS_PHYSICAL_TOLERANCE',
  };
}
