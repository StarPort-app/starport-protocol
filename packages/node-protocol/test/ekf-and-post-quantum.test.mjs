import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OrbitalDopplerEkfTracker,
  processDopplerPassWithEkf,
  CHI_SQUARE_999_1DOF,
  generatePostQuantumEnclaveKeys,
  signHybridPostQuantumReceipt,
  verifyHybridPostQuantumReceipt,
  computeCompositeHybridDigest,
} from '../dist/index.js';

test('EKF Tracker: accurately tracks legitimate LEO Doppler curve with minimal residuals', () => {
  const nominalCarrierHz = 11.325e9;
  const samples = [];
  const startTime = 1727740800000;

  // Realistic 20-sample pass at 2-second intervals (40s pass)
  for (let i = 0; i < 20; i++) {
    const tSec = i * 2;
    // Approaching to receding: range rate from -6000 m/s to +6000 m/s
    const rangeRate = -6000.0 + (12000.0 / 38.0) * tSec;
    const dopplerShift = -nominalCarrierHz * (rangeRate / 299792458.0);
    const measuredFreq = nominalCarrierHz + dopplerShift;

    samples.push({
      timestampMs: startTime + tSec * 1000,
      observedFrequencyHz: measuredFreq,
      nominalCarrierHz,
      snrDb: 15.0 + Math.sin((i / 19) * Math.PI) * 4.0,
    });
  }

  const report = processDopplerPassWithEkf(samples, nominalCarrierHz);

  assert.equal(report.sampleCount, 20);
  assert.ok(report.converged, 'Filter should converge on smooth orbital Doppler trajectory');
  assert.ok(report.meanAbsoluteResidualHz < 20.0, `Mean residual should be small, got ${report.meanAbsoluteResidualHz} Hz`);
  assert.equal(report.anomalyCount, 0, 'No false-positive spoofing anomalies should be flagged');
  assert.ok(report.trajectoryIntegrityScore > 0.85, 'Trajectory integrity score should be high');
});

test('EKF Tracker: Mahalanobis Chi-Square test instantly detects adversarial RF frequency spoofing', () => {
  const nominalCarrierHz = 11.325e9;
  const samples = [];
  const startTime = 1727740800000;

  for (let i = 0; i < 20; i++) {
    const tSec = i * 2;
    let rangeRate = -6000.0 + (12000.0 / 38.0) * tSec;

    // Inject an abrupt adversarial spoofing anomaly at step 12 (+3,500 Hz frequency jump)
    if (i === 12) {
      rangeRate -= 95.0; // Corresponds to ~3,588 Hz sudden unphysical jump
    }

    const dopplerShift = -nominalCarrierHz * (rangeRate / 299792458.0);
    samples.push({
      timestampMs: startTime + tSec * 1000,
      observedFrequencyHz: nominalCarrierHz + dopplerShift,
      nominalCarrierHz,
      snrDb: 16.0,
    });
  }

  const report = processDopplerPassWithEkf(samples, nominalCarrierHz);

  assert.ok(report.anomalyCount >= 1, 'Spoofing anomaly must be flagged');
  assert.ok(
    report.maxMahalanobisDistanceSq > CHI_SQUARE_999_1DOF,
    `Mahalanobis distance ${report.maxMahalanobisDistanceSq} must exceed 99.9% Chi-Square threshold ${CHI_SQUARE_999_1DOF}`
  );
  assert.ok(
    report.stepResults[12].spoofingAnomalyDetected,
    'Step 12 must be explicitly flagged with spoofingAnomalyDetected=true'
  );
});

test('EKF Tracker: J2 Earth oblateness perturbation gradient is physically non-zero and bounded', () => {
  const tracker = new OrbitalDopplerEkfTracker();
  // Starlink orbit: altitude ~550 km, inclination 53.2 deg
  const j2Accel = tracker.computeJ2RadialPerturbation(550000.0, 53.2);

  assert.notEqual(j2Accel, 0);
  assert.ok(Math.abs(j2Accel) < 0.1, `J2 radial acceleration must be bounded, got ${j2Accel} m/s^2`);
});

test('Post-Quantum Hybrid Attestation: dual Ed25519 + ML-DSA-65 signature validates cleanly', () => {
  const keys = generatePostQuantumEnclaveKeys();
  const payload = Buffer.from(JSON.stringify({
    passId: 'pass-london-01',
    noradId: 58001,
    maxElevationDeg: 51.5,
    timestampMs: 1727740800000,
  }));
  const enclaveQuoteHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  const receipt = signHybridPostQuantumReceipt(
    payload,
    58001,
    keys.classicalKeyPair.privateKeySeed,
    keys.pqSecretKeyHex,
    enclaveQuoteHash,
    keys.pqPublicKey
  );

  assert.equal(receipt.classicalScheme, 'ED25519');
  assert.equal(receipt.postQuantumScheme, 'ML-DSA-65');
  assert.ok(receipt.compositeHybridDigestHex.length === 64);

  const verification = verifyHybridPostQuantumReceipt(payload, receipt, keys.pqPublicKey);

  assert.equal(verification.valid, true);
  assert.equal(verification.classicalValid, true);
  assert.equal(verification.postQuantumValid, true);
  assert.equal(verification.securityLevel, 'QUANTUM_RESILIENT_NIST_CAT_3');
});

test('Post-Quantum Hybrid Attestation: rejects receipt if payload is tampered', () => {
  const keys = generatePostQuantumEnclaveKeys();
  const payload = Buffer.from('original-payload');
  const tamperedPayload = Buffer.from('tampered-payload');
  const enclaveQuoteHash = '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

  const receipt = signHybridPostQuantumReceipt(
    payload,
    58001,
    keys.classicalKeyPair.privateKeySeed,
    keys.pqSecretKeyHex,
    enclaveQuoteHash,
    keys.pqPublicKey
  );

  const verification = verifyHybridPostQuantumReceipt(tamperedPayload, receipt, keys.pqPublicKey);

  assert.equal(verification.valid, false);
  assert.equal(verification.securityLevel, 'REJECTED');
  assert.equal(verification.reason, 'HYBRID_DIGEST_MISMATCH');
});

test('Post-Quantum Hybrid Attestation: rejects receipt with corrupted lattice commitment', () => {
  const keys = generatePostQuantumEnclaveKeys();
  const payload = Buffer.from('canonical-enclave-telemetry');
  const enclaveQuoteHash = '0x9999999999999999999999999999999999999999999999999999999999999999';

  const receipt = signHybridPostQuantumReceipt(
    payload,
    58001,
    keys.classicalKeyPair.privateKeySeed,
    keys.pqSecretKeyHex,
    enclaveQuoteHash,
    keys.pqPublicKey
  );

  // Corrupt the lattice commitment
  const corruptedReceipt = {
    ...receipt,
    latticeCommitmentC_TildeHex: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    compositeHybridDigestHex: computeCompositeHybridDigest(
      payload,
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      enclaveQuoteHash
    ),
  };

  const verification = verifyHybridPostQuantumReceipt(payload, corruptedReceipt, keys.pqPublicKey);

  assert.equal(verification.valid, false);
  assert.equal(verification.postQuantumValid, false);
  assert.equal(verification.securityLevel, 'CLASSICAL_ONLY');
  assert.equal(verification.reason, 'POST_QUANTUM_LATTICE_VERIFICATION_FAILED');
});
