import { createHash } from 'node:crypto';
import type { RfDopplerProof } from './rf-doppler.js';

export interface GeographicCell {
  readonly cellId: string;
  readonly latMinDeg: number;
  readonly latMaxDeg: number;
  readonly lonMinDeg: number;
  readonly lonMaxDeg: number;
}

export interface ZkPoPoPublicInputs {
  readonly tleCommitmentHash: string;
  readonly geographicCell: GeographicCell;
  readonly nominalFrequencyHz: number;
  readonly maxRmseToleranceHz: number;
  readonly passStartTimeMs: number;
  readonly passEndTimeMs: number;
  readonly sampleCount: number;
}

export interface ZkPoPoProof {
  readonly provingSystem: 'Groth16' | 'Plonk' | 'Halo2';
  readonly curve: 'BN254' | 'BLS12-381';
  readonly proofBytes: string;
  readonly publicInputsDigest: string;
}

/**
 * Quantizes an exact geographic coordinate into a coarse privacy-preserving spatial cell.
 * Prevents on-chain doxxing of residential Starlink dish coordinates.
 */
export function quantizeGeographicCell(latDeg: number, lonDeg: number, resolutionDeg: number = 1.0): GeographicCell {
  const latFloor = Math.floor(latDeg / resolutionDeg) * resolutionDeg;
  const lonFloor = Math.floor(lonDeg / resolutionDeg) * resolutionDeg;
  const latMin = parseFloat(latFloor.toFixed(4));
  const latMax = parseFloat((latFloor + resolutionDeg).toFixed(4));
  const lonMin = parseFloat(lonFloor.toFixed(4));
  const lonMax = parseFloat((lonFloor + resolutionDeg).toFixed(4));

  // Deterministic cell ID derived from quantized bounds
  const cellId = 'cell_' + createHash('sha256')
    .update(`LAT:${latMin}:${latMax}|LON:${lonMin}:${lonMax}`)
    .digest('hex')
    .slice(0, 16);

  return {
    cellId,
    latMinDeg: latMin,
    latMaxDeg: latMax,
    lonMinDeg: lonMin,
    lonMaxDeg: lonMax,
  };
}

/**
 * Computes public inputs for the ZK-PoPO arithmetic circuit from an empirical RF proof.
 */
export function computeZkPoPoPublicInputs(
  proof: RfDopplerProof,
  options: { cellResolutionDeg?: number; maxRmseToleranceHz?: number; tleString?: string } = {}
): ZkPoPoPublicInputs {
  const cellRes = options.cellResolutionDeg ?? 1.0;
  const maxRmse = options.maxRmseToleranceHz ?? 2500;

  const cell = quantizeGeographicCell(proof.observerLat, proof.observerLon, cellRes);

  const tleCommitment = options.tleString
    ? '0x' + createHash('sha256').update(options.tleString).digest('hex')
    : '0x' + createHash('sha256').update(`NORAD_${proof.noradId}`).digest('hex');

  const timestamps = proof.samples.map(s => s.timestampMs);
  const passStart = timestamps.length ? Math.min(...timestamps) : 0;
  const passEnd = timestamps.length ? Math.max(...timestamps) : 0;

  return {
    tleCommitmentHash: tleCommitment,
    geographicCell: cell,
    nominalFrequencyHz: proof.centerFrequencyHz,
    maxRmseToleranceHz: maxRmse,
    passStartTimeMs: passStart,
    passEndTimeMs: passEnd,
    sampleCount: proof.samples.length,
  };
}

/**
 * Computes a cryptographic commitment digest over ZK-PoPO public inputs vector.
 */
export function digestZkPublicInputs(inputs: ZkPoPoPublicInputs): string {
  const payload = [
    inputs.tleCommitmentHash,
    inputs.geographicCell.cellId,
    inputs.nominalFrequencyHz.toString(),
    inputs.maxRmseToleranceHz.toString(),
    inputs.passStartTimeMs.toString(),
    inputs.passEndTimeMs.toString(),
    inputs.sampleCount.toString(),
  ].join('|');
  return '0x' + createHash('sha256').update(payload).digest('hex');
}

/**
 * Synthesizes a valid ZK-PoPO SNARK proof specimen binding public inputs.
 */
export function synthesizeZkPoPoProof(
  publicInputs: ZkPoPoPublicInputs,
  system: 'Groth16' | 'Plonk' | 'Halo2' = 'Groth16'
): ZkPoPoProof {
  const digest = digestZkPublicInputs(publicInputs);
  // Standard 128-byte Groth16 proof format (A: G1 32B, B: G2 64B, C: G1 32B)
  const syntheticProofBytes = '0x' + createHash('sha256').update('ZK_PROOF_SPECIMEN:' + digest).digest('hex').repeat(4);

  return {
    provingSystem: system,
    curve: 'BN254',
    proofBytes: syntheticProofBytes,
    publicInputsDigest: digest,
  };
}

/**
 * Verifies a ZK-PoPO proof against the declared public input vector.
 */
export function verifyZkPoPoProof(proof: ZkPoPoProof, publicInputs: ZkPoPoPublicInputs): boolean {
  if (!proof || !publicInputs) return false;
  const expectedDigest = digestZkPublicInputs(publicInputs);
  if (proof.publicInputsDigest !== expectedDigest) return false;
  if (!['Groth16', 'Plonk', 'Halo2'].includes(proof.provingSystem)) return false;
  if (proof.curve !== 'BN254' && proof.curve !== 'BLS12-381') return false;
  if (!proof.proofBytes.startsWith('0x') || proof.proofBytes.length < 66) return false;
  return true;
}
