import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPrivateKey, createPublicKey, createHash } from 'node:crypto';
import {
  verifyHardwareAttestation,
  getCanonicalAttestationBytes,
  parseSgxDcapQuote,
  parseTpm2Quote,
  parseSevSnpReport,
  verifyRfDopplerProof,
  getCanonicalDopplerBytes,
  parseTwoLineElement,
  propagateTleState,
  verifyMultiStationRfConsensus,
  encodeHex,
  signOperatorBytes
} from '../dist/index.js';

function createTestKeypair(seedByte = 42) {
  const seed = new Uint8Array(32);
  seed[0] = seedByte;
  seed[31] = seedByte + 1;
  const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
  const privKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]),
    format: "der",
    type: "pkcs8",
  });
  const pubKeyObj = createPublicKey(privKey);
  const spki = pubKeyObj.export({ format: 'der', type: 'spki' });
  const rawPub = spki.subarray(12);
  const operatorPublicKey = 'ed25519:0x' + Buffer.from(rawPub).toString('hex');
  return { seed, operatorPublicKey, rawPub };
}

test('verifyHardwareAttestation validates genuine hardware enclave reports with Ed25519 signature', () => {
  const { seed, operatorPublicKey } = createTestKeypair(7);

  const unsignedReport = {
    enclaveType: 'apple_secure_enclave',
    operatorPublicKey,
    enclaveMeasurement: '0x' + 'aa'.repeat(32),
    securityVersion: 2,
    secureBootEnabled: true,
    timestamp: new Date().toISOString(),
    chipManufacturer: 'apple',
  };

  const canonicalBytes = getCanonicalAttestationBytes(unsignedReport);
  const sigBytes = signOperatorBytes(seed, canonicalBytes);
  const report = {
    ...unsignedReport,
    attestationSignature: encodeHex(sigBytes),
  };

  const res = verifyHardwareAttestation(report, operatorPublicKey);
  assert.equal(res.valid, true);
  assert.equal(res.hardwareAttested, true);
  assert.equal(res.enclaveType, 'apple_secure_enclave');

  // Cryptographic signature failure: forged signature
  const forgedSigReport = { ...report, attestationSignature: '0x' + '00'.repeat(64) };
  const forgedRes = verifyHardwareAttestation(forgedSigReport, operatorPublicKey);
  assert.equal(forgedRes.valid, false);
  assert.equal(forgedRes.reason, 'INVALID_ATTESTATION_SIGNATURE');

  // Cryptographic signature failure: tampered enclave measurement
  const tamperedMeasurementReport = { ...report, enclaveMeasurement: '0x' + 'bb'.repeat(32) };
  const tamperedRes = verifyHardwareAttestation(tamperedMeasurementReport, operatorPublicKey);
  assert.equal(tamperedRes.valid, false);
  assert.equal(tamperedRes.reason, 'INVALID_ATTESTATION_SIGNATURE');

  // Physical and provenance failures
  assert.equal(verifyHardwareAttestation({ ...report, secureBootEnabled: false }, operatorPublicKey, { requireSignature: false }).valid, false);
  assert.equal(verifyHardwareAttestation({ ...report, operatorPublicKey: 'ed25519:0x' + '00'.repeat(31) + '02' }, operatorPublicKey).valid, false);
  assert.equal(verifyHardwareAttestation({ ...report, securityVersion: 0 }, operatorPublicKey, { minSecurityVersion: 1, requireSignature: false }).valid, false);
  assert.equal(verifyHardwareAttestation({ ...report, timestamp: new Date(Date.now() - 100_000_000).toISOString() }, operatorPublicKey, { requireSignature: false }).valid, false);
});

test('parseSgxDcapQuote and parseTpm2Quote validate authentic binary hardware enclave quotes', () => {
  const { seed, operatorPublicKey, rawPub } = createTestKeypair(15);
  const keyDigest = createHash('sha256').update(rawPub).digest();

  // 1. Build a valid 432-byte Intel SGX DCAP Quote v3 binary
  const sgxBuf = Buffer.alloc(432);
  sgxBuf.writeUInt16LE(3, 0); // version 3
  sgxBuf.writeUInt16LE(2, 2); // attKeyType ECDSA-256
  sgxBuf.writeUInt32LE(0, 4); // teeType SGX
  sgxBuf.writeUInt16LE(1, 8); // qeSvn
  sgxBuf.writeUInt16LE(1, 10); // pceSvn
  Buffer.from('939a7233f79c4ca9940a0db3957f0607', 'hex').copy(sgxBuf, 12); // Intel GUID vendorId
  // Enclave report measurements
  Buffer.alloc(32, 0xaa).copy(sgxBuf, 112); // mrEnclave
  Buffer.alloc(32, 0xbb).copy(sgxBuf, 176); // mrSigner
  sgxBuf.writeUInt16LE(1, 304); // isvProdId
  sgxBuf.writeUInt16LE(1, 306); // isvSvn
  // reportData at offset 368 contains key digest
  keyDigest.copy(sgxBuf, 368);

  const parsedSgx = parseSgxDcapQuote(sgxBuf, operatorPublicKey);
  assert.equal(parsedSgx.version, 3);
  assert.equal(parsedSgx.vendorId, '939a7233f79c4ca9940a0db3957f0607');
  assert.equal(parsedSgx.mrEnclave, '0x' + 'aa'.repeat(32));
  assert.equal(parsedSgx.bindsOperatorKey, true);

  // 2. Build a valid TPM 2.0 Quote (TPMS_ATTEST) binary
  const tpmBuf = Buffer.alloc(128);
  let off = 0;
  tpmBuf.writeUInt32BE(0xFF544347, off); off += 4; // magic TPM_GENERATED_VALUE
  tpmBuf.writeUInt16BE(0x8018, off); off += 2; // type TPM_ST_ATTEST_QUOTE
  tpmBuf.writeUInt16BE(4, off); off += 2; // signer len
  Buffer.from('root').copy(tpmBuf, off); off += 4;
  tpmBuf.writeUInt16BE(32, off); off += 2; // extraData len (32 bytes)
  keyDigest.copy(tpmBuf, off); off += 32; // extraData binds key digest
  tpmBuf.writeBigUInt64BE(1000n, off); off += 8; // clock
  tpmBuf.writeUInt32BE(1, off); off += 4; // resetCount
  tpmBuf.writeUInt32BE(1, off); off += 4; // restartCount
  tpmBuf.writeUInt8(1, off); off += 1; // safe
  tpmBuf.writeBigUInt64BE(2026n, off); off += 8; // firmwareVersion
  tpmBuf.writeUInt32BE(0, off); off += 4; // pcrSelect count = 0
  tpmBuf.writeUInt16BE(32, off); off += 2; // pcrDigest len
  Buffer.alloc(32, 0x55).copy(tpmBuf, off); off += 32;

  const parsedTpm = parseTpm2Quote(tpmBuf.subarray(0, off), operatorPublicKey);
  assert.equal(parsedTpm.magic, 0xFF544347);
  assert.equal(parsedTpm.type, 0x8018);
  assert.equal(parsedTpm.bindsOperatorKey, true);

  // 3. Integration with verifyHardwareAttestation with rawQuote
  const unsignedReport = {
    enclaveType: 'tee_sgx',
    operatorPublicKey,
    enclaveMeasurement: '0x' + 'aa'.repeat(32),
    securityVersion: 1,
    secureBootEnabled: true,
    timestamp: new Date().toISOString(),
    chipManufacturer: 'intel',
    rawQuote: sgxBuf,
  };
  const canonicalBytes = getCanonicalAttestationBytes(unsignedReport);
  const report = {
    ...unsignedReport,
    attestationSignature: encodeHex(signOperatorBytes(seed, canonicalBytes)),
  };

  const hwRes = verifyHardwareAttestation(report, operatorPublicKey);
  assert.equal(hwRes.valid, true);
  assert.equal(hwRes.hardwareAttested, true);
  assert.ok(hwRes.parsedQuote);
  assert.equal(hwRes.parsedQuote.bindsOperatorKey, true);
});

test('parseTwoLineElement and propagateTleState calculate genuine Keplerian orbital state vectors', () => {
  // Standard NORAD Starlink Two-Line Element
  const line1 = '1 58001U 23150A   26270.50000000  .00010000  00000-0  50000-4 0  9991';
  const line2 = '2 58001  53.2000 120.5000 0001500  45.0000  60.0000 15.06000000123456';

  const tle = parseTwoLineElement(line1, line2);
  assert.equal(tle.satelliteNumber, 58001);
  assert.equal(tle.inclinationDeg, 53.2);
  assert.equal(tle.meanMotionRevsPerDay, 15.06);
  assert.ok(tle.semiMajorAxisM > 6_800_000 && tle.semiMajorAxisM < 7_000_000);

  // Propagate state at epoch and +60s
  const state0 = propagateTleState(tle, tle.epochTimestampMs);
  const r0 = Math.sqrt(state0.positionEcef.x ** 2 + state0.positionEcef.y ** 2 + state0.positionEcef.z ** 2);
  const v0 = Math.sqrt(state0.velocityEcef.x ** 2 + state0.velocityEcef.y ** 2 + state0.velocityEcef.z ** 2);

  // Orbital radius must match 550km shell (~6921 km) and orbital velocity ~7.58 km/s
  assert.ok(r0 >= 6_850_000 && r0 <= 6_950_000);
  assert.ok(v0 >= 7_000 && v0 <= 8_000);

  const state60 = propagateTleState(tle, tle.epochTimestampMs + 60_000);
  const dr = Math.sqrt((state60.positionEcef.x - state0.positionEcef.x) ** 2 + (state60.positionEcef.y - state0.positionEcef.y) ** 2 + (state60.positionEcef.z - state0.positionEcef.z) ** 2);
  // Satellite travels ~450 km in 60 seconds
  assert.ok(dr >= 400_000 && dr <= 500_000);
});

test('verifyRfDopplerProof validates physical LEO satellite Doppler S-curves and enforces orbital constraints', () => {
  const centerFreq = 11_325_000_000; // 11.325 GHz Ku-band
  const baseTime = Date.now();
  const { seed, operatorPublicKey } = createTestKeypair(19);

  // Exact Keplerian S-curve for 550km Starlink pass at zenith (d_min = 550,000 m, v = 7,587.8 m/s)
  const samples = [
    { timestampMs: baseTime + 0, measuredFrequencyHz: centerFreq + 182_773, signalToNoiseRatioDb: 12.5 },
    { timestampMs: baseTime + 30_000, measuredFrequencyHz: centerFreq + 109_635, signalToNoiseRatioDb: 15.2 },
    { timestampMs: baseTime + 60_000, measuredFrequencyHz: centerFreq + 0, signalToNoiseRatioDb: 18.0 },
    { timestampMs: baseTime + 90_000, measuredFrequencyHz: centerFreq - 109_635, signalToNoiseRatioDb: 14.8 },
    { timestampMs: baseTime + 120_000, measuredFrequencyHz: centerFreq - 182_773, signalToNoiseRatioDb: 11.7 },
  ];

  const unsignedProof = {
    noradId: 58001,
    observerLat: 51.5074,
    observerLon: -0.1278,
    observerAltM: 45,
    centerFrequencyHz: centerFreq,
    samples,
    observerNodeId: 'node-uk-ldn-01',
    operatorPublicKey,
  };

  const canonicalBytes = getCanonicalDopplerBytes(unsignedProof);
  const sigBytes = signOperatorBytes(seed, canonicalBytes);
  const proof = {
    ...unsignedProof,
    operatorSignature: encodeHex(sigBytes),
  };

  const res = verifyRfDopplerProof(proof);
  assert.equal(res.valid, true);
  assert.equal(res.verifiedRfPass, true);
  assert.equal(res.noradId, 58001);
  assert.equal(res.measuredDopplerSpanHz, 365_546);
  assert.equal(res.durationSeconds, 120);
  assert.ok(res.observerEcef && typeof res.observerEcef.x === 'number');
  assert.ok(res.maxElevationDeg && res.maxElevationDeg >= 25);
  assert.ok(res.estimatedSlantRangeM && res.estimatedSlantRangeM >= 500_000 && res.estimatedSlantRangeM <= 600_000);
  assert.ok(typeof res.dopplerRmseHz === 'number' && res.dopplerRmseHz <= 50);

  // Failure cases:
  // 1. Non-monotonic curve
  const badSamples = [
    { timestampMs: baseTime + 0, measuredFrequencyHz: centerFreq + 100_000, signalToNoiseRatioDb: 12.0 },
    { timestampMs: baseTime + 30_000, measuredFrequencyHz: centerFreq + 150_000, signalToNoiseRatioDb: 12.0 },
    { timestampMs: baseTime + 60_000, measuredFrequencyHz: centerFreq + 50_000, signalToNoiseRatioDb: 12.0 },
    { timestampMs: baseTime + 90_000, measuredFrequencyHz: centerFreq - 50_000, signalToNoiseRatioDb: 12.0 },
    { timestampMs: baseTime + 120_000, measuredFrequencyHz: centerFreq - 100_000, signalToNoiseRatioDb: 12.0 },
  ];
  assert.equal(verifyRfDopplerProof({ ...proof, samples: badSamples }, { requireSignature: false }).valid, false);

  // 2. Insufficient samples (< 5)
  assert.equal(verifyRfDopplerProof({ ...proof, samples: samples.slice(0, 3) }, { requireSignature: false }).valid, false);

  // 3. SNR below noise floor (< 3.0 dB)
  const lowSnrSamples = samples.map(s => ({ ...s, signalToNoiseRatioDb: 1.0 }));
  assert.equal(verifyRfDopplerProof({ ...proof, samples: lowSnrSamples }, { requireSignature: false }).valid, false);

  // 4. Physical Doppler rate violation
  const impossibleRateSamples = [
    { timestampMs: baseTime + 0, measuredFrequencyHz: centerFreq + 180_000, signalToNoiseRatioDb: 15.0 },
    { timestampMs: baseTime + 1_000, measuredFrequencyHz: centerFreq + 100_000, signalToNoiseRatioDb: 15.0 },
    { timestampMs: baseTime + 60_000, measuredFrequencyHz: centerFreq + 0, signalToNoiseRatioDb: 15.0 },
    { timestampMs: baseTime + 90_000, measuredFrequencyHz: centerFreq - 95_000, signalToNoiseRatioDb: 15.0 },
    { timestampMs: baseTime + 120_000, measuredFrequencyHz: centerFreq - 180_000, signalToNoiseRatioDb: 15.0 },
  ];
  const rateRes = verifyRfDopplerProof({ ...proof, samples: impossibleRateSamples }, { requireSignature: false });
  assert.equal(rateRes.valid, false);
  assert.equal(rateRes.reason, 'DOPPLER_RATE_EXCEEDS_PHYSICAL_LIMIT');

  // 5. Unphysical Doppler residual deviation (> 2500 Hz tolerance)
  const deviatedSamples = [
    { timestampMs: baseTime + 0, measuredFrequencyHz: centerFreq + 182_773, signalToNoiseRatioDb: 12.5 },
    { timestampMs: baseTime + 30_000, measuredFrequencyHz: centerFreq + 109_635 + 5_000, signalToNoiseRatioDb: 15.2 },
    { timestampMs: baseTime + 60_000, measuredFrequencyHz: centerFreq + 0, signalToNoiseRatioDb: 18.0 },
    { timestampMs: baseTime + 90_000, measuredFrequencyHz: centerFreq - 109_635, signalToNoiseRatioDb: 14.8 },
    { timestampMs: baseTime + 120_000, measuredFrequencyHz: centerFreq - 182_773, signalToNoiseRatioDb: 11.7 },
  ];
  const devRes = verifyRfDopplerProof({ ...proof, samples: deviatedSamples }, { requireSignature: false });
  assert.equal(devRes.valid, false);
  assert.equal(devRes.reason, 'DOPPLER_DEVIATION_EXCEEDS_PHYSICAL_TOLERANCE');

  // 6. Insufficient elevation angle (< 25 degrees)
  const lowElevRes = verifyRfDopplerProof(proof, { minElevationDeg: 95.0, requireSignature: false });
  assert.equal(lowElevRes.valid, false);
  assert.equal(lowElevRes.reason, 'INSUFFICIENT_ELEVATION_ANGLE');
});

test('verifyMultiStationRfConsensus proves spatial TDoA baseline consensus across multiple ground stations', () => {
  const centerFreq = 11_325_000_000;
  const baseTime = Date.now();
  const kp1 = createTestKeypair(21);
  const kp2 = createTestKeypair(22);

  // Ground Station 1: London (51.5074, -0.1278) - TCA at baseTime + 60,000 ms
  const samples1 = [
    { timestampMs: baseTime + 0, measuredFrequencyHz: centerFreq + 182_773, signalToNoiseRatioDb: 15.0 },
    { timestampMs: baseTime + 30_000, measuredFrequencyHz: centerFreq + 109_635, signalToNoiseRatioDb: 15.0 },
    { timestampMs: baseTime + 60_000, measuredFrequencyHz: centerFreq + 0, signalToNoiseRatioDb: 18.0 },
    { timestampMs: baseTime + 90_000, measuredFrequencyHz: centerFreq - 109_635, signalToNoiseRatioDb: 15.0 },
    { timestampMs: baseTime + 120_000, measuredFrequencyHz: centerFreq - 182_773, signalToNoiseRatioDb: 15.0 },
  ];

  const p1Unsigned = {
    noradId: 58001,
    observerLat: 51.5074,
    observerLon: -0.1278,
    observerAltM: 45,
    centerFrequencyHz: centerFreq,
    samples: samples1,
    observerNodeId: 'station-uk-ldn',
    operatorPublicKey: kp1.operatorPublicKey,
  };
  const proof1 = {
    ...p1Unsigned,
    operatorSignature: encodeHex(signOperatorBytes(kp1.seed, getCanonicalDopplerBytes(p1Unsigned))),
  };

  // Ground Station 2: Paris (48.8566, 2.3522), distance ~343 km
  // Satellite traveling at ~7.587 km/s reaches TCA at Paris ~45.2s later: TCA = baseTime + 105,200 ms
  const tca2 = baseTime + 105_200;
  const samples2 = [
    { timestampMs: tca2 - 60_000, measuredFrequencyHz: centerFreq + 182_773, signalToNoiseRatioDb: 14.0 },
    { timestampMs: tca2 - 30_000, measuredFrequencyHz: centerFreq + 109_635, signalToNoiseRatioDb: 14.0 },
    { timestampMs: tca2 + 0, measuredFrequencyHz: centerFreq + 0, signalToNoiseRatioDb: 17.0 },
    { timestampMs: tca2 + 30_000, measuredFrequencyHz: centerFreq - 109_635, signalToNoiseRatioDb: 14.0 },
    { timestampMs: tca2 + 60_000, measuredFrequencyHz: centerFreq - 182_773, signalToNoiseRatioDb: 14.0 },
  ];

  const p2Unsigned = {
    noradId: 58001,
    observerLat: 48.8566,
    observerLon: 2.3522,
    observerAltM: 35,
    centerFrequencyHz: centerFreq,
    samples: samples2,
    observerNodeId: 'station-fr-par',
    operatorPublicKey: kp2.operatorPublicKey,
  };
  const proof2 = {
    ...p2Unsigned,
    operatorSignature: encodeHex(signOperatorBytes(kp2.seed, getCanonicalDopplerBytes(p2Unsigned))),
  };

  const consensus = verifyMultiStationRfConsensus([proof1, proof2]);
  assert.equal(consensus.valid, true);
  assert.equal(consensus.passConsensusVerified, true);
  assert.equal(consensus.stationCount, 2);
  assert.ok(consensus.baselineDistanceKm >= 300 && consensus.baselineDistanceKm <= 400);
  assert.ok(consensus.tdoaResidualSec <= 2.5);

  // Spoofed station with fabricated non-physical time of arrival fails consensus
  const spoofedSamples = samples2.map(s => ({ ...s, timestampMs: s.timestampMs + 600_000 })); // +10 min time warp
  const spoofedProof = { ...proof2, samples: spoofedSamples };
  const spoofedConsensus = verifyMultiStationRfConsensus([proof1, spoofedProof]);
  assert.equal(spoofedConsensus.valid, false);
  assert.equal(spoofedConsensus.passConsensusVerified, false);
  assert.equal(spoofedConsensus.reason, 'TDOA_RESIDUAL_EXCEEDS_PHYSICAL_TOLERANCE');
});
