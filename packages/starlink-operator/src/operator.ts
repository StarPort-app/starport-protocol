import { parseStarlinkStatus } from "./parse.js";
import { unsignedCaptureReport } from "./signature.js";
import { CAPTURE_MAX_BYTES, CAPTURE_SCHEMA, CAPTURE_TIMEOUT_MS, STARLINK_LAN_TARGET, STARLINK_STATUS_METHOD, STARLINK_STATUS_REQUEST,
  StarlinkCaptureError, type CaptureResult, type TerminalCapture, type TerminalCaptureTransport } from "./types.js";

export interface StarlinkOperatorOptions {
  readonly enabled?: boolean;
  readonly allowFixedLanTarget?: boolean;
  readonly transport?: TerminalCaptureTransport;
  readonly clock?: () => number;
  readonly timeoutMs?: number;
}
export interface StarlinkOperator { capture(): Promise<CaptureResult>; }

function result(status: "disabled" | "unavailable" | "rejected", error: StarlinkCaptureError): CaptureResult {
  return { status, code: error.code, message: error.message };
}

/** No server, polling, file input, URL option, relay, or automatic upload. */
export function createStarlinkOperator(options: StarlinkOperatorOptions = {}): StarlinkOperator {
  if (Object.keys(options).some(key => !["enabled","allowFixedLanTarget","transport","clock","timeoutMs"].includes(key))
    || options.enabled !== undefined && typeof options.enabled !== "boolean"
    || options.allowFixedLanTarget !== undefined && typeof options.allowFixedLanTarget !== "boolean") throw new StarlinkCaptureError("INVALID_OPTIONS");
  const clock = options.clock ?? Date.now;
  const timeoutMs = options.timeoutMs ?? CAPTURE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > CAPTURE_TIMEOUT_MS) throw new StarlinkCaptureError("INVALID_OPTIONS");
  let inFlight = false;
  return {
    async capture(...args: unknown[]): Promise<CaptureResult> {
      if (args.length) return result("rejected", new StarlinkCaptureError("INVALID_OPTIONS"));
      if (options.enabled !== true || options.allowFixedLanTarget !== true) return result("disabled", new StarlinkCaptureError("OPT_IN_REQUIRED"));
      const transport = options.transport;
      if (!transport) return result("unavailable", new StarlinkCaptureError("DEPENDENCY_MISSING"));
      if (inFlight) return result("rejected", new StarlinkCaptureError("CAPTURE_BUSY"));
      const start = clock();
      if (!Number.isSafeInteger(start) || !Number.isFinite(new Date(start).getTime())) return result("rejected", new StarlinkCaptureError("INVALID_OPTIONS"));
      inFlight = true;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new StarlinkCaptureError("CAPTURE_TIMEOUT")); }, timeoutMs);
      });
      // A misbehaving injected transport retains the single-flight slot until it
      // settles. A UI retry never creates a second dangling LAN request.
      const work = Promise.resolve().then(() => transport.read({ target: STARLINK_LAN_TARGET, method: STARLINK_STATUS_METHOD, body: STARLINK_STATUS_REQUEST },
        { signal: controller.signal, maxBytes: CAPTURE_MAX_BYTES })).finally(() => { inFlight = false; });
      try {
        const raw = await Promise.race([work, deadline]);
        if (!(raw instanceof Uint8Array) || raw.byteLength > CAPTURE_MAX_BYTES) throw new StarlinkCaptureError("CAPTURE_TOO_LARGE");
        let payload: unknown;
        try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
        catch { throw new StarlinkCaptureError("INVALID_STATUS"); }
        const measurements = parseStarlinkStatus(payload);
        const end = clock();
        if (!Number.isSafeInteger(end) || end < start || end - start > timeoutMs) throw new StarlinkCaptureError("CAPTURE_TIMEOUT");
        const complete = measurements.azimuthMilliDeg !== null && measurements.elevationMilliDeg !== null && measurements.snrMilliDb !== null && measurements.status !== "unknown";
        const capture: TerminalCapture = {
          schema: CAPTURE_SCHEMA, source: transport.source, target: STARLINK_LAN_TARGET, method: STARLINK_STATUS_METHOD,
          requestedAt: new Date(start).toISOString(), capturedAt: new Date(end).toISOString(), elapsedMs: end - start,
          measurements, completeness: complete ? "complete" : "partial", evidenceLevel: "self_reported",
          hardwareAttested: false, satelliteIdentity: null, chainResult: "not_submitted",
        };
        return { status: "captured", report: unsignedCaptureReport(capture) };
      } catch (error) {
        return result("unavailable", error instanceof StarlinkCaptureError ? error : new StarlinkCaptureError("CAPTURE_FAILED"));
      } finally { clearTimeout(timer); }
    },
  };
}
