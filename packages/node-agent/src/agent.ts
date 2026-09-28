import { createHash } from "node:crypto";
import { EXPECTED_CHAIN_ID, LIMITS, OPERATOR_DOMAIN, OPERATOR_MESSAGE_VERSION, encodeCanonical, safeEqualText } from "@starport/node-protocol";
import { TargetRegistryError, assertRegisteredTargets, findRegisteredTarget, type RegisteredTarget } from "./targets.js";

export interface OperatorSigner {
  readonly publicKey: string;
  sign(message: Uint8Array): Uint8Array;
}

export interface ProbeTransportRequest {
  readonly targetId: string;
  readonly url: string;
  readonly method: "GET";
}

export interface ProbeTransportResult {
  readonly statusCode: number | null;
  readonly body: Uint8Array;
  readonly truncated: boolean;
}

/** Injected read. Implementations must not follow redirects or contact any URL other than request.url. */
export interface ProbeTransport {
  read(request: ProbeTransportRequest, options: { readonly signal: AbortSignal; readonly maxBytes: number }): Promise<ProbeTransportResult>;
}

export interface ProbeRequest {
  readonly targetId: string;
  readonly taskId: string;
  readonly url?: string;
  readonly method?: string;
  readonly rpcMethod?: string;
  readonly body?: unknown;
}

export type ProbeOutcomeKind = "disabled" | "success" | "failure" | "unknown" | "timeout" | "oversized" | "rejected";

export interface ProbeOutcome {
  readonly targetId: string;
  readonly taskId: string;
  readonly outcome: ProbeOutcomeKind;
  readonly observedAt: string;
  readonly bodyDigest: string | null;
  readonly byteLength: number;
  readonly evidenceLevel: "self_reported";
  readonly authenticatesRoute: false;
  readonly detail: string;
}

export interface NodeAgentOptions {
  readonly targets: readonly RegisteredTarget[];
  readonly transport: ProbeTransport;
  readonly clock: () => number;
  readonly runtimeEnabled?: boolean;
  readonly limits?: { readonly maxConcurrency?: number; readonly maxBytes?: number; readonly timeoutMs?: number };
}

export interface NodeAgent {
  readonly runtimeEnabled: boolean;
  probe(request: ProbeRequest): Promise<ProbeOutcome>;
}

const BANNED_TEXT = ["eth_sendRawTransaction", "eth_signTransaction", "eth_sendTransaction", "personal_sign"];

function outcome(request: ProbeRequest, observedAt: string, kind: ProbeOutcomeKind, detail: string, byteLength = 0, bodyDigest: string | null = null): ProbeOutcome {
  return {
    targetId: request.targetId,
    taskId: request.taskId,
    outcome: kind,
    observedAt,
    bodyDigest,
    byteLength,
    evidenceLevel: "self_reported",
    authenticatesRoute: false,
    detail,
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function signBoundedOperatorMessage(signer: OperatorSigner, message: Uint8Array): Uint8Array {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(message);
  } catch (error) {
    if (error instanceof TypeError) throw new TargetRegistryError("Refusing to sign a message outside the operator scheme.");
    throw error;
  }
  const lines = text.split("\n");
  if (lines.shift() !== OPERATOR_MESSAGE_VERSION || lines.pop() !== "" || message.byteLength > LIMITS.maxCanonicalBytes) {
    throw new TargetRegistryError("Refusing to sign a message outside the operator scheme.");
  }
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf("=");
    const name = line.slice(0, separator);
    if (separator < 1 || Object.hasOwn(fields, name)) throw new TargetRegistryError("Operator statement fields are invalid.");
    fields[name] = line.slice(separator + 1);
  }
  const possessionKeys = ["capability", "chainId", "challengeId", "domain", "evidenceReferences", "operatorAddress", "policyVersion", "publicKey", "purpose", "scheme", "sessionId", "signedAt"];
  const receiptKeys = ["assignmentStatementDigest", "attemptId", "chainId", "domain", "evidenceReferences", "intentId", "intentIdPresent", "nodeClaim", "nodeId", "observedAt", "purpose", "registeredTargetId", "registeredTargetPresent", "scheme", "statementVersion", "taskId", "transactionHashes"];
  const expected = fields.purpose === "proof-of-possession" ? possessionKeys : fields.purpose === "receipt" ? receiptKeys : [];
  const actual = Object.keys(fields).sort();
  if (!expected.length || actual.length !== expected.length || actual.some((key, index) => key !== expected[index])
    || fields.domain !== OPERATOR_DOMAIN || fields.chainId !== String(EXPECTED_CHAIN_ID) || fields.scheme !== OPERATOR_MESSAGE_VERSION
    || (fields.purpose === "proof-of-possession" && fields.publicKey !== signer.publicKey)
    || (fields.purpose === "receipt" && (fields.statementVersion !== OPERATOR_MESSAGE_VERSION || fields.intentIdPresent !== "0" || fields.intentId !== ""))
    || !safeEqualText(new TextDecoder().decode(encodeCanonical(fields)), text)) {
    throw new TargetRegistryError("Refusing to sign an unbound operator statement.");
  }
  if (BANNED_TEXT.some((phrase) => text.includes(phrase))) {
    throw new TargetRegistryError("Refusing to sign a transaction payload.");
  }
  const signature = signer.sign(message);
  if (signature.byteLength !== LIMITS.ed25519SignatureBytes) {
    throw new TargetRegistryError("Operator signer returned a signature of the wrong length.");
  }
  return signature;
}

export function createNodeAgent(options: NodeAgentOptions): NodeAgent {
  const targets = assertRegisteredTargets(options.targets);
  const runtimeEnabled = options.runtimeEnabled ?? false;
  if (typeof runtimeEnabled !== "boolean") throw new TargetRegistryError("Runtime enablement must be explicit.");
  const maxConcurrency = options.limits?.maxConcurrency ?? LIMITS.maxProbeConcurrency;
  const maxBytes = options.limits?.maxBytes ?? LIMITS.maxProbeBytes;
  const timeoutMs = options.limits?.timeoutMs ?? LIMITS.maxProbeTimeoutMs;
  if (![maxConcurrency, maxBytes, timeoutMs].every(Number.isSafeInteger) || maxConcurrency < 1 || maxConcurrency > LIMITS.maxProbeConcurrency || maxBytes < 1 || maxBytes > LIMITS.maxProbeBytes || timeoutMs < 100 || timeoutMs > LIMITS.maxProbeTimeoutMs) {
    throw new TargetRegistryError("Node agent limits exceed the bounded probe caps.");
  }
  let inFlight = 0;

  return {
    runtimeEnabled,
    async probe(request) {
      const observedAt = new Date(options.clock()).toISOString();
      if (!runtimeEnabled) return outcome(request, observedAt, "disabled", "Node-agent runtime is disabled.");
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(request.taskId)) {
        return outcome(request, observedAt, "rejected", "Probe task id is invalid.");
      }
      const target = findRegisteredTarget(targets, request.targetId);
      if (!target) return outcome(request, observedAt, "rejected", "Probe target is not registered.");
      if (request.rpcMethod !== undefined || request.body !== undefined || (request.method !== undefined && request.method !== "GET") || (request.url !== undefined && request.url !== target.url)) {
        return outcome(request, observedAt, "rejected", "Probe request is outside the registered HTTPS GET target.");
      }
      if (inFlight >= maxConcurrency) return outcome(request, observedAt, "rejected", "Probe concurrency cap is reached.");
      inFlight += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, target.timeoutMs));
      const byteCap = Math.min(maxBytes, target.maxBytes);
      let transportStarted = false;
      try {
        const result = await new Promise<ProbeTransportResult>((resolve, reject) => {
          const onAbort = () => {
            const error = new Error("Probe timed out.");
            error.name = "AbortError";
            reject(error);
          };
          if (controller.signal.aborted) {
            onAbort();
            return;
          }
          controller.signal.addEventListener("abort", onAbort, { once: true });
          transportStarted = true;
          // A transport ignoring abort keeps its concurrency slot until it settles.
          Promise.resolve().then(() => options.transport.read(
            { targetId: target.id, url: target.url, method: "GET" },
            { signal: controller.signal, maxBytes: byteCap },
          )).then((value) => {
            inFlight -= 1;
            controller.signal.removeEventListener("abort", onAbort);
            if (controller.signal.aborted) onAbort();
            else resolve(value);
          }, (error: unknown) => {
            inFlight -= 1;
            controller.signal.removeEventListener("abort", onAbort);
            reject(error);
          });
        });
        if (controller.signal.aborted) return outcome(request, observedAt, "timeout", "Probe timed out.");
        if (result.truncated || result.body.byteLength > byteCap) {
          return outcome(request, observedAt, "oversized", "Probe response exceeded the size cap.", result.body.byteLength);
        }
        if (result.statusCode === null) return outcome(request, observedAt, "unknown", "Probe result is unknown.", result.body.byteLength);
        if (!Number.isInteger(result.statusCode) || result.statusCode < 200 || result.statusCode > 299) {
          return outcome(request, observedAt, "failure", "Probe failed.", result.body.byteLength);
        }
        const bodyDigest = `0x${createHash("sha256").update(result.body).digest("hex")}`;
        return outcome(request, observedAt, "success", "Bounded HTTPS GET completed. The route stays unauthenticated.", result.body.byteLength, bodyDigest);
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return outcome(request, observedAt, "timeout", "Probe timed out.");
        return outcome(request, observedAt, "failure", "Probe failed.");
      } finally {
        clearTimeout(timer);
        if (!transportStarted) inFlight -= 1;
      }
    },
  };
}

export function createDisabledNodeAgent(targets: readonly RegisteredTarget[], clock: () => number): NodeAgent {
  return createNodeAgent({
    targets,
    clock,
    runtimeEnabled: false,
    transport: {
      read() {
        return Promise.reject(new TargetRegistryError("Node-agent transport is disabled."));
      },
    },
  });
}

export function refusingTransport(): ProbeTransport {
  return {
    read() {
      return Promise.reject(new TargetRegistryError("No probe transport is configured."));
    },
  };
}
