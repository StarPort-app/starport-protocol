export const STARLINK_LAN_TARGET = "192.168.100.1:9200" as const;
export const STARLINK_STATUS_METHOD = "SpaceX.API.Device.Device/Handle" as const;
export const STARLINK_STATUS_REQUEST = '{"get_status":{}}' as const;
export const CAPTURE_SCHEMA = "starport-starlink-terminal-capture/v1" as const;
export const CAPTURE_DOMAIN = "starport-terminal-capture/v1" as const;
export const CAPTURE_MAX_BYTES = 65_536;
export const CAPTURE_TIMEOUT_MS = 5_000;
export const CAPTURE_STATUS = ["connected", "searching", "booting", "stowed", "offline", "unknown"] as const;

export type CaptureCode = "OPT_IN_REQUIRED" | "INVALID_OPTIONS" | "DEPENDENCY_MISSING" | "CAPTURE_FAILED" | "CAPTURE_TIMEOUT" | "CAPTURE_TOO_LARGE" | "INVALID_STATUS" | "NO_SUPPORTED_FIELDS" | "CAPTURE_BUSY" | "INVALID_SIGNATURE";
const messages: Record<CaptureCode, string> = {
  OPT_IN_REQUIRED: "Terminal capture is disabled. Explicit local capture and LAN consent are required.",
  INVALID_OPTIONS: "Unsupported capture options. The target, request, and method are fixed.",
  DEPENDENCY_MISSING: "A trusted local grpcurl executable is required. Nothing was installed or contacted.",
  CAPTURE_FAILED: "The local gRPC read failed. Check terminal reachability and server reflection support locally.",
  CAPTURE_TIMEOUT: "The terminal capture exceeded its deadline.",
  CAPTURE_TOO_LARGE: "The terminal response exceeded the capture size limit.",
  INVALID_STATUS: "The terminal returned invalid or conflicting supported fields.",
  NO_SUPPORTED_FIELDS: "This response does not expose supported status, pointing, or SNR fields.",
  CAPTURE_BUSY: "A terminal capture is already in progress.",
  INVALID_SIGNATURE: "The operator signer did not produce a valid scoped capture signature.",
};
export class StarlinkCaptureError extends Error {
  constructor(readonly code: CaptureCode) { super(messages[code]); this.name = "StarlinkCaptureError"; }
}

export interface TerminalMeasurements {
  readonly azimuthMilliDeg: number | null;
  readonly elevationMilliDeg: number | null;
  readonly snrMilliDb: number | null;
  readonly status: (typeof CAPTURE_STATUS)[number];
}
export interface TerminalCapture {
  readonly schema: typeof CAPTURE_SCHEMA;
  readonly source: "local_grpcurl" | "injected_transport";
  readonly target: typeof STARLINK_LAN_TARGET;
  readonly method: typeof STARLINK_STATUS_METHOD;
  readonly requestedAt: string;
  readonly capturedAt: string;
  readonly elapsedMs: number;
  readonly measurements: TerminalMeasurements;
  readonly completeness: "complete" | "partial";
  readonly evidenceLevel: "self_reported";
  readonly hardwareAttested: false;
  readonly satelliteIdentity: null;
  readonly chainResult: "not_submitted";
}
export interface CaptureSignature {
  readonly scheme: "ed25519-raw-v1";
  readonly domain: typeof CAPTURE_DOMAIN;
  readonly publicKey: string;
  readonly statementDigest: string;
  readonly signature: string;
}
export interface CaptureReport {
  readonly capture: TerminalCapture;
  /** Digest of sanitized canonical fields only, never a raw-device-response hash. */
  readonly captureDigest: string;
  readonly signature: CaptureSignature | null;
}
export interface TerminalTransportRequest {
  readonly target: typeof STARLINK_LAN_TARGET;
  readonly method: typeof STARLINK_STATUS_METHOD;
  readonly body: typeof STARLINK_STATUS_REQUEST;
}
export interface TerminalCaptureTransport {
  readonly source: TerminalCapture["source"];
  read(request: TerminalTransportRequest, options: { readonly signal: AbortSignal; readonly maxBytes: number }): Promise<Uint8Array>;
}
export type CaptureResult = {readonly status: "captured"; readonly report: CaptureReport}
  | {readonly status: "disabled" | "unavailable" | "rejected"; readonly code: CaptureCode; readonly message: string};
