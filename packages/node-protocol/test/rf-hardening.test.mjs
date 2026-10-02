import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import {
  computeDynamicDopplerTolerance,
  verifySpectralEnergySignature,
  verifyDopplerObservation,
  getCanonicalDopplerBytes,
  signOperatorBytes,
  encodeHex,
} from '../dist/index.js';

function createTestKeypair(seedByte = 42) {
  const seed = new Uint8Array(32);
  seed[0] = seedByte;
  seed[31] = seedByte + 1;
  const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
  const pkcs8Key = Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]);
  const privKey = createPrivateKey({ key: pkcs8Key, format: "der", type: "pkcs8" });
  const pubKey = createPublicKey(privKey);
  const spki = pubKey.export({ format: "der", type: "spki" });
  const rawPub = spki.subarray(12);
  return {
    seed,
    operatorPublicKey: "ed25519:0x" + Buffer.from(rawPub).toString("hex"),
  };
}

test('computeDynamicDopplerTolerance: tightens tolerance at zenith and smoothly expands at horizon', () => {
  const tolZenith = computeDynamicDopplerTolerance(90, 500);
  const tol45 = computeDynamicDopplerTolerance(45, 500);
  const tolHorizon = computeDynamicDopplerTolerance(25, 500);

  // At zenith (90 deg): cos(90) = 0 -> 1.0 * 500 = 500 Hz
  assert.equal(tolZenith, 500);

  // At 45 deg: cos(45) ~= 0.707 -> 1.707 * 500 = ~853.6 Hz
  assert.ok(tol45 > tolZenith);
  assert.ok(tol45 < tolHorizon);

  // At horizon mask (25 deg): cos(25) ~= 0.906 -> 1.906 * 500 = ~953 Hz
  assert.ok(tolHorizon > 900 && tolHorizon < 1000);
  // Strictly tighter than the legacy static 2500 Hz window
  assert.ok(tolHorizon < 1000);
});

test('verifySpectralEnergySignature: validates authentic path-loss bell curve and rejects flat synthetic replays', () => {
  // Authentic orbital pass: path loss causes SNR to peak at closest approach
  const authenticSamples = [
    { timestampMs: 1000, measuredFrequencyHz: 11_325_100_000, signalToNoiseRatioDb: 6.2 },
    { timestampMs: 30000, measuredFrequencyHz: 11_325_050_000, signalToNoiseRatioDb: 12.8 },
    { timestampMs: 60000, measuredFrequencyHz: 11_325_000_000, signalToNoiseRatioDb: 16.5 },
    { timestampMs: 90000, measuredFrequencyHz: 11_324_950_000, signalToNoiseRatioDb: 11.9 },
    { timestampMs: 120000, measuredFrequencyHz: 11_324_900_000, signalToNoiseRatioDb: 5.8 },
  ];

  const authRes = verifySpectralEnergySignature(authenticSamples, 4.0);
  assert.equal(authRes.valid, true);
  assert.equal(authRes.snrDynamicRangeDb, 10.7);

  // SDR replay / synthetic dataset with static SNR
  const flatReplaySamples = authenticSamples.map(s => ({
    ...s,
    signalToNoiseRatioDb: 14.0, // Constant generator SNR
  }));

  const flatRes = verifySpectralEnergySignature(flatReplaySamples, 4.0);
  assert.equal(flatRes.valid, false);
  assert.equal(flatRes.reason, 'FLAT_SPECTRAL_PROFILE_REPLAY_DETECTED');

  // Inverted / edge-peaked SNR (impossible geometry)
  const edgePeakedSamples = [
    { timestampMs: 1000, measuredFrequencyHz: 11_325_100_000, signalToNoiseRatioDb: 22.0 }, // Peak at horizon
    { timestampMs: 30000, measuredFrequencyHz: 11_325_050_000, signalToNoiseRatioDb: 12.0 },
    { timestampMs: 60000, measuredFrequencyHz: 11_325_000_000, signalToNoiseRatioDb: 6.0 }, // Low at zenith
    { timestampMs: 90000, measuredFrequencyHz: 11_324_950_000, signalToNoiseRatioDb: 10.0 },
    { timestampMs: 120000, measuredFrequencyHz: 11_324_900_000, signalToNoiseRatioDb: 8.0 },
  ];

  const edgeRes = verifySpectralEnergySignature(edgePeakedSamples, 4.0);
  assert.equal(edgeRes.valid, false);
  assert.equal(edgeRes.reason, 'UNPHYSICAL_SPECTRAL_PEAK_ALIGNMENT');
});

test('verifyDopplerObservation: enforces cryptographic beacon digest and dynamic tolerance against SDR replays', () => {
  const centerFreq = 11_325_000_000;
  const baseTime = Date.now();
  const { seed, operatorPublicKey } = createTestKeypair(42);

  const samples = [
    { timestampMs: baseTime + 0, measuredFrequencyHz: centerFreq + 182_773, signalToNoiseRatioDb: 11.2 },
    { timestampMs: baseTime + 30_000, measuredFrequencyHz: centerFreq + 109_635, signalToNoiseRatioDb: 15.0 },
    { timestampMs: baseTime + 60_000, measuredFrequencyHz: centerFreq + 0, signalToNoiseRatioDb: 18.2 },
    { timestampMs: baseTime + 90_000, measuredFrequencyHz: centerFreq - 109_635, signalToNoiseRatioDb: 14.5 },
    { timestampMs: baseTime + 120_000, measuredFrequencyHz: centerFreq - 182_773, signalToNoiseRatioDb: 10.8 },
  ];

  const validBeacon = '0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
  const validNonce = '0x1234567890abcdef';

  const unsignedProof = {
    noradId: 58001,
    observerLat: 51.5074,
    observerLon: -0.1278,
    observerAltM: 45,
    centerFrequencyHz: centerFreq,
    samples,
    observerNodeId: 'node-uk-ldn-01',
    operatorPublicKey,
    beaconDigest: validBeacon,
    ephemeralChallengeNonce: validNonce,
  };

  const canonicalBytes = getCanonicalDopplerBytes(unsignedProof);
  const sigBytes = signOperatorBytes(seed, canonicalBytes);
  const proof = {
    ...unsignedProof,
    operatorSignature: encodeHex(sigBytes),
  };

  // 1. Valid pass with dynamic tolerance & spectral signature & beacon check
  const verified = verifyDopplerObservation(proof, {
    useDynamicTolerance: true,
    baseToleranceHz: 500,
    enforceSpectralSignature: true,
    minSnrDynamicRangeDb: 4.0,
    expectedBeaconDigest: validBeacon,
    expectedChallengeNonce: validNonce,
  });

  assert.equal(verified.valid, true);
  assert.equal(verified.verifiedRfPass, true);
  assert.equal(verified.beaconVerified, true);
  assert.equal(verified.spectralSignatureVerified, true);
  assert.ok(verified.dynamicToleranceHz && verified.dynamicToleranceHz <= 1000);
  assert.ok(verified.snrDynamicRangeDb && verified.snrDynamicRangeDb >= 4.0);

  // 2. Reject replayed / mismatched beacon digest
  const badBeaconRes = verifyDopplerObservation(proof, {
    expectedBeaconDigest: '0x0000000000000000000000000000000000000000000000000000000000000000',
  });
  assert.equal(badBeaconRes.valid, false);
  assert.equal(badBeaconRes.reason, 'BEACON_DIGEST_MISMATCH');

  // 3. Reject mismatched challenge nonce
  const badNonceRes = verifyDopplerObservation(proof, {
    expectedChallengeNonce: '0xdeadbeef',
  });
  assert.equal(badNonceRes.valid, false);
  assert.equal(badNonceRes.reason, 'CHALLENGE_NONCE_MISMATCH');
});
