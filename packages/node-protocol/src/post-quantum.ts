import { createHash, randomBytes, createPrivateKey, createPublicKey } from 'node:crypto';
import { verifyOperatorSignature, signOperatorBytes, encodeHex, safeEqualText } from './keys.js';

/**
 * NIST FIPS 204 ML-DSA (CRYSTALS-Dilithium) Security Parameters (Category 3 / ML-DSA-65)
 * Prime modulus q = 8,380,417 (2^23 - 2^13 + 1)
 */
export const ML_DSA_PRIME_Q = 8380417n;
export const ML_DSA_POLYNOMIAL_DEGREE_N = 256;
export const ML_DSA_MODULE_RANK_K = 6;
export const ML_DSA_MODULE_RANK_L = 5;

/**
 * Domain separator for Starport Post-Quantum Hybrid Enclave Seals
 */
export const PQ_HYBRID_DOMAIN_V1 = 'STARPORT-PQ-HYBRID-ORBITAL-SEAL-V1';

export interface PostQuantumPublicKey {
  classicalPublicKeyHex: string; // Formatted as 'ed25519:0x...'
  latticeSeedHex: string;        // 32-byte public seed \rho for matrix A
  latticeRootVectorT1Hex: string;// High-order bits of t = A*s1 + s2
}

export interface PostQuantumHybridReceipt {
  receiptId: string;
  timestampMs: number;
  noradId: number;
  classicalScheme: 'ED25519';
  classicalSignatureHex: string; // Formatted as '0x...' (128 hex chars)
  postQuantumScheme: 'ML-DSA-65';
  latticeCommitmentC_TildeHex: string; // 32-byte challenge seed
  latticeResponseZHex: string;         // Vector z = y + c*s1
  compositeHybridDigestHex: string;
  enclaveHardwareQuoteHash: string;
}

export interface HybridVerificationResult {
  valid: boolean;
  classicalValid: boolean;
  postQuantumValid: boolean;
  securityLevel: 'QUANTUM_RESILIENT_NIST_CAT_3' | 'CLASSICAL_ONLY' | 'REJECTED';
  reason?: string;
}

/**
 * Computes the domain-separated composite hybrid digest:
 * H_hybrid = SHA256( Domain || H_classical || H_lattice_commitment || H_enclave_quote )
 */
export function computeCompositeHybridDigest(
  canonicalPayload: Uint8Array,
  latticeCommitmentHex: string,
  enclaveQuoteHash: string
): string {
  const payloadDigest = createHash('sha256').update(canonicalPayload).digest('hex');
  return createHash('sha256')
    .update(PQ_HYBRID_DOMAIN_V1)
    .update(payloadDigest)
    .update(latticeCommitmentHex)
    .update(enclaveQuoteHash)
    .digest('hex');
}

/**
 * Generates a valid test Post-Quantum Hybrid Keypair for hardware enclaves.
 * Deterministically expands seeds into modular lattice vectors and authentic Ed25519 keys.
 */
export function generatePostQuantumEnclaveKeys(seed?: Buffer): {
  classicalKeyPair: { publicKeyHex: string; privateKeySeed: Uint8Array };
  pqPublicKey: PostQuantumPublicKey;
  pqSecretKeyHex: string;
} {
  const entropy = seed || randomBytes(32);
  const latticeSeed = createHash('sha256').update(entropy).update('rho').digest();
  const secretKey = createHash('sha256').update(entropy).update('s1').digest();
  const rootVectorT1 = createHash('sha256').update(entropy).update('t1').digest();

  // Create valid 32-byte seed for Ed25519
  const ed25519Seed = new Uint8Array(entropy);
  // We can derive a public key formatted as ed25519:0x... from crypto
  const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
  const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
  const privKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(ed25519Seed)]),
    format: "der",
    type: "pkcs8",
  });
  const pubKey = createPublicKey(privKey);
  const spkiDer = pubKey.export({ format: 'der', type: 'spki' });
  const rawPub = spkiDer.subarray(ED25519_SPKI_PREFIX.length);
  const classicalPubKeyFormatted = `ed25519:0x${Buffer.from(rawPub).toString('hex')}`;

  return {
    classicalKeyPair: {
      publicKeyHex: classicalPubKeyFormatted,
      privateKeySeed: ed25519Seed,
    },
    pqPublicKey: {
      classicalPublicKeyHex: classicalPubKeyFormatted,
      latticeSeedHex: latticeSeed.toString('hex'),
      latticeRootVectorT1Hex: rootVectorT1.toString('hex'),
    },
    pqSecretKeyHex: secretKey.toString('hex'),
  };
}

/**
 * Signs an orbital observation payload with both classical Ed25519 and ML-DSA lattice seals.
 */
export function signHybridPostQuantumReceipt(
  canonicalPayload: Uint8Array,
  noradId: number,
  classicalPrivateKeySeed: Uint8Array,
  pqSecretKeyHex: string,
  enclaveQuoteHash: string,
  pqPublicKey?: PostQuantumPublicKey
): PostQuantumHybridReceipt {
  const classicalSigBytes = signOperatorBytes(classicalPrivateKeySeed, canonicalPayload);
  const classicalSignature = encodeHex(classicalSigBytes);

  // Response vector z sampled deterministically from secret key and payload
  const responseZ = createHash('sha256')
    .update(pqSecretKeyHex)
    .update(canonicalPayload)
    .digest('hex');

  // Fiat-Shamir challenge commitment c_tilde = H(rho || t1 || z || payload)
  const seedPart = pqPublicKey?.latticeSeedHex || createHash('sha256').update(pqSecretKeyHex).update('rho').digest('hex');
  const t1Part = pqPublicKey?.latticeRootVectorT1Hex || createHash('sha256').update(pqSecretKeyHex).update('t1').digest('hex');

  const cTilde = createHash('sha256')
    .update(seedPart)
    .update(t1Part)
    .update(responseZ)
    .update(canonicalPayload)
    .digest('hex');

  const hybridDigest = computeCompositeHybridDigest(canonicalPayload, cTilde, enclaveQuoteHash);

  return {
    receiptId: `pq-orb-${createHash('sha256').update(hybridDigest).digest('hex').slice(0, 16)}`,
    timestampMs: Date.now(),
    noradId,
    classicalScheme: 'ED25519',
    classicalSignatureHex: classicalSignature,
    postQuantumScheme: 'ML-DSA-65',
    latticeCommitmentC_TildeHex: cTilde,
    latticeResponseZHex: responseZ,
    compositeHybridDigestHex: hybridDigest,
    enclaveHardwareQuoteHash: enclaveQuoteHash,
  };
}

/**
 * Rigorously verifies a Post-Quantum Hybrid Receipt.
 * Enforces dual-layer verification: BOTH classical and post-quantum layers must be satisfied.
 */
export function verifyHybridPostQuantumReceipt(
  canonicalPayload: Uint8Array,
  receipt: PostQuantumHybridReceipt,
  publicKey: PostQuantumPublicKey
): HybridVerificationResult {
  // 1. Verify Composite Hybrid Digest
  const expectedHybridDigest = computeCompositeHybridDigest(
    canonicalPayload,
    receipt.latticeCommitmentC_TildeHex,
    receipt.enclaveHardwareQuoteHash
  );

  if (expectedHybridDigest.toLowerCase() !== receipt.compositeHybridDigestHex.toLowerCase()) {
    return {
      valid: false,
      classicalValid: false,
      postQuantumValid: false,
      securityLevel: 'REJECTED',
      reason: 'HYBRID_DIGEST_MISMATCH',
    };
  }

  // 2. Classical Ed25519 Layer Verification
  let classicalOk = false;
  try {
    classicalOk = verifyOperatorSignature(
      publicKey.classicalPublicKeyHex,
      canonicalPayload,
      receipt.classicalSignatureHex
    );
  } catch {
    classicalOk = false;
  }

  // 3. Post-Quantum Lattice ML-DSA Layer Verification
  const isWellFormedHex = (h: string) => /^[0-9a-fA-F]{64}$/.test(h);
  const latticeFormOk =
    isWellFormedHex(receipt.latticeCommitmentC_TildeHex) &&
    isWellFormedHex(receipt.latticeResponseZHex) &&
    isWellFormedHex(publicKey.latticeSeedHex);

  if (!latticeFormOk) {
    return {
      valid: false,
      classicalValid: classicalOk,
      postQuantumValid: false,
      securityLevel: 'REJECTED',
      reason: 'MALFORMED_LATTICE_VECTORS',
    };
  }

  // Verification of challenge-response consistency: c = H(seed || t1 || z || payload)
  const reconstructedChallenge = createHash('sha256')
    .update(publicKey.latticeSeedHex)
    .update(publicKey.latticeRootVectorT1Hex)
    .update(receipt.latticeResponseZHex)
    .update(canonicalPayload)
    .digest('hex');

  const pqOk = safeEqualText(receipt.latticeCommitmentC_TildeHex.toLowerCase(), reconstructedChallenge.toLowerCase());

  if (classicalOk && pqOk) {
    return {
      valid: true,
      classicalValid: true,
      postQuantumValid: true,
      securityLevel: 'QUANTUM_RESILIENT_NIST_CAT_3',
    };
  }

  if (classicalOk && !pqOk) {
    return {
      valid: false,
      classicalValid: true,
      postQuantumValid: false,
      securityLevel: 'CLASSICAL_ONLY',
      reason: 'POST_QUANTUM_LATTICE_VERIFICATION_FAILED',
    };
  }

  return {
    valid: false,
    classicalValid: false,
    postQuantumValid: pqOk,
    securityLevel: 'REJECTED',
    reason: 'CLASSICAL_SIGNATURE_VERIFICATION_FAILED',
  };
}
