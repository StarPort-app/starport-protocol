import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  quantizeGeographicCell,
  computeZkPoPoPublicInputs,
  digestZkPublicInputs,
  synthesizeZkPoPoProof,
  verifyZkPoPoProof,
} from '../dist/index.js';

test('quantizeGeographicCell conceals exact GPS location while binding coarse boundary', () => {
  // Residential Starlink terminal in London: (51.5074, -0.1278)
  const exactLat = 51.5074;
  const exactLon = -0.1278;

  const cell = quantizeGeographicCell(exactLat, exactLon, 1.0); // 1 degree cell ~111km x 70km

  // Assert exact coordinates are NOT in the cell output
  assert.equal('exactLat' in cell, false);
  assert.equal('exactLon' in cell, false);

  // Assert bounding box contains the exact coordinates
  assert.ok(cell.latMinDeg <= exactLat && exactLat <= cell.latMaxDeg);
  assert.ok(cell.lonMinDeg <= exactLon && exactLon <= cell.lonMaxDeg);

  // Assert cell ID is a deterministic hash
  assert.ok(cell.cellId.startsWith('cell_'));
});

test('computeZkPoPoPublicInputs compiles deterministic public vector from RF pass', () => {
  const mockRfProof = {
    noradId: 58000,
    observerLat: 48.8566,
    observerLon: 2.3522,
    observerAltM: 35,
    centerFrequencyHz: 11_325_000_000,
    samples: [
      { timestampMs: 1727700000000, measuredFrequencyHz: 11_325_180_000, signalToNoiseRatioDb: 16.0 },
      { timestampMs: 1727700060000, measuredFrequencyHz: 11_325_000_000, signalToNoiseRatioDb: 18.5 },
      { timestampMs: 1727700120000, measuredFrequencyHz: 11_324_820_000, signalToNoiseRatioDb: 16.0 },
    ],
    observerNodeId: 'station-paris',
    operatorPublicKey: 'ed25519:0x' + '22'.repeat(32),
  };

  const inputs = computeZkPoPoPublicInputs(mockRfProof, { maxRmseToleranceHz: 2500 });

  assert.equal(inputs.nominalFrequencyHz, 11_325_000_000);
  assert.equal(inputs.maxRmseToleranceHz, 2500);
  assert.equal(inputs.sampleCount, 3);
  assert.equal(inputs.passStartTimeMs, 1727700000000);
  assert.equal(inputs.passEndTimeMs, 1727700120000);
  assert.ok(inputs.tleCommitmentHash.startsWith('0x'));

  const digest = digestZkPublicInputs(inputs);
  assert.ok(digest.startsWith('0x'));
  assert.equal(digest.length, 66);
});

test('synthesizeZkPoPoProof and verifyZkPoPoProof validates Groth16 SNARK proof structure', () => {
  const mockRfProof = {
    noradId: 58000,
    observerLat: 51.5074,
    observerLon: -0.1278,
    observerAltM: 45,
    centerFrequencyHz: 11_325_000_000,
    samples: [
      { timestampMs: 1000, measuredFrequencyHz: 11_325_100_000, signalToNoiseRatioDb: 15.0 },
      { timestampMs: 2000, measuredFrequencyHz: 11_325_000_000, signalToNoiseRatioDb: 17.0 },
    ],
    observerNodeId: 'station-london',
    operatorPublicKey: 'ed25519:0x' + '11'.repeat(32),
  };

  const publicInputs = computeZkPoPoPublicInputs(mockRfProof);
  const proof = synthesizeZkPoPoProof(publicInputs, 'Groth16');

  assert.equal(proof.provingSystem, 'Groth16');
  assert.equal(proof.curve, 'BN254');
  assert.equal(verifyZkPoPoProof(proof, publicInputs), true);

  // Tampered public inputs must fail verification
  const tamperedInputs = { ...publicInputs, nominalFrequencyHz: 12_000_000_000 };
  assert.equal(verifyZkPoPoProof(proof, tamperedInputs), false);

  // Tampered proof digest must fail verification
  const tamperedProof = { ...proof, publicInputsDigest: '0x' + '00'.repeat(32) };
  assert.equal(verifyZkPoPoProof(tamperedProof, publicInputs), false);
});
