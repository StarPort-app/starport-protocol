# Optional Local Starlink Terminal Capture

## What is implemented

`@starport/starlink-operator` is an operator-side, one-shot read adapter. It can invoke an **already installed, operator-reviewed `grpcurl` executable** to request local Starlink terminal status. It is disabled by default and is not started by importing the package, building the application, opening Network, or enrolling a node.

This is actual transport code, not a successful-capture fixture. The transport has **not been exercised against physical hardware** in this work. Tests inject synthetic responses and a fake child process and preserve `source=injected_transport`.

## Fixed operation and opt-in

The only target is `192.168.100.1:9200`; the only method is `SpaceX.API.Device.Device/Handle`; the only request is `{"get_status":{}}`. This is the read-only local command documented in SkyRelay's terminal guide.

After the package has been built, the operator may explicitly invoke:

```sh
node packages/starlink-operator/dist/cli.js --help

# Operator action only, on an authorized terminal LAN.
node packages/starlink-operator/dist/cli.js \
  --capture --allow-lan-starlink --grpcurl /absolute/path/to/grpcurl
```

The executable path must be absolute and name `grpcurl`. The operator is responsible for selecting a trusted binary. The package does not download, install, search PATH for, or certify that binary. Both opt-in flags are required; arbitrary targets, request bodies, extra command arguments, credentials and signing flags are rejected without echoing their contents.

There is no HTTP listener, browser traffic interception, SOCKS/CONNECT proxy, user-transaction transport, network scan, polling daemon or upload command. The package must not be installed as a remotely callable LAN proxy in the hosted application.

## Privacy and bounds

- The child runs with `shell=false`, an empty environment, isolated stdout/stderr and closed stdin. Operator credentials and terminal input are not forwarded.
- One capture at a time; five-second maximum deadline; 64 KiB response cap. Oversize output, stderr floods and timeout terminate the owned child. An injected transport that ignores abort retains its concurrency slot until it settles.
- The raw response is parsed only in local memory. Only azimuth, elevation, SNR and a known status label are projected into the result.
- Coordinates, raw terminal/device IDs, device-ID hashes, hardware/software versions, diagnostics, uptime, traffic and latency measurements are neither returned nor included in the capture digest. Raw stderr and upstream error text are never printed.
- The output uses `azimuthMilliDeg`, `elevationMilliDeg`, `snrMilliDb` and `status`. Values follow the reviewed SkyRelay field aliases; malformed/conflicting aliases fail rather than silently selecting one.
- Missing fields remain `null`; missing SNR is not zero and is never synthesized from orbit data. Unknown firmware status enums remain `unknown`. A response exposing none of the supported fields fails with `NO_SUPPORTED_FIELDS`.
- `requestedAt` and `capturedAt` are the operator process's timestamps. They are not trusted device time or a satellite observation timestamp.

Even these whitelisted pointing values and times can reveal operational patterns. There is no automatic external publication; operators must review any later sharing policy separately.

## Evidence schema and signing boundary

The typed wire contract lives in `src/types.ts` under schema `starport-starlink-terminal-capture/v1`.

The CLI produces one `CaptureResult`: either a sanitized `captured` report or an explicit `disabled`, `unavailable` or `rejected` result. A captured report contains:

- `capture`: fixed endpoint/method, transport provenance, request/capture times, duration and whitelisted measurements;
- `captureDigest`: SHA-256 of the sanitized canonical capture fields only;
- `signature`: `null` for CLI output, or a separate optional operator signature produced by trusted local library composition.

All captures retain `evidenceLevel=self_reported`, `hardwareAttested=false`, `satelliteIdentity=null` and `chainResult=not_submitted`.

`signCaptureReport(capture, signer)` accepts the existing node-agent **`OperatorSigner` port**, not a key, seed, wallet, file or environment variable. It derives bounded canonical bytes from exact capture fields, uses the existing Ed25519 representation and verifies the returned signature before exposing a signed artifact. `inspectCaptureReport()` checks structure, sanitized digest and optional signature and returns `unsigned`, `operator_signed` or `invalid`; it does not approve a device, node or reward.

The capture uses a **separate domain** (`starport-terminal-capture/v1`) and purpose (`terminal-status-capture`). It reuses the existing operator canonical encoding and crypto primitives, but is **not** an existing `proof-of-possession` or `receipt` message. The node-agent's `signBoundedOperatorMessage` intentionally rejects this purpose. A capture must never be relabeled as an accepted task receipt or sent to the current receipt endpoint as if it were one.

An operator signature proves who signed this artifact, not that a real terminal produced it. The local gRPC endpoint is unauthenticated, a local network can imitate it, and the operator can fabricate data. This adapter provides no hardware attestation, satellite identity, end-to-end satellite-route proof, Robinhood Chain finality, node admission or reward eligibility.

## Exact remaining blockers

1. No `grpcurl` executable or compatible `.proto` bundle was found in the inspected environment. No dependency was installed and no terminal was contacted.
2. The fixed command relies on terminal **server reflection**. If firmware does not support it, this package fails with a sanitized `CAPTURE_FAILED`; it does not fetch an arbitrary descriptor or switch to another endpoint. A reviewed official descriptor bundle and a separately reviewed bounded loader would be additional work.
3. Physical device/firmware validation is outstanding, including which pointing, SNR and state fields that firmware exposes.
4. Current node tasks support registered **HTTPS** observations and evidence reviews, not this local gRPC capture purpose. Backend ingestion, explicit assigned capture scope, replay/freshness handling, public projection and any trusted local signer integration need separate review before activation. None is enabled by this package.
5. Enterprise API credential handling, cloud proxying and account integration are out of scope and not implemented.

## Reuse record

The SkyRelay MIT parser's camel/snake field aliases and numeric projection were adapted, not its wider telemetry envelope or recursive private-field traversal. In particular, Starport does not carry its `egress`, GPS, terminal IDs or diagnostic fields into a capture report.

- Reviewed protocol checkout HEAD: `c7ddf05adf50b15b009df8202541e4a79de49c79`.
- `packages/core/src/telemetry/parse.ts` SHA-256: `50bb2a0d796b38ca70042c995b4e505c2e4bcfabf1c87c71b1759a3afb499d3c`.
- Related reviewed `privacy.ts` SHA-256: `b48526a97330f13e1905517637c4ee22ca82da144777236116e7f2df6aa9450c`.
- Reviewed test behavior: millidegree/millidB projection and GPS/raw-UTID stripping; no original fixture corpus was copied.
- The complete copyright and permission notice is included in the new package's `SKYRELAY-MIT.txt`. No BSC runtime, deployment settings, wallet material, simulator or GPL console engine is imported.

The package manifest and local tsconfig are ready for root workspace/build integration. It depends only on the existing node-agent type port, node-protocol crypto/canonical helpers and Node built-ins; `grpcurl` remains an explicit operator prerequisite.

## Verification scope

Focused tests exercise opt-in refusal, allowed field aliases, omitted SNR, conflicting/malformed data, privacy projection, no raw-input digest, timeout/concurrency, fixed subprocess arguments, empty environment, bounded stdout/stderr, scoped signing, rejection by the existing receipt-signing guard, report inspection, and inert CLI behavior. Only synthetic injected data and ephemeral in-memory test keys are used. Compilation and `--help` are verified, not real hardware capture or admission.
