import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { CAPTURE_MAX_BYTES, STARLINK_LAN_TARGET, STARLINK_STATUS_METHOD, STARLINK_STATUS_REQUEST,
  StarlinkCaptureError, type TerminalCaptureTransport } from "./types.js";

/** Trusted test/local embedding seam, never supplied by HTTP or CLI arguments.
 * Any injected process or executable checker marks the result as injected. */
export interface GrpcurlDependencies {
  readonly spawn?: (file: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
  readonly checkExecutable?: (path: string) => Promise<void>;
}

export function grpcurlArguments(): readonly string[] {
  // The exact read operation documented by SkyRelay. No arbitrary method,
  // descriptor import, header, request JSON, target, or extra flag is accepted.
  return ["-plaintext", "-d", STARLINK_STATUS_REQUEST, STARLINK_LAN_TARGET, STARLINK_STATUS_METHOD];
}

async function checkExecutable(path: string): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a regular executable");
    await access(path, constants.X_OK);
  } catch { throw new StarlinkCaptureError("DEPENDENCY_MISSING"); }
}

/** Constructs an inert operator-local gRPC bridge. Needs an already installed,
 * operator-reviewed grpcurl binary and terminal server reflection at runtime. */
export function createGrpcurlTransport(executablePath: string, dependencies?: GrpcurlDependencies): TerminalCaptureTransport {
  if (typeof executablePath !== "string" || !isAbsolute(executablePath) || basename(executablePath) !== "grpcurl"
    || executablePath.length > 4096 || /[\u0000-\u001f\u007f]/.test(executablePath)) throw new StarlinkCaptureError("INVALID_OPTIONS");
  const spawnProcess = dependencies?.spawn ?? ((file, args, options) => spawn(file, args, options));
  const check = dependencies?.checkExecutable ?? checkExecutable;
  return {
    source: dependencies ? "injected_transport" : "local_grpcurl",
    async read(request, options) {
      if (Object.keys(request).sort().join(",") !== "body,method,target"
        || request.target !== STARLINK_LAN_TARGET || request.method !== STARLINK_STATUS_METHOD || request.body !== STARLINK_STATUS_REQUEST
        || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > CAPTURE_MAX_BYTES) throw new StarlinkCaptureError("INVALID_OPTIONS");
      if (options.signal.aborted) throw new StarlinkCaptureError("CAPTURE_TIMEOUT");
      await check(executablePath);
      if (options.signal.aborted) throw new StarlinkCaptureError("CAPTURE_TIMEOUT");
      return new Promise<Uint8Array>((resolve, reject) => {
        let child: ChildProcessWithoutNullStreams;
        try {
          child = spawnProcess(executablePath, grpcurlArguments(), {
            shell: false, windowsHide: true, cwd: "/", env: {},
          });
        } catch { reject(new StarlinkCaptureError("CAPTURE_FAILED")); return; }
        // Do not forward operator stdin, ambient credentials, or terminal output.
        child.stdin.end();
        let settled = false;
        let stdoutBytes = 0, stderrBytes = 0;
        const chunks: Buffer[] = [];
        const clean = () => {
          options.signal.removeEventListener("abort", abort);
          child.stdout.removeListener("data", output);
          child.stderr.removeListener("data", errors);
          chunks.length = 0;
        };
        const failure = (error: StarlinkCaptureError) => {
          if (settled) return;
          settled = true;
          child.kill("SIGKILL");
          clean(); reject(error);
        };
        const abort = () => failure(new StarlinkCaptureError("CAPTURE_TIMEOUT"));
        const output = (part: Buffer | string) => {
          if (settled) return;
          const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
          stdoutBytes += bytes.byteLength;
          if (stdoutBytes > options.maxBytes) { failure(new StarlinkCaptureError("CAPTURE_TOO_LARGE")); return; }
          chunks.push(bytes);
        };
        const errors = (part: Buffer | string) => {
          // Count for bounds, but never retain or print stderr/device details.
          stderrBytes += Buffer.isBuffer(part) ? part.byteLength : Buffer.byteLength(part);
          if (stderrBytes > options.maxBytes) failure(new StarlinkCaptureError("CAPTURE_TOO_LARGE"));
        };
        child.stdout.on("data", output); child.stderr.on("data", errors);
        child.once("error", (error: NodeJS.ErrnoException) => failure(new StarlinkCaptureError(error.code === "ENOENT" ? "DEPENDENCY_MISSING" : "CAPTURE_FAILED")));
        child.once("close", (code) => {
          if (settled) return;
          if (code !== 0) { failure(new StarlinkCaptureError("CAPTURE_FAILED")); return; }
          const body = new Uint8Array(Buffer.concat(chunks));
          settled = true; clean(); resolve(body);
        });
        options.signal.addEventListener("abort", abort, { once: true });
        if (options.signal.aborted) abort();
      });
    },
  };
}
