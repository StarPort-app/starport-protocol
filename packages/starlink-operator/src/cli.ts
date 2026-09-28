#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { createGrpcurlTransport } from "./grpcurl.js";
import { createStarlinkOperator } from "./operator.js";
import { StarlinkCaptureError, type TerminalCaptureTransport } from "./types.js";

const HELP = `Starport local Starlink terminal capture

Read one sanitized terminal status snapshot. Disabled unless explicitly opted in.

Usage:
  starport-starlink-capture --help
  starport-starlink-capture --capture --allow-lan-starlink --grpcurl /absolute/path/to/grpcurl

Fixed target: 192.168.100.1:9200
Fixed request: get_status (local, unauthenticated gRPC)
Output: one unsigned, non-financial JSON capture; no upload or raw device response.
Requires an operator-reviewed grpcurl binary and terminal server reflection.
No wallet keys, custom URLs, browser interception, polling, signing or relay flags.
`;

export interface CaptureCliIo { readonly out: (text: string) => void; readonly error: (text: string) => void; }
/** Injection is for offline tests and trusted local composition, never CLI input. */
export interface CaptureCliDependencies { readonly transport?: TerminalCaptureTransport; }

export async function runCaptureCli(args: readonly string[], io: CaptureCliIo, dependencies: CaptureCliDependencies = {}): Promise<number> {
  if (args.length === 0 || args.length === 1 && args[0] === "--help") { io.out(HELP); return 0; }
  try {
    if (args.length !== 4 || args[0] !== "--capture" || args[1] !== "--allow-lan-starlink" || args[2] !== "--grpcurl") {
      throw new StarlinkCaptureError("INVALID_OPTIONS");
    }
    // Validate the path even under injection; never turn a bad CLI option into a fixture success.
    const transport = createGrpcurlTransport(args[3]!);
    const operator = createStarlinkOperator({ enabled: true, allowFixedLanTarget: true, transport: dependencies.transport ?? transport });
    const result = await operator.capture();
    io.out(`${JSON.stringify(result)}\n`);
    return result.status === "captured" ? 0 : 2;
  } catch (error) {
    const safe = error instanceof StarlinkCaptureError ? error : new StarlinkCaptureError("CAPTURE_FAILED");
    io.error(`${safe.code}: ${safe.message}\n`);
    return 2;
  }
}

// Importing this module is inert. The executable never signs or uploads a report.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runCaptureCli(process.argv.slice(2), {
    out: text => process.stdout.write(text), error: text => process.stderr.write(text),
  });
}
