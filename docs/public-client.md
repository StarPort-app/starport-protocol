# Starport Public Read-Only Client

`@starport/read-only-client` is a small, dependency-free ESM workspace package for the **implemented public reads**, not the full application API design. It has no wallet, API-key, cookie, signing, transaction, mutation, arbitrary proxy or webhook interface. Source/package integration does not imply public npm publication.

The current wire version is pinned to `0.6.1-creator-tax-100`; unexpected versions or private/extra response fields fail closed. Updating that pin requires reviewing the corresponding public projection, not merely accepting a new version string.

## Available reads

| SDK method | Fixed endpoint | Interpretation |
| --- | --- | --- |
| `getCapabilities()` | `GET /v1/capabilities` | Application capability state; not financial authority |
| `getLaunchTarget()` | `GET /v1/launch/target` | Planned SPORT/ETH, 0.5% creator fee; no launch is implied |
| `getAssets({limit, q, cursor})` | `GET /v1/assets` | Issuer metadata; active is not trading eligibility |
| `getReferencePrice({address, symbol})` | `GET /v1/market/reference-price` | Underlying-equity USD bid/ask, not multiplier-adjusted and never executable |
| `getCorporateActions()` | `GET /v1/market/corporate-actions` | Issuer-reported Stock Token actions and process dates; not a payout or trade |
| `getChainHead()` | `GET /v1/network/chain-head` | Alchemy-reported latest chain 4663 block; inclusion is not finality |
| `getStarlinkOrbit({site})` | `GET /v1/orbit/starlink` | CelesTrak public GP + SGP4 predictions for a fixed reference location; not RF reception |
| `getOrbitStatus()` | `GET /v1/orbit/status` | Read Starport's durable catalog cache gate without fetching CelesTrak |
| `getNodes({limit, cursor})` | `GET /v1/nodes` | Reviewed public registry projection, not physical routing proof |
| `getReceipts({limit, cursor, nodeId})` | `GET /v1/receipts` | Redacted public statements; inspect evidence and chain-result fields separately |

Page reads default to 20 records, with a 100-record maximum. No method automatically traverses pages or polls. Every method accepts an optional trailing `{signal}` for cancellation. Generic `read(resource, query, {signal})` uses the same fixed resource enum and validation; it cannot accept a path or URL.

## Browser, same-origin

```ts
import {
  createStarportReadClient,
  readFreshness,
  ReadOnlyClientError,
} from '@starport/read-only-client';

const client = createStarportReadClient();
const cancellation = new AbortController();

try {
  const page = await client.getAssets(
    {limit: 20, q: 'SPCX'},
    {signal: cancellation.signal},
  );
  console.log(page.meta.source, page.meta.observedAt);
  console.log(readFreshness('assets', page));
  // Display metadata only. Do not turn this result into signing authorization.
} catch (error) {
  if (!(error instanceof ReadOnlyClientError)) throw error;
  console.log(error.code, error.status, error.detail?.requestId);
  // An unavailable source remains unavailable. No automatic retry or fallback.
}
```

Same-origin requests use relative `/v1/...` paths. Credentials are explicitly omitted even when the application has an authenticated session. These are public reads, not a way to access another account's data.

## Explicit remote mode

```ts
import {
  APPROVED_STARPORT_ORIGIN,
  createStarportReadClient,
} from '@starport/read-only-client';

const client = createStarportReadClient({origin: APPROVED_STARPORT_ORIGIN});
const capabilities = await client.getCapabilities();
```

The approved remote origin is **`https://starport.nexus`**. Both exported origin constants resolve to this public address. Arbitrary hosts, suffix lookalikes, paths, credentials, custom headers and methods are refused. Node callers must select an approved origin explicitly; a relative same-origin path requires a browser origin or an injected offline test transport.

Cross-origin browsers still require the server's CORS permission. The client does not work around CORS or act as a proxy. The fetch/clock injection seams exist for trusted composition and offline tests, never as HTTP or user-facing destination controls.

## Pagination

Use the returned cursor verbatim. Do not invent, decode into a new query, or substitute a cursor from another resource/filter. Cursors are syntax-bounded; the server owns their semantic authorization and snapshot binding.

```ts
import {assertPageContinuation} from '@starport/read-only-client';

const first = await client.getAssets({limit: 20, q: 'STAR'});
// Run this block only after the user requests the next page.
if (first.nextCursor !== null) {
  const cursor = first.nextCursor;
  const second = await client.getAssets({limit: 20, q: 'STAR', cursor});
  assertPageContinuation('assets', first, second, cursor);
  // Keep source metadata with each page. Do not silently merge changed snapshots.
}
```

The SDK rejects repeated cursors, oversized pages, mismatched reference-price identities and mismatched receipt node filters. The continuation helper also rejects changed asset checkpoints, fetch observations, totals and repeated identities. A `409 STALE_DATA` or `CURSOR_CHANGED` error requires a fresh first-page read; it is not permission to keep appending.

## Source and freshness rules

- Every accepted response retains the source, observation time, confirmation state, checkpoint and request ID. Configuration fixtures are identified as configuration, not measurements.
- Asset quantities and multipliers remain exact strings/integers. No binary-floating-point price conversion is performed by the client.
- `readFreshness()` supplies a local age assessment without rewriting the server's source timestamp. Issuer catalogs age after five minutes, corporate-action snapshots after one hour, chain-head observations after 30 seconds, and orbital catalog snapshots after two hours. Reference prices become stale at their own `expiresAt`.
- The orbital read permits only `london`, `singapore`, or `newyork` reference locations. Its source epoch and download time stay distinct; it is a public mathematical model, not a station, observed radio signal, satellite network path, or chain proof. An unavailable provider remains unavailable.
- A reference price is the underlying equity's USD bid/ask. `multiplierAdjusted=false` and `executable=false` are enforced. Neither a fresh response nor a halted/unhalted flag establishes a tradable route or an eligible account.
- Node statements and chain results are distinct. Public registry records cannot establish physical hardware, satellite path or reward entitlement.

## Transport and failure bounds

- GET only; JSON Accept header; `credentials=omit`; redirects rejected.
- Exact response destination checked when the transport supplies one.
- Maximum decoded response body: **1 MiB**; strict UTF-8 and JSON.
- Maximum request deadline: **12 seconds**, including response-body reading.
- At most two in-flight transport operations per client. An injected transport ignoring abort keeps its slot until it settles.
- Abort signals cancel the caller promptly. There is no retry timer, polling loop, fixture fallback or hidden alternate endpoint.
- Typed API errors preserve safe request/recovery metadata. Unknown or malformed error bodies become `INVALID_RESPONSE` rather than being printed raw. `retryable` describes a public GET only; the client never retries automatically.

## Connect explorer

Connect now provides **Explorer / SDK / Access**:

- Explorer performs real same-origin GETs only after **Read endpoint** is selected. It supports the ten current resources, bounded parameters, actual request/response JSON, source context and manual next-page reads.
- Changing a resource or parameter cancels and invalidates the old request, clears its response and prevents late replies from appearing under a new selection. Pagination is bounded to 20 pages per sequence; read the first page again to restart.
- SDK displays an endpoint-specific, escaped read example. Access states accurately that developer-app registration, API keys, webhooks and usage accounting are not implemented.
- No credential-entry form, fake registered app, issued key, webhook delivery or synthetic live response is shown.

## Verification

Focused offline SDK tests cover all ten response shapes, false-provenance rejection, fixed origins/paths, query and cursor limits, typed errors, response bounds, redirects, timeout/cancellation, identity binding and pagination consistency. Explorer tests cover inert construction, explicit reads, late-response fencing, cooldown display, changed-snapshot rejection and read-only examples. A local API injection test exercises the actual configuration handlers and confirms that unconfigured public sources remain typed `503 UNCONFIGURED` errors.

Package build and app TypeScript checks are required alongside these tests. Browser/layout review and hosted deployment are separate root-owned checks; no external service, wallet, credential or financial operation is exercised by the offline tests.
