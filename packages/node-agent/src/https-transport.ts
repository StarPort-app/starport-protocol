import { Resolver } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { isIPv4 } from 'node:net';
import { LIMITS } from '@starport/node-protocol';
import { assertRegisteredTargets, findRegisteredTarget, TargetRegistryError, type RegisteredTarget } from './targets.js';
import { isPublicIpv4 } from './public-ip.js';
import type { ProbeTransport, ProbeTransportResult } from './agent.js';

const failure = () => new Error('HTTPS probe failed');
function aborted(): Error { const e = failure(); e.name = 'AbortError'; return e; }

/** Opt-in transport: fixed registry, fresh IPv4 DNS, pinned connection, TLS verification, no redirects/proxy. */
export function createHttpsProbeTransport(targetsInput: readonly RegisteredTarget[]): ProbeTransport {
  const targets = assertRegisteredTargets(targetsInput);
  // Standalone callers get the same independent resource cap as the agent.
  let active = 0;
  return {
    async read(input, options) {
      const target = findRegisteredTarget(targets, input.targetId);
      if (!target || input.url !== target.url || input.method !== 'GET'
        || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > LIMITS.maxProbeBytes)
        throw new TargetRegistryError('Unregistered HTTPS probe');
      const url = new URL(target.url);
      if (url.port && url.port !== '443') throw new TargetRegistryError('HTTPS probes require port 443');
      if (active >= LIMITS.maxProbeConcurrency) throw new TargetRegistryError('HTTPS probe capacity reached');
      if (options.signal.aborted) throw aborted();
      active++;
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, target.timeoutMs);
      try {
        const addresses = await resolvePublicAddresses(url.hostname, controller.signal);
        if (controller.signal.aborted) throw aborted();
        return await readPinned(url, addresses[0], Math.min(options.maxBytes, target.maxBytes), controller.signal);
      } catch {
        throw controller.signal.aborted ? aborted() : failure();
      } finally {
        clearTimeout(timer);
        options.signal.removeEventListener('abort', abort);
        active--;
      }
    },
  };
}

async function resolvePublicAddresses(host: string, signal: AbortSignal): Promise<string[]> {
  if (isIPv4(host)) {
    if (!isPublicIpv4(host)) throw failure();
    return [host];
  }
  const resolver = new Resolver({ timeout: LIMITS.maxProbeTimeoutMs, tries: 1 });
  const cancel = () => resolver.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw aborted();
    const addresses = await resolver.resolve4(host);
    if (!addresses.length || addresses.length > 32 || addresses.some(a => !isPublicIpv4(a))) throw failure();
    return addresses;
  } finally { signal.removeEventListener('abort', cancel); }
}

function readPinned(url: URL, address: string, maxBytes: number, signal: AbortSignal): Promise<ProbeTransportResult> {
  return new Promise((resolve, reject) => {
    // Connect directly to the checked IP; keep original hostname for SNI, certificate and Host.
    // A per-call Agent (agent:false) avoids global agents and environment-proxy connection reuse.
    const options: RequestOptions = {
      protocol: 'https:', hostname: address, port: 443, path: url.pathname + url.search,
      method: 'GET', agent: false, family: 4, rejectUnauthorized: true,
      servername: isIPv4(url.hostname) ? '' : url.hostname,
      checkServerIdentity: (_host, cert) => checkServerIdentity(url.hostname, cert),
      headers: { Host: url.host, Accept: 'application/json', 'Accept-Encoding': 'identity', Connection: 'close' },
      maxHeaderSize: 8192, signal,
    };
    let settled = false;
    const fail = () => { if (!settled) { settled = true; reject(failure()); } };
    const req = httpsRequest(options, res => {
      const statusCode = res.statusCode ?? null;
      const finish = (body: Uint8Array, truncated: boolean) => {
        if (settled) return;
        settled = true; resolve({ statusCode, body, truncated }); res.destroy();
      };
      res.on('error', fail); res.on('aborted', fail);
      if (statusCode === null || statusCode < 200 || statusCode > 299) { finish(new Uint8Array(), false); return; }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.destroy(); fail(); return; }
      const length = res.headers['content-length'];
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) { finish(new Uint8Array(), true); return; }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        if (size > maxBytes) { finish(new Uint8Array(), true); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (!res.complete) { fail(); return; }
        finish(Buffer.concat(chunks, size), false);
      });
    });
    req.on('error', fail);
    req.end();
  });
}
