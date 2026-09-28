# R4 API Design Delta

## Scope

`starport-protocol/specs/openapi.json` extends the previous R3 `0.2.0-design` contract to `0.3.0-design-r4`. It contains **70 operations**, preserving all **69 R3 operation IDs** and adding only the invoice issuer-authorization operation. This is a design artifact, not an implemented service, deployment, or signing action. Production servers remain absent, and financial execution/server signing remain disabled.

## Invoice Issuance Is Now Explicit

1. Existing `POST /v1/invoices` creates a **private immutable draft**. Open/restricted policy, payee, asset, exact amount, public note, version and expiry are fixed before signing.
2. If the reviewed router and environment are configured, the private response includes `InvoiceIssuerReview`: exact EIP-712 domain, fixed field types, message, hashes, version and bounded `signBefore`. Missing configuration produces no signing request.
3. The **issuer's wallet**, not the server, signs `InvoiceTerms`. The wallet-session authentication signature is never reused. Integer values use decimal strings in typed data; time is canonical Unix seconds, while ordinary API timestamps remain ISO date-time strings.
4. New **`POST /v1/invoices/{id}/issuer-authorization`** accepts `reviewId`, `invoiceVersion`, `expectedDigest`, and the issuer signature. It recomputes the digest from stored terms, checks ownership/domain/expiry/version, and verifies the issuer EOA signature or EIP-1271 contract-wallet authorization where applicable.
5. Only after verification does the request become issued (`issuedAt`, authorized metadata, `state=open`). Retire the signing review. Duplicate scoped requests return the same resource; changed bodies conflict. Signatures are write-only/scoped artifacts and never public examples or list-response fields.
6. `GET /v1/invoices/{id}` exposes `InvoiceView` only for **issued** requests. Drafts remain private and cannot be paid. Issued open requests support anonymous links/QR; issued restricted requests preserve issuer/named-payer access checks.
7. Payment preparation requires the issued digest/version and actual authenticated payer. The wallet-called router verifies the issuer request and exact recipient, asset, amount, expiry and single-settlement key. Contract-wallet authorization may be revocable, so issuance verification is not treated as perpetual validity.

The signature authenticates a request; it does not approve the payer's funds or cause a payment. The payer still independently confirms its own bounded wallet transaction. Existing hash-only submission and canonical invoice-event reconciliation are unchanged.

The canonical typed invoice ID is `keccak256(UTF8("StarportInvoice:" + canonicalAsciiInvoiceId))`. `InvoiceTerms` binds that ID, version, payee, asset, raw amount, optional authorized payer (zero address for open requests), expiry and terms hash under the configured router domain. Implementations must freeze the encoding with the proposed contract before activation; no digest vector or runtime verification is claimed here.

## Trade Uses Wallet-Called Execution

- `Intent.executionMode` is `wallet_direct`. A valid configured intent exposes its bounded unsigned `walletRequest`; `requiresUserSignature` means the wallet transaction confirmation, not a backend relay signature.
- Keep the existing `/v1/intents/{id}/authorization` operation ID, but mark that route **reserved and disabled** for R4. It rejects with `CAPABILITY_DISABLED` without retaining a financial signature. No unspecified relayer is introduced.
- Record the wallet-returned transaction hash in existing `POST /v1/reconciliations` using the owned intent ID and `knownTransactionHashes`. The operation independently matches the exact call/events; it never broadcasts or replaces a transaction. No additional Trade submission endpoint is needed.
- Add sticky `walletRequestReleased` history. Safe offchain cancellation requires a draft with no executable request ever released; a potentially signed request requires expiry/invalidation and reconciliation instead.
- PONS quote preparation must validate the deployed curve/hook fee identities, including a wrapper's caller identity. Unknown or bypassed opening-protection semantics block the route rather than generating a wallet-based guessed quote.

## Confirmed Targets and Three-Day Epochs

- Record ticker **SPORT**, but keep its token address null pending deployment.
- Record the supplied treasury target **`0xAf3eAA38a445392f1E9d1faE463871998745cb75`** without claiming ownership, wallet type, or an observed PONS beneficiary. Actual launch-recipient binding remains gated on deployed source/ABI verification and must not silently change the initiating account.
- Preserve SPCX quote identity and the **50 bps** creator-tax target. No additional SPORT transfer tax or Starport wrapper fee is introduced.
- Initial earning epochs are **259,200 seconds (3 days)**, contiguous from an explicitly configured `firstStartTimestamp`. Epoch `n` is `[anchor+n×259200, anchor+(n+1)×259200)`. Unknown anchor/times stay null and unconfigured. There is no weekday/weekly alignment.
- The proposed per-funded-epoch budget cap is `min(explicit asset raw cap, 25% of actual reconciled spendable surplus)`, subject to separate approval and funding—not APR or a guaranteed payout.
- The 72-hour root challenge happens to have the same duration but is a different clock. Seven-day principal exit, 90-day claims, and other bounded policy periods are unchanged. Several 3-day epochs may overlap in review; earning completion is not payment completion.

## Handoff and Validation Limits

New component schemas specify issuer domain, exact message/types, private review, verification metadata and authorization input. Existing invoice, payment-preparation, intent, launch-target and epoch schemas are aligned without adding an execution API.

Validation for this handoff is limited to JSON parsing, component/reference consistency, operation IDs, and bounded structural constraints. No service tests, chain calls, signing tests, contract simulations, packages, or live-repository writes were performed. Contract addresses, actual role control, eligibility integration, venues and finality readers still require the activation evidence described in `contract-integration-r4.md`.
