import type { OperatorSigner } from "@starport/node-agent";
import { OPERATOR_MESSAGE_VERSION, encodeCanonical, messageDigest, parseOperatorPublicKey, verifyOperatorSignature, encodeHex } from "@starport/node-protocol";
import { CAPTURE_DOMAIN, CAPTURE_SCHEMA, CAPTURE_STATUS, STARLINK_LAN_TARGET, STARLINK_STATUS_METHOD,
  StarlinkCaptureError, type CaptureReport, type TerminalCapture } from "./types.js";

function canonicalTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const n = Date.parse(value); return Number.isFinite(n) && new Date(n).toISOString() === value;
}
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === keys.sort().join(",");
}
function milli(value: unknown, low: number, high: number): boolean { return value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= low && value <= high; }

/** Separate non-financial capture domain. Existing node-agent receipt/possession
 * guards intentionally do NOT accept this purpose as a service receipt. */
export function captureMessage(capture: TerminalCapture): Uint8Array {
  if (!exact(capture, ["schema","source","target","method","requestedAt","capturedAt","elapsedMs","measurements","completeness","evidenceLevel","hardwareAttested","satelliteIdentity","chainResult"])
    || capture.schema !== CAPTURE_SCHEMA || !["local_grpcurl","injected_transport"].includes(capture.source)
    || capture.target !== STARLINK_LAN_TARGET || capture.method !== STARLINK_STATUS_METHOD
    || !canonicalTime(capture.requestedAt) || !canonicalTime(capture.capturedAt) || capture.capturedAt < capture.requestedAt
    || !Number.isSafeInteger(capture.elapsedMs) || capture.elapsedMs < 0 || capture.elapsedMs > 5000
    || Date.parse(capture.capturedAt) - Date.parse(capture.requestedAt) !== capture.elapsedMs
    || !exact(capture.measurements, ["azimuthMilliDeg","elevationMilliDeg","snrMilliDb","status"])
    || !milli(capture.measurements.azimuthMilliDeg, 0, 360000) || !milli(capture.measurements.elevationMilliDeg, -90000, 90000)
    || !milli(capture.measurements.snrMilliDb, -100000, 100000) || !CAPTURE_STATUS.includes(capture.measurements.status)
    || capture.evidenceLevel !== "self_reported" || capture.hardwareAttested !== false || capture.satelliteIdentity !== null
    || capture.chainResult !== "not_submitted") throw new StarlinkCaptureError("INVALID_STATUS");
  const measurements = capture.measurements;
  if (measurements.azimuthMilliDeg === null && measurements.elevationMilliDeg === null && measurements.snrMilliDb === null && measurements.status === "unknown") throw new StarlinkCaptureError("NO_SUPPORTED_FIELDS");
  const complete = measurements.azimuthMilliDeg !== null && measurements.elevationMilliDeg !== null && measurements.snrMilliDb !== null && measurements.status !== "unknown";
  if (capture.completeness !== (complete ? "complete" : "partial")) throw new StarlinkCaptureError("INVALID_STATUS");
  return encodeCanonical({
    domain: CAPTURE_DOMAIN, purpose: "terminal-status-capture", scheme: OPERATOR_MESSAGE_VERSION, schema: CAPTURE_SCHEMA,
    source: capture.source, target: STARLINK_LAN_TARGET, method: STARLINK_STATUS_METHOD,
    requestedAt: capture.requestedAt, capturedAt: capture.capturedAt, elapsedMs: String(capture.elapsedMs),
    azimuthMilliDeg: measurements.azimuthMilliDeg === null ? "unavailable" : String(measurements.azimuthMilliDeg),
    elevationMilliDeg: measurements.elevationMilliDeg === null ? "unavailable" : String(measurements.elevationMilliDeg),
    snrMilliDb: measurements.snrMilliDb === null ? "unavailable" : String(measurements.snrMilliDb),
    status: measurements.status, completeness: capture.completeness, evidenceLevel: "self_reported",
    hardwareAttested: "false", satelliteIdentity: "unavailable", chainResult: "not_submitted",
  });
}

export function unsignedCaptureReport(capture: TerminalCapture): CaptureReport {
  return { capture: structuredClone(capture), captureDigest: messageDigest(captureMessage(capture)), signature: null };
}

/** Inject a trusted, operator-owned Ed25519 signer. No seed/file/env/key import API. */
export function signCaptureReport(capture: TerminalCapture, signer: OperatorSigner): CaptureReport {
  if (!parseOperatorPublicKey(signer.publicKey)) throw new StarlinkCaptureError("INVALID_SIGNATURE");
  const bytes = captureMessage(capture);
  let signature: string;
  try { signature = encodeHex(signer.sign(bytes)); }
  catch { throw new StarlinkCaptureError("INVALID_SIGNATURE"); }
  if (!verifyOperatorSignature(signer.publicKey, bytes, signature)) throw new StarlinkCaptureError("INVALID_SIGNATURE");
  const digest = messageDigest(bytes);
  return { capture: structuredClone(capture), captureDigest: digest,
    signature: { scheme: "ed25519-raw-v1", domain: CAPTURE_DOMAIN, publicKey: signer.publicKey, statementDigest: digest, signature } };
}

/** Structural/integrity verification only. An authenticated operator artifact
 * is still self-reported, not admitted hardware or a chain receipt. */
export function inspectCaptureReport(value: unknown): "unsigned" | "operator_signed" | "invalid" {
  try {
    if (!exact(value, ["capture","captureDigest","signature"])) return "invalid";
    const message = captureMessage(value.capture as TerminalCapture);
    const digest = messageDigest(message);
    if (value.captureDigest !== digest) return "invalid";
    if (value.signature === null) return "unsigned";
    const signature = value.signature;
    if (!exact(signature, ["scheme","domain","publicKey","statementDigest","signature"])
      || signature.scheme !== "ed25519-raw-v1" || signature.domain !== CAPTURE_DOMAIN
      || signature.statementDigest !== digest || typeof signature.publicKey !== "string" || typeof signature.signature !== "string") return "invalid";
    return verifyOperatorSignature(signature.publicKey, message, signature.signature) ? "operator_signed" : "invalid";
  } catch { return "invalid"; }
}
