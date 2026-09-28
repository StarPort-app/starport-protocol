// SPDX-License-Identifier: MIT
// Field alias handling adapted from SkyRelay's MIT telemetry parser.
// Provenance and permission notice are in ../SKYRELAY-MIT.txt.
import { CAPTURE_STATUS, StarlinkCaptureError, type TerminalMeasurements } from "./types.js";

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

function numeric(value: unknown): number {
  if (typeof value === "string" && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) && value.length <= 32) value = Number(value);
  if (typeof value !== "number" || !Number.isFinite(value)) throw new StarlinkCaptureError("INVALID_STATUS");
  return value;
}

function optionalNumber(raw: Record<string, unknown>, aliases: readonly string[], minimum: number, maximum: number, exclusiveMax = false): number | null {
  const values = aliases.filter(key => Object.hasOwn(raw, key)).map(key => numeric(raw[key]));
  if (values.length === 0) return null;
  const n = values[0]!;
  if (n < minimum || (exclusiveMax ? n >= maximum : n > maximum) || values.some(value => value !== n)) throw new StarlinkCaptureError("INVALID_STATUS");
  return Math.round(n * 1000);
}

/** Whitelist projection, not recursive redaction. Raw IDs, coordinates, device
 * versions, traffic/latency statistics, diagnostics and unknown fields never leave it. */
export function parseStarlinkStatus(value: unknown): TerminalMeasurements {
  if (!record(value)) throw new StarlinkCaptureError("INVALID_STATUS");
  const containers = ["dishGetStatus", "dish_get_status"].filter(key => Object.hasOwn(value, key));
  if (containers.length > 1) throw new StarlinkCaptureError("INVALID_STATUS");
  const raw = containers.length ? value[containers[0]!] : value;
  if (!record(raw)) throw new StarlinkCaptureError("INVALID_STATUS");
  const azimuthMilliDeg = optionalNumber(raw, ["boresightAzimuthDeg", "boresight_azimuth_deg"], 0, 360, true);
  const elevationMilliDeg = optionalNumber(raw, ["boresightElevationDeg", "boresight_elevation_deg"], -90, 90);
  const snrMilliDb = optionalNumber(raw, ["snrDb", "snr_db", "snr"], -100, 100);
  // Numeric/unknown firmware enum values are not guessed to mean connected.
  const label = typeof raw.state === "string" ? raw.state.toLowerCase() : "unknown";
  const status = CAPTURE_STATUS.find(candidate => candidate === label) ?? "unknown";
  if (azimuthMilliDeg === null && elevationMilliDeg === null && snrMilliDb === null && status === "unknown") throw new StarlinkCaptureError("NO_SUPPORTED_FIELDS");
  return { azimuthMilliDeg, elevationMilliDeg, snrMilliDb, status };
}
