import { LIMITS } from "@starport/node-protocol";
import { isIPv4 } from 'node:net';
import { isPublicIpv4 } from './public-ip.js';

export class TargetRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetRegistryError";
  }
}

export interface RegisteredTarget {
  readonly id: string;
  readonly kind: "https_get";
  readonly method: "GET";
  readonly url: string;
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".intranet", ".lan"];

function isBlockedIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return true;
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  if (a === 0 || a === 10 || a === 127 || a === 255) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function assertRegisteredTargets(targets: readonly RegisteredTarget[]): readonly RegisteredTarget[] {
  if (targets.length > LIMITS.maxTargets) {
    throw new TargetRegistryError("Registered probe target list exceeds the cap.");
  }
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const target of targets) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(target.id) || ids.has(target.id)) {
      throw new TargetRegistryError("Registered probe target id is invalid or duplicated.");
    }
    if (target.kind !== "https_get" || target.method !== "GET") {
      throw new TargetRegistryError("Registered probe target must be a bounded HTTPS GET.");
    }
    if (!Number.isSafeInteger(target.timeoutMs) || target.timeoutMs < 100 || target.timeoutMs > LIMITS.maxProbeTimeoutMs) {
      throw new TargetRegistryError("Registered probe target timeout is outside the cap.");
    }
    if (!Number.isSafeInteger(target.maxBytes) || target.maxBytes < 1 || target.maxBytes > LIMITS.maxProbeBytes) {
      throw new TargetRegistryError("Registered probe target size cap is outside the bound.");
    }
    let parsed: URL;
    try {
      parsed = new URL(target.url);
    } catch (error) {
      if (error instanceof TypeError) throw new TargetRegistryError("Registered probe target URL is invalid.");
      throw error;
    }
    const host = parsed.hostname.toLowerCase();
    const blockedHost = host.length === 0
      || !host.includes(".")
      || host.endsWith(".")
      || host === "localhost"
      || host === "0.0.0.0"
      || host.includes(":")
      || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
      || isBlockedIpv4(host)
      || (isIPv4(host) && !isPublicIpv4(host));
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "" || blockedHost || urls.has(parsed.href)) {
      throw new TargetRegistryError("Registered probe target must be a distinct public HTTPS GET URL.");
    }
    if (target.url !== parsed.href) throw new TargetRegistryError("Registered probe target URL must be canonical.");
    ids.add(target.id);
    urls.add(parsed.href);
  }
  return Object.freeze(targets.map((target) => Object.freeze({ ...target })));
}

export function findRegisteredTarget(targets: readonly RegisteredTarget[], id: string): RegisteredTarget | null {
  return targets.find((target) => target.id === id) ?? null;
}
