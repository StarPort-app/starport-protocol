/**
 * Speed of light in vacuum in meters per second (exact SI definition)
 */
export const SPEED_OF_LIGHT_M_S = 299792458.0;

/**
 * Standard Gravitational Parameter of Earth (WGS-84) in m^3 / s^2
 */
export const EARTH_MU = 3.986004418e14;

/**
 * Earth Equatorial Radius (WGS-84) in meters
 */
export const EARTH_RADIUS_EQUATOR_M = 6378137.0;

/**
 * Earth Second Dynamic Form Factor (J2 Gravitational Oblateness Perturbation)
 * Measures the geoid flattening and quadrupole gravitational field anomaly.
 */
export const EARTH_J2 = 1.08262668e-3;

/**
 * Chi-Square 99.9% confidence threshold for 1 degree of freedom (p = 0.001)
 * Innovation Mahalanobis distance exceeding this threshold triggers an anti-spoofing alert.
 */
export const CHI_SQUARE_999_1DOF = 10.828;

/**
 * State Vector representing the kinematic and oscillator state:
 * x = [ slantRangeM, rangeRateM_S, radialAccelM_S2, freqBiasHz, freqDriftRateHzS ]^T
 */
export interface EkfStateVector {
  slantRangeM: number;
  rangeRateM_S: number;
  radialAccelM_S2: number;
  freqBiasHz: number;
  freqDriftRateHzS: number;
}

export interface EkfTrackingSample {
  timestampMs: number;
  observedFrequencyHz: number;
  nominalCarrierHz: number;
  snrDb: number;
}

export interface EkfStepResult {
  timestampMs: number;
  estimatedState: EkfStateVector;
  predictedFrequencyHz: number;
  innovationResidualHz: number;
  innovationVariance: number;
  mahalanobisDistanceSq: number;
  spoofingAnomalyDetected: boolean;
}

export interface EkfTrackingReport {
  readonly converged: boolean;
  readonly sampleCount: number;
  readonly meanAbsoluteResidualHz: number;
  readonly maxMahalanobisDistanceSq: number;
  readonly anomalyCount: number;
  readonly trajectoryIntegrityScore: number; // 0.0 to 1.0
  readonly estimatedClosestApproachSlantRangeM: number;
  readonly estimatedZenithRangeRateM_S: number;
  readonly stepResults: readonly EkfStepResult[];
}

/**
 * 5-State Extended Kalman Filter for Real-Time LEO Orbital Doppler Tracking
 * Incorporates Earth J2 oblateness acceleration models, oscillator drift tracking,
 * and statistical Chi-Square innovation testing to detect RF spoofing/tone injection.
 */
export class OrbitalDopplerEkfTracker {
  private x: number[]; // 5x1 state vector
  private P: number[][]; // 5x5 error covariance matrix
  private lastTimestampMs: number | null = null;

  // Process noise variances (tuned for LEO ~550km altitude and TCXO/OCXO clock drift)
  private readonly qAccelVar: number = 2.5; // (m/s^2)^2 process acceleration noise
  private readonly qOscDriftVar: number = 0.05; // (Hz/s)^2 oscillator drift variance
  private readonly rMeasurementVar: number = 16.0; // Hz^2 measurement noise variance (std dev ~4.0 Hz)

  constructor(
    initialRangeM: number = 800000.0,
    initialRangeRateM_S: number = -6000.0,
    initialAccelM_S2: number = 300.0
  ) {
    // Initial state: [ range, rangeRate, radialAccel, freqBias, freqDrift ]
    this.x = [initialRangeM, initialRangeRateM_S, initialAccelM_S2, 0.0, 0.0];

    // Initial covariance matrix (tuned initial uncertainty)
    this.P = [
      [1e8, 0, 0, 0, 0],
      [0, 1e4, 0, 0, 0],
      [0, 0, 1e2, 0, 0],
      [0, 0, 0, 1e4, 0],
      [0, 0, 0, 0, 1e1],
    ];
  }

  /**
   * Calculates secular orbital J2 gravitational perturbation acceleration correction
   */
  public computeJ2RadialPerturbation(altitudeM: number, inclinationDeg: number): number {
    const r = EARTH_RADIUS_EQUATOR_M + altitudeM;
    const incRad = (inclinationDeg * Math.PI) / 180.0;
    // J2 perturbation potential gradient in radial coordinate
    const factor = -1.5 * EARTH_J2 * (EARTH_MU / (r * r)) * Math.pow(EARTH_RADIUS_EQUATOR_M / r, 2);
    const radialJ2Accel = factor * (1.0 - 3.0 * Math.pow(Math.sin(incRad), 2));
    return radialJ2Accel;
  }

  /**
   * Executes a single EKF Predict-Update step on an incoming Doppler observation
   */
  public step(sample: EkfTrackingSample): EkfStepResult {
    let dtSec = 0.0;
    if (this.lastTimestampMs !== null) {
      dtSec = Math.max(0.001, (sample.timestampMs - this.lastTimestampMs) / 1000.0);
    }
    this.lastTimestampMs = sample.timestampMs;

    // --- 1. PREDICT STEP ---
    // State transition matrix F:
    // r_{k+1} = r_k + \dot{r}_k * dt + 0.5 * \ddot{r}_k * dt^2
    // \dot{r}_{k+1} = \dot{r}_k + \ddot{r}_k * dt
    // \ddot{r}_{k+1} = \ddot{r}_k
    // \delta f_{k+1} = \delta f_k + \dot{\delta f}_k * dt
    // \dot{\delta f}_{k+1} = \dot{\delta f}_k
    const r = this.x[0] + this.x[1] * dtSec + 0.5 * this.x[2] * dtSec * dtSec;
    const rDot = this.x[1] + this.x[2] * dtSec;
    const rDDot = this.x[2];
    const fBias = this.x[3] + this.x[4] * dtSec;
    const fDrift = this.x[4];

    this.x = [r, rDot, rDDot, fBias, fDrift];

    // State transition Jacobian matrix F_k
    const F = [
      [1.0, dtSec, 0.5 * dtSec * dtSec, 0.0, 0.0],
      [0.0, 1.0, dtSec, 0.0, 0.0],
      [0.0, 0.0, 1.0, 0.0, 0.0],
      [0.0, 0.0, 0.0, 1.0, dtSec],
      [0.0, 0.0, 0.0, 0.0, 1.0],
    ];

    // Process noise covariance Q
    const dt3 = (dtSec * dtSec * dtSec) / 6.0;
    const dt2 = (dtSec * dtSec) / 2.0;
    const Q = [
      [dt3 * dt3 * this.qAccelVar, dt3 * dt2 * this.qAccelVar, dt3 * this.qAccelVar, 0, 0],
      [dt2 * dt3 * this.qAccelVar, dt2 * dt2 * this.qAccelVar, dt2 * this.qAccelVar, 0, 0],
      [dtSec * dt3 * this.qAccelVar, dtSec * dt2 * this.qAccelVar, dtSec * this.qAccelVar, 0, 0],
      [0, 0, 0, dt2 * dt2 * this.qOscDriftVar, dt2 * this.qOscDriftVar],
      [0, 0, 0, dtSec * dt2 * this.qOscDriftVar, dtSec * this.qOscDriftVar],
    ];

    // P_pred = F * P * F^T + Q
    const FP = this.matmul(F, this.P);
    const FT = this.transpose(F);
    const Ppred = this.matadd(this.matmul(FP, FT), Q);

    // --- 2. UPDATE STEP ---
    // Nonlinear measurement model:
    // f_pred = f_0 * (1 - rDot / c) + fBias
    const f0 = sample.nominalCarrierHz;
    const fPredicted = f0 * (1.0 - this.x[1] / SPEED_OF_LIGHT_M_S) + this.x[3];

    // Measurement Jacobian H:
    // \partial h / \partial r = 0
    // \partial h / \partial rDot = -f_0 / c
    // \partial h / \partial rDDot = 0
    // \partial h / \partial fBias = 1.0
    // \partial h / \partial fDrift = 0
    const H = [0.0, -f0 / SPEED_OF_LIGHT_M_S, 0.0, 1.0, 0.0];

    // Innovation residual: y = z - h(x)
    const innovation = sample.observedFrequencyHz - fPredicted;

    // Innovation covariance: S = H * P_pred * H^T + R
    let H_Ppred_HT = 0.0;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        H_Ppred_HT += H[i] * Ppred[i][j] * H[j];
      }
    }
    const S = H_Ppred_HT + this.rMeasurementVar;

    // Kalman Gain: K = P_pred * H^T * (1/S)  (5x1 vector)
    const K = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) {
      let Ppred_HT_i = 0.0;
      for (let j = 0; j < 5; j++) {
        Ppred_HT_i += Ppred[i][j] * H[j];
      }
      K[i] = Ppred_HT_i / S;
    }

    // State update: x_new = x_pred + K * y
    for (let i = 0; i < 5; i++) {
      this.x[i] += K[i] * innovation;
    }

    // Covariance update: P_new = (I - K * H) * P_pred
    const I_KH = [
      [1 - K[0] * H[0], -K[0] * H[1], -K[0] * H[2], -K[0] * H[3], -K[0] * H[4]],
      [-K[1] * H[0], 1 - K[1] * H[1], -K[1] * H[2], -K[1] * H[3], -K[1] * H[4]],
      [-K[2] * H[0], -K[2] * H[1], 1 - K[2] * H[2], -K[2] * H[3], -K[2] * H[4]],
      [-K[3] * H[0], -K[3] * H[1], -K[3] * H[2], 1 - K[3] * H[3], -K[3] * H[4]],
      [-K[4] * H[0], -K[4] * H[1], -K[4] * H[2], -K[4] * H[3], 1 - K[4] * H[4]],
    ];
    this.P = this.matmul(I_KH, Ppred);

    // --- 3. STATISTICAL INTEGRITY & ANTI-SPOOFING ANOMALY CHECK ---
    // Mahalanobis distance squared: D_M^2 = y^2 / S
    const mahalanobisDistanceSq = (innovation * innovation) / S;
    const spoofingDetected = mahalanobisDistanceSq > CHI_SQUARE_999_1DOF;

    return {
      timestampMs: sample.timestampMs,
      estimatedState: {
        slantRangeM: this.x[0],
        rangeRateM_S: this.x[1],
        radialAccelM_S2: this.x[2],
        freqBiasHz: this.x[3],
        freqDriftRateHzS: this.x[4],
      },
      predictedFrequencyHz: fPredicted,
      innovationResidualHz: innovation,
      innovationVariance: S,
      mahalanobisDistanceSq,
      spoofingAnomalyDetected: spoofingDetected,
    };
  }

  public getState(): EkfStateVector {
    return {
      slantRangeM: this.x[0],
      rangeRateM_S: this.x[1],
      radialAccelM_S2: this.x[2],
      freqBiasHz: this.x[3],
      freqDriftRateHzS: this.x[4],
    };
  }

  // --- Helper Linear Algebra Methods ---
  private matmul(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = B[0].length;
    const inner = B.length;
    const out: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        let sum = 0;
        for (let k = 0; k < inner; k++) {
          sum += A[i][k] * B[k][j];
        }
        out[i][j] = sum;
      }
    }
    return out;
  }

  private matadd(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = A[0].length;
    const out: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        out[i][j] = A[i][j] + B[i][j];
      }
    }
    return out;
  }

  private transpose(A: number[][]): number[][] {
    const rows = A.length;
    const cols = A[0].length;
    const out: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        out[j][i] = A[i][j];
      }
    }
    return out;
  }
}

/**
 * High-level runner: Evaluates an entire Doppler pass time-series through the EKF filter,
 * producing an audit-ready kinematic report and anti-spoofing integrity score.
 */
export function processDopplerPassWithEkf(
  samples: readonly EkfTrackingSample[],
  nominalCarrierHz: number
): EkfTrackingReport {
  if (samples.length === 0) {
    return {
      converged: false,
      sampleCount: 0,
      meanAbsoluteResidualHz: 0,
      maxMahalanobisDistanceSq: 0,
      anomalyCount: 0,
      trajectoryIntegrityScore: 0.0,
      estimatedClosestApproachSlantRangeM: 0,
      estimatedZenithRangeRateM_S: 0,
      stepResults: [],
    };
  }

  // Pre-estimate initial range-rate and acceleration directly from the initial Doppler observations:
  // f_obs = f_0 * (1 - rDot / c) => rDot = c * (1 - f_obs / f_0)
  const initialRDot0 = SPEED_OF_LIGHT_M_S * (1.0 - samples[0].observedFrequencyHz / nominalCarrierHz);
  let initialAccel = 300.0;
  if (samples.length >= 2) {
    const initialRDot1 = SPEED_OF_LIGHT_M_S * (1.0 - samples[1].observedFrequencyHz / nominalCarrierHz);
    const dt01 = Math.max(0.001, (samples[1].timestampMs - samples[0].timestampMs) / 1000.0);
    initialAccel = (initialRDot1 - initialRDot0) / dt01;
  }
  const tracker = new OrbitalDopplerEkfTracker(850000.0, initialRDot0, initialAccel);
  const stepResults: EkfStepResult[] = [];

  let totalAbsResidual = 0;
  let maxMahalanobis = 0;
  let anomalyCount = 0;
  let minSlantRange = Infinity;
  let minRangeRateAbs = Infinity;
  let zenithRangeRate = 0;

  for (const sample of samples) {
    const res = tracker.step(sample);
    stepResults.push(res);

    const absRes = Math.abs(res.innovationResidualHz);
    totalAbsResidual += absRes;

    if (res.mahalanobisDistanceSq > maxMahalanobis) {
      maxMahalanobis = res.mahalanobisDistanceSq;
    }
    if (res.spoofingAnomalyDetected) {
      anomalyCount++;
    }

    if (res.estimatedState.slantRangeM < minSlantRange) {
      minSlantRange = res.estimatedState.slantRangeM;
    }
    if (Math.abs(res.estimatedState.rangeRateM_S) < minRangeRateAbs) {
      minRangeRateAbs = Math.abs(res.estimatedState.rangeRateM_S);
      zenithRangeRate = res.estimatedState.rangeRateM_S;
    }
  }

  const meanAbsRes = totalAbsResidual / samples.length;
  // Integrity score: evaluated against the protocol 2500 Hz Doppler tolerance bound
  const anomalyRatio = anomalyCount / samples.length;
  const residualPenalty = Math.min(1.0, meanAbsRes / 2500.0);
  const trajectoryIntegrityScore = Math.max(0.0, 1.0 - (0.7 * residualPenalty + 0.3 * anomalyRatio));

  return {
    converged: meanAbsRes < 100.0 && anomalyCount <= 1,
    sampleCount: samples.length,
    meanAbsoluteResidualHz: Number(meanAbsRes.toFixed(2)),
    maxMahalanobisDistanceSq: Number(maxMahalanobis.toFixed(2)),
    anomalyCount,
    trajectoryIntegrityScore: Number(trajectoryIntegrityScore.toFixed(4)),
    estimatedClosestApproachSlantRangeM: Math.round(minSlantRange),
    estimatedZenithRangeRateM_S: Number(zenithRangeRate.toFixed(2)),
    stepResults,
  };
}
