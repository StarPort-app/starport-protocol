# Read-Only Issuer Catalog — Phase 2

## Decision

Use the existing `GET /v1/assets` boundary rather than introduce a second asset identity system. Its local implementation projects validated Robinhood Stock Token metadata, not prices or executable market access. The public contract is version `0.4.0-readonly-catalog`; all70 existing operation IDs remain. The private application implements only a read-only subset, not all planned operations.

The primary source is Robinhood's [Stock Token API documentation](https://docs.robinhood.com/chain/stock-token-apis/) and fixed public [assets endpoint](https://api.robinhood.com/rhj/assets). A direct read on September26,2026 returned195 records for chain4663 and included tokenDecimals, current/pending multipliers and issuer names/status. This observed count is not hardcoded application data or a promise about future catalog size. No account or wallet information is sent to that endpoint.

## Wire contract

- Response: `{ data: Asset[], meta: DataMeta, nextCursor: string | null, total: number }`.
- New query `q` is at most80 characters, normalized and matched locally against name, symbol and contract address. Existing limit1–100 and bounded cursor remain.
- A record's identity is chain ID plus canonical address. Same-symbol assets cannot replace the configured SPCX address; duplicate contradictory identities reject the source response.
- `issuer` adds reported ID/name/status/ISIN and pending-multiplier information. No upstream logo URL or arbitrary fetch URL is returned or followed by the adapter.
- Issuer decimals are labeled `decimalsVerified=false`; multipliers use exact18-decimal raw integer strings, not floating-point conversion. `marketStatus=unknown`, `marketContext=null` and financial capability flags remain unchanged.
- Issuer ACTIVE does not mean a wallet is eligible, a venue exists, a market is open or a quote can execute. Stock Token metadata is not a claim of direct shareholder rights.

## Source and cache semantics

The adapter has one fixed upstream URL, bounded size/count/time, rejects redirects and malformed payloads, and coalesces concurrent refreshes. Retrieval time is `meta.observedAt`; it is not the issuer's last-update time. No block or chain confirmation is fabricated.

A fresh cache can serve repeated reads without another upstream call. Refresh failure may serve a validated last-known snapshot only within its bounded stale window, retaining its original timestamp and `freshness=stale`. A missing/expired/invalid snapshot returns a typed error, never sample rows or a successful empty catalog. The local disk cache contains only public normalized metadata and is not the account database.

Pagination binds to the source snapshot and search context. Do not merge pages with incompatible snapshots or silently reinterpret a stale cursor. UI search, selection and pagination are local browsing actions; quote creation, authentication, signatures, payments, delegation and rewards remain disabled.

## Verification boundary

Adapter and data-shape tests use explicit test-only responses and injected clocks/transports. No deterministic test should depend on the live issuer service. A separately recorded live smoke read checks acquisition only; it does not prove venue liquidity, onchain bytecode, asset eligibility or financial settlement. See application `docs/asset-catalog-backend.md` for concrete cache bounds and implemented checks.
