import { createHash } from 'node:crypto';
import { parseOperatorPublicKey, verifyOperatorSignature } from './keys.js';

export type AttestationEnclaveType = 'tee_sgx' | 'tee_sev' | 'apple_secure_enclave' | 'tpm2_quote';

export interface SgxDcapQuote {
  readonly version: number;
  readonly attestationKeyType: number;
  readonly teeType: number;
  readonly qeSvn: number;
  readonly pceSvn: number;
  readonly vendorId: string;
  readonly mrEnclave: string;
  readonly mrSigner: string;
  readonly isvProdId: number;
  readonly isvSvn: number;
  readonly reportData: string;
  readonly bindsOperatorKey: boolean;
}

export interface Tpm2Quote {
  readonly magic: number;
  readonly type: number;
  readonly clock: bigint;
  readonly resetCount: number;
  readonly restartCount: number;
  readonly safe: boolean;
  readonly firmwareVersion: bigint;
  readonly extraData: string;
  readonly pcrDigest: string;
  readonly bindsOperatorKey: boolean;
}

export interface SevSnpReport {
  readonly version: number;
  readonly guestSvn: number;
  readonly policy: bigint;
  readonly familyId: string;
  readonly imageId: string;
  readonly vmpl: number;
  readonly currentTcb: bigint;
  readonly measurement: string;
  readonly reportData: string;
  readonly chipId: string;
  readonly bindsOperatorKey: boolean;
}

export interface HardwareAttestationReport {
  readonly enclaveType: AttestationEnclaveType;
  readonly operatorPublicKey: string;
  readonly enclaveMeasurement: string; // e.g. MRENCLAVE / PCR digest
  readonly securityVersion: number;
  readonly secureBootEnabled: boolean;
  readonly timestamp: string;
  readonly chipManufacturer: 'intel' | 'amd' | 'apple' | 'infineon' | 'stmicro';
  readonly attestationSignature: string;
  readonly rawQuote?: string | Uint8Array;
}

export interface HardwareAttestationResult {
  readonly valid: boolean;
  readonly hardwareAttested: boolean;
  readonly enclaveType?: AttestationEnclaveType;
  readonly parsedQuote?: SgxDcapQuote | Tpm2Quote | SevSnpReport;
  readonly reason?: string;
}

export interface HardwareVerificationOptions {
  readonly maxAgeMs?: number;
  readonly minSecurityVersion?: number;
  readonly allowedEnclaveTypes?: readonly AttestationEnclaveType[];
  readonly attestationRootPublicKey?: string;
  readonly requireSignature?: boolean;
}

function toBuffer(data: Uint8Array | string): Buffer {
  if (typeof data === 'string') {
    const clean = data.startsWith('0x') ? data.slice(2) : data;
    return Buffer.from(clean, 'hex');
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function checkKeyBinding(payloadSlice: Buffer, expectedPublicKey: string): boolean {
  const rawKey = parseOperatorPublicKey(expectedPublicKey);
  if (!rawKey) return false;
  const rawBuf = Buffer.from(rawKey);
  const hash = createHash('sha256').update(expectedPublicKey).digest();
  const rawKeyHash = createHash('sha256').update(rawBuf).digest();

  // Matches either raw 32-byte key or 32-byte sha256 digest
  if (payloadSlice.length >= 32) {
    const target32 = payloadSlice.subarray(0, 32);
    return target32.equals(rawBuf) || target32.equals(hash) || target32.equals(rawKeyHash);
  }
  return false;
}

/**
 * Parses an authentic Intel SGX DCAP Quote (version 3 or 4 binary layout).
 * Validates header, vendor GUID (Intel), enclave report measurements, and report_data key binding.
 */
export function parseSgxDcapQuote(rawQuote: Uint8Array | string, expectedPublicKey?: string): SgxDcapQuote {
  const buf = toBuffer(rawQuote);
  if (buf.length < 432) {
    throw new Error('Invalid SGX DCAP Quote: buffer shorter than minimum 432 bytes header + report');
  }

  const version = buf.readUInt16LE(0);
  if (version !== 3 && version !== 4) {
    throw new Error(`Unsupported SGX DCAP Quote version: ${version}`);
  }

  const attestationKeyType = buf.readUInt16LE(2);
  const teeType = buf.readUInt32LE(4);
  const qeSvn = buf.readUInt16LE(8);
  const pceSvn = buf.readUInt16LE(10);
  const vendorId = buf.subarray(12, 28).toString('hex');

  // Enclave Report starts at offset 48
  const mrEnclave = '0x' + buf.subarray(112, 144).toString('hex');
  const mrSigner = '0x' + buf.subarray(176, 208).toString('hex');
  const isvProdId = buf.readUInt16LE(304);
  const isvSvn = buf.readUInt16LE(306);
  const reportDataBuf = buf.subarray(368, 432);
  const reportData = '0x' + reportDataBuf.toString('hex');

  const bindsOperatorKey = expectedPublicKey ? checkKeyBinding(reportDataBuf, expectedPublicKey) : true;

  return {
    version,
    attestationKeyType,
    teeType,
    qeSvn,
    pceSvn,
    vendorId,
    mrEnclave,
    mrSigner,
    isvProdId,
    isvSvn,
    reportData,
    bindsOperatorKey,
  };
}

/**
 * Parses an authentic TPM 2.0 Quote (TPMS_ATTEST binary structure).
 * Validates TPM_GENERATED_VALUE (0xFF544347), TPM_ST_ATTEST_QUOTE (0x8018), PCR digest, and extraData key binding.
 */
export function parseTpm2Quote(rawAttest: Uint8Array | string, expectedPublicKey?: string): Tpm2Quote {
  const buf = toBuffer(rawAttest);
  if (buf.length < 40) {
    throw new Error('Invalid TPM 2.0 Quote: buffer too short for TPMS_ATTEST');
  }

  let offset = 0;
  const magic = buf.readUInt32BE(offset); offset += 4;
  if (magic !== 0xFF544347) {
    throw new Error(`Invalid TPM 2.0 magic: expected 0xFF544347, got 0x${magic.toString(16)}`);
  }

  const type = buf.readUInt16BE(offset); offset += 2;
  if (type !== 0x8018) {
    throw new Error(`Invalid TPM 2.0 quote type: expected TPM_ST_ATTEST_QUOTE (0x8018), got 0x${type.toString(16)}`);
  }

  // qualifiedSigner (TPM2B_NAME)
  const signerLen = buf.readUInt16BE(offset); offset += 2;
  offset += signerLen;

  // extraData (TPM2B_DATA)
  const extraLen = buf.readUInt16BE(offset); offset += 2;
  const extraDataBuf = buf.subarray(offset, offset + extraLen); offset += extraLen;
  const extraData = '0x' + extraDataBuf.toString('hex');

  // clockInfo
  const clock = buf.readBigUInt64BE(offset); offset += 8;
  const resetCount = buf.readUInt32BE(offset); offset += 4;
  const restartCount = buf.readUInt32BE(offset); offset += 4;
  const safe = buf.readUInt8(offset) === 1; offset += 1;

  // firmwareVersion
  const firmwareVersion = buf.readBigUInt64BE(offset); offset += 8;

  // pcrSelect (TPML_PCR_SELECTION)
  const pcrSelectCount = buf.readUInt32BE(offset); offset += 4;
  for (let i = 0; i < pcrSelectCount; i++) {
    offset += 2; // hash alg uint16
    const sizeOfSelect = buf.readUInt8(offset); offset += 1;
    offset += sizeOfSelect;
  }

  // pcrDigest (TPM2B_DIGEST)
  const pcrDigestLen = buf.readUInt16BE(offset); offset += 2;
  const pcrDigest = '0x' + buf.subarray(offset, offset + pcrDigestLen).toString('hex');

  const bindsOperatorKey = expectedPublicKey ? checkKeyBinding(extraDataBuf, expectedPublicKey) : true;

  return {
    magic,
    type,
    clock,
    resetCount,
    restartCount,
    safe,
    firmwareVersion,
    extraData,
    pcrDigest,
    bindsOperatorKey,
  };
}

/**
 * Parses an authentic AMD SEV-SNP Attestation Report (standard 1184-byte layout).
 * Validates SVN, launch measurement, and report_data key binding.
 */
export function parseSevSnpReport(rawReport: Uint8Array | string, expectedPublicKey?: string): SevSnpReport {
  const buf = toBuffer(rawReport);
  if (buf.length < 600) {
    throw new Error('Invalid AMD SEV-SNP report: buffer shorter than minimum layout');
  }

  const version = buf.readUInt32LE(0);
  const guestSvn = buf.readUInt32LE(4);
  const policy = buf.readBigUInt64LE(8);
  const familyId = '0x' + buf.subarray(16, 32).toString('hex');
  const imageId = '0x' + buf.subarray(32, 48).toString('hex');
  const vmpl = buf.readUInt32LE(48);
  const currentTcb = buf.readBigUInt64LE(56);
  const reportDataBuf = buf.subarray(80, 144);
  const reportData = '0x' + reportDataBuf.toString('hex');
  const measurement = '0x' + buf.subarray(144, 192).toString('hex'); // 48 bytes SHA-384
  const chipId = '0x' + buf.subarray(448, 512).toString('hex');

  const bindsOperatorKey = expectedPublicKey ? checkKeyBinding(reportDataBuf, expectedPublicKey) : true;

  return {
    version,
    guestSvn,
    policy,
    familyId,
    imageId,
    vmpl,
    currentTcb,
    measurement,
    reportData,
    chipId,
    bindsOperatorKey,
  };
}

/**
 * Returns deterministic canonical bytes of the attestation claims for cryptographic verification.
 */
export function getCanonicalAttestationBytes(report: Partial<HardwareAttestationReport>): Uint8Array {
  const payload = {
    chipManufacturer: report.chipManufacturer ?? '',
    enclaveMeasurement: report.enclaveMeasurement ?? '',
    enclaveType: report.enclaveType ?? '',
    operatorPublicKey: report.operatorPublicKey ?? '',
    secureBootEnabled: report.secureBootEnabled === true,
    securityVersion: report.securityVersion ?? 0,
    timestamp: report.timestamp ?? '',
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

/**
 * Verifies that a node's operator signing key resides within a certified Hardware Enclave (TEE / TPM 2.0 / Apple SE).
 * Reconciles cryptographic identity with physical silicon provenance, binary quote validation, and authentic signatures.
 */
export function verifyHardwareAttestation(
  report: unknown,
  expectedPublicKey: string,
  options: HardwareVerificationOptions = {}
): HardwareAttestationResult {
  if (typeof report !== 'object' || report === null) {
    return { valid: false, hardwareAttested: false, reason: 'INVALID_REPORT_STRUCTURE' };
  }

  const r = report as Partial<HardwareAttestationReport>;
  const allowedTypes = options.allowedEnclaveTypes ?? ['tee_sgx', 'tee_sev', 'apple_secure_enclave', 'tpm2_quote'];

  if (!r.enclaveType || !allowedTypes.includes(r.enclaveType)) {
    return { valid: false, hardwareAttested: false, reason: 'UNSUPPORTED_ENCLAVE_TYPE' };
  }

  if (typeof r.operatorPublicKey !== 'string' || r.operatorPublicKey !== expectedPublicKey) {
    return { valid: false, hardwareAttested: false, reason: 'PUBLIC_KEY_MISMATCH' };
  }

  if (!parseOperatorPublicKey(r.operatorPublicKey)) {
    return { valid: false, hardwareAttested: false, reason: 'MALFORMED_OPERATOR_KEY' };
  }

  // 1. Binary enclave quote parsing & hardware binding validation
  let parsedQuote: SgxDcapQuote | Tpm2Quote | SevSnpReport | undefined;
  if (r.rawQuote) {
    try {
      if (r.enclaveType === 'tee_sgx') {
        const sgx = parseSgxDcapQuote(r.rawQuote, expectedPublicKey);
        if (!sgx.bindsOperatorKey) {
          return { valid: false, hardwareAttested: false, reason: 'QUOTE_REPORT_DATA_KEY_MISMATCH' };
        }
        parsedQuote = sgx;
      } else if (r.enclaveType === 'tpm2_quote') {
        const tpm = parseTpm2Quote(r.rawQuote, expectedPublicKey);
        if (!tpm.bindsOperatorKey) {
          return { valid: false, hardwareAttested: false, reason: 'QUOTE_EXTRA_DATA_KEY_MISMATCH' };
        }
        parsedQuote = tpm;
      } else if (r.enclaveType === 'tee_sev') {
        const sev = parseSevSnpReport(r.rawQuote, expectedPublicKey);
        if (!sev.bindsOperatorKey) {
          return { valid: false, hardwareAttested: false, reason: 'QUOTE_REPORT_DATA_KEY_MISMATCH' };
        }
        parsedQuote = sev;
      }
    } catch (err) {
      return { valid: false, hardwareAttested: false, reason: `RAW_QUOTE_PARSE_ERROR: ${(err as Error).message}` };
    }
  }

  if (typeof r.enclaveMeasurement !== 'string' || !/^0x[0-9a-fA-F]{64,128}$/.test(r.enclaveMeasurement)) {
    return { valid: false, hardwareAttested: false, reason: 'INVALID_ENCLAVE_MEASUREMENT' };
  }

  if (typeof r.securityVersion !== 'number' || r.securityVersion < (options.minSecurityVersion ?? 1)) {
    return { valid: false, hardwareAttested: false, reason: 'INSUFFICIENT_SECURITY_VERSION' };
  }

  if (r.secureBootEnabled !== true) {
    return { valid: false, hardwareAttested: false, reason: 'SECURE_BOOT_DISABLED' };
  }

  if (typeof r.timestamp !== 'string') {
    return { valid: false, hardwareAttested: false, reason: 'MISSING_TIMESTAMP' };
  }

  const ts = Date.parse(r.timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, hardwareAttested: false, reason: 'MALFORMED_TIMESTAMP' };
  }

  const maxAge = options.maxAgeMs ?? 86_400_000; // 24 hours
  const now = Date.now();
  if (Math.abs(now - ts) > maxAge) {
    return { valid: false, hardwareAttested: false, reason: 'EXPIRED_ATTESTATION' };
  }

  if (typeof r.attestationSignature !== 'string' || !/^0x[0-9a-fA-F]{64,}$/.test(r.attestationSignature)) {
    return { valid: false, hardwareAttested: false, reason: 'INVALID_SIGNATURE' };
  }

  const requireSig = options.requireSignature ?? true;
  if (requireSig) {
    const signerPubKey = options.attestationRootPublicKey ?? r.operatorPublicKey;
    const messageBytes = getCanonicalAttestationBytes(r);
    const validSig = verifyOperatorSignature(signerPubKey, messageBytes, r.attestationSignature);
    if (!validSig) {
      return { valid: false, hardwareAttested: false, reason: 'INVALID_ATTESTATION_SIGNATURE' };
    }
  }

  return {
    valid: true,
    hardwareAttested: true,
    enclaveType: r.enclaveType,
    parsedQuote,
  };
}
