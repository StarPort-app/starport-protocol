# Contract and Trust Boundaries

## Status

This is a design requirement set, not deployed bytecode, an audited implementation, an ABI, or authorization to launch or transact. The public repository specifies shared asset identities, bounded authorizations, receipts, accounting, and API contracts. The private application owns authentication, indexing, operational configuration, and deployment orchestration. Neither repository may imply that a design-only surface is a functioning financial service.

All nine product modules remain available in the design, with Network as the default home. These product modules do not require nine contracts or nine microservices. The smallest architecture is a shared application API and worker with narrowly separated financial contract responsibilities only where custody, authorization, or accounting requires them.

## Fixed Product Requirements and Recorded Evidence

- Chain target: Robinhood Chain, 4663.
- Launch quote and creator-fee asset: SPCX at `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa`, 18 decimals. A matching ticker is not an acceptable substitute.
- Creator-tax target: 50 bps (0.50%). The recorded exact-match source review confirms support for this rate. The separately recorded 100 bps base curve fee is not a creator-tax minimum.
- The project name is Starport and ticker is SPORT. The user-selected treasury recipient is `0xAf3eAA38a445392f1E9d1faE463871998745cb75`; address checksum was checked offline, not control or account type. The token contract remains pending deployment; no token has been launched here.
- Raw SPCX income remains SPCX. Gas is ETH; payment assets, delegation principal, and reward assets are separately configured identities.
- Automatic conversion is disabled. An SPCX reference valuation cannot fund a nonexistent USDG balance.

The evidence and its limits are recorded in [PONS / SPCX evidence](pons-spcx.md). This document does not make a new chain observation. Mutable launch configuration, beneficiary, asset eligibility, and deployed bytecode must be reverified immediately before a separately authorized launch.

## Roles and Powers

| Role | Permitted Responsibility | Prohibited Inference or Authority |
| --- | --- | --- |
| User wallet | Authenticate, review exact limits, independently sign an approved action, submit through its chosen wallet | Authentication signature is not a financial signature; connecting a wallet grants no spending power |
| Application API | Verify session and eligibility, create bounded drafts/preparations, return sourced read models | No private keys, wallet imports, user signing, arbitrary broadcast endpoint, or treasury key |
| Indexer / reconciliation worker | Observe canonical chain events, classify finality, detect reorgs, update reversible read models | RPC acceptance is not finality; a failed or uncertain read is not permission to retry an economic action |
| Starlink gateway | Accept an assigned, authorized relay task within fixed bounds | Cannot change recipient, asset, amount, adapter, chain, nonce or deadline; holds no user key |
| RF observer | Supply evidence for an approved observation target | Not automatically a Starlink gateway or an execution validator |
| Evidence reviewer | Review a defined evidence scope under a published policy | Does not claim physical reception, chain consensus, fraud, or finality solely from a review result |
| Enrollment reviewer | Approve capability claims and suspend unsafe service under policy | Different addresses or keys do not establish independent operators |
| Reward allocator | Propose budget-bounded allocations for an already-funded epoch | Cannot create funding, spend principal, bypass eligibility, or claim on behalf of users |
| Treasury approver / multisig | Approve explicitly bounded protocol expenses and reward funding | Web-admin access alone is not treasury signing authority; user principal is outside its spending budget |
| Developer key | Read its permitted public projections within project quotas | Not a user consent grant, operator session, financial signer, or key-management role |

Administrative and financial authority must not collapse into a single API role. Production signer access stays outside CI and public examples. A future operational key must have an explicit role, environment, revocation process, and minimum capability.

## Planned Financial Responsibilities

Names below describe logical responsibilities, not deployed contract names or promised interfaces. Their exact ABI and deployment topology require review before implementation.

### Bounded Intent Executor

If a relayed transaction path is implemented, its verifier must enforce the exact signed domain and limits: chain ID, verifying contract, schema version, intent ID, user, permitted adapter, input/output assets, raw input amount, minimum output, maximum fee, recipient, deadline, nonce, and market-context hash. Replay protection is per domain and user; a successful or consumed authorization cannot be replayed through a second gateway.

Adapters are allowlisted implementations, not caller-supplied arbitrary target/calldata pairs. Execution rechecks the relevant market pause, current multiplier/context, price freshness, token allowance, amount bounds, expiry, and eligibility at the enforceable boundary. A node vote cannot replace a check that can be verified onchain. If the selected asset or adapter cannot enforce a required condition, the capability stays unavailable.

The reviewed design must define event identity, whether an attempted reverted execution consumes a nonce, cancellation/nonces, fee transfer timing, and atomic rollback. Those are safety-critical semantics, not details for a frontend to guess. Offchain draft cancellation cannot invalidate a financial signature that has already been released. Contract-level invalidation, where supported, is a separate user-authorized onchain action with its own race and finality handling.

### Delegation Principal Boundary

Delegation represents service participation, not base-chain PoS consensus. A future vault, if used, accepts only the explicitly approved project-token asset and records the user's credited principal independently of project revenue. SPORT is the selected ticker, but the deployed token identity is still unconfigured, so deposit preparation remains unavailable.

Required invariants:

- No principal is lent, spent on payroll, converted to Stock Tokens, or included in protocol revenue by default.
- Deposits, exit requests, cooldown completion, and withdrawals have distinct events and state transitions.
- Withdrawal authority belongs to the recorded principal owner, with the first-version recipient restricted to that owner.
- A cooldown starts at the contract-policy-defined confirmed event, not when a web request is accepted.
- Pending or unknown withdrawals retain their original identity; no duplicate withdrawal is prepared merely because a screen timed out.
- Transfer-fee, rebasing, or nonstandard token behavior must be explicitly supported and tested or rejected; nominal requested amounts cannot silently replace actual credited principal.
- No discretionary admin confiscation or implicit slashing is included. Any future slashing design requires explicit terms, evidence scope, challenge procedure, authority, and independent review.

### Funded Reward Distribution

A distributor, if adopted, holds only explicitly funded reward assets. Each epoch binds its asset, confirmed funding, reserved/unavailable amount, allocation policy, eligibility policy, claim window, and participant allocations. R4 selects funded, immutable finalized Merkle epoch commitments with full-manifest review, a bounded challenge window and explicit aggregate-allocation trust limits. See contract-integration-r4.md and node-rewards-policy-r4.md; no implementation or deployed distributor is implied.

Required invariants:

- Finalized claimed amount never exceeds allocations, and allocations never exceed confirmed unreserved funding in the same asset.
- Each allocation binds epoch, participant, asset, amount, and deployment domain; one allocation cannot pay twice.
- A claim is paid only to the authorized participant under the applicable eligibility policy.
- Claim preparation is not funding, claiming, or a promise of yield.
- Unknown, stale, expired, or denied eligibility blocks preparation and execution where enforceable.
- No allocation update may retroactively redirect or duplicate an already claimed entitlement.
- Pause, recovery of unallocated funds, claim expiry, and residual-fund ownership require explicit published terms; an admin button cannot silently rewrite them.

SPCX may fund direct rewards only when its transfer and distribution eligibility rules are satisfied. Stock Token status does not itself establish permission for every region or wallet to receive a reward.

### Shareable Invoice Settlement

Open invoice links and QR requests may expose public-safe terms with no payer assigned at creation. Restricted requests may name one authorized payer. Neither form is a signature or a bearer spending grant. At payment preparation, the API derives the actual payer from the authenticated session and binds recipient, chain, asset, exact amount, invoice ID/version, accepted terms, deadline and scoped idempotency.

An approved invoice-aware payment adapter must enforce one settlement per chain/contract/invoice/version key. A database reservation alone cannot prevent duplicate externally submitted transactions. The matched settlement event must identify the invoice/version and correspond to the prepared payer, recipient, asset and amount. A generic same-amount transfer, partial transfer, or arbitrary reported transaction is not invoice payment evidence. Canonical event identity may be credited only once; finality completes payment, while reorganizations restore reconciliation rather than triggering an automatic second payment.

The API keeps one active invoice settlement reservation and does not disclose another payer's private details. It must not release an uncertain reservation until enforced expiry or invalidation and canonical reconciliation establish safety. Adapters without these binding and single-settlement guarantees stay unavailable for invoice payment preparation.

### Treasury and External PONS Fees

The app observes PONS fee events and balances; it does not invent a new fee by moving an existing fee between locations. Accrued → Swept → Claimable → Claimed are accounting stages, with partial amounts tracked by transfer. Do not add those stages as independent revenue.

Recognize spendable protocol revenue only after source, historical beneficiary entitlement, finality, and received wallet balance reconcile. Changing a fee recipient does not transfer fees previously owed to another beneficiary. Use `(chainId, transactionHash, logIndex)` for event uniqueness and `blockHash` for reorganization detection. Retain reversals instead of deleting history.

Protocol fees, operating reserves, approved spending, and reward funding are separate ledger accounts. User trading assets, delegated principal, and operator bonds must not be swept into those accounts. Locked graduation LP and future trading volume are not reward reserves. No conversion or treasury-spend endpoint is included in this API design.

## Shared Lifecycle and Evidence

| Evidence / State | What It Establishes | What It Does Not Establish |
| --- | --- | --- |
| Draft / preparation | A recorded intended action with explicit bounds or blocked prerequisites | Signature, custody transfer, transaction submission, or reward entitlement |
| User authorization | Consent to one exact, domain-bound payload | A successful transaction or an operator's right to alter it |
| Operator acceptance | An assigned task was accepted | Delivery, canonical inclusion, or payout |
| Reported transaction hash | The wallet or operator reported a candidate transaction | Correct payload, canonical inclusion, or finality |
| Included | Matched transaction appears in an observed block | Irreversibility under the chosen policy |
| Confirmed | Required interim confirmation threshold is met | Finality if the policy distinguishes it |
| Finalized | Matched effect meets the approved chain finality policy | A broader claim about satellite routing or offchain business legality |
| Reorged / conflicting | Previously observed evidence is no longer canonical or consistent | Permission to resubmit automatically |

Unknown submission is a first-class recoverable uncertainty state. Reconcile existing intent/preparation identity, domain/nonce, and known transaction hashes. An operation can finish its investigation with an unresolved result; that is not a failed financial transaction and not retry permission.

Reward claims follow `unclaimed` → `prepared` → `submitted` / `unknown_submission` → `included` → `confirmed` → `finalized`, with explicit `reverted` and `reorged` branches. Neither API creation nor a successful job status marks an allocation paid. After a reorganization, use contract and canonical-chain evidence to restore the correct claimability; do not assume that either the old claim or a new claim is safe.

## Receipts and Node Trust

Task and attempt IDs, statement versions/digests, exact statement scope, operator signature verification, timestamps, evidence commitments, and related chain observations remain separate. `self_reported`, `independently_observed`, and `chain_confirmed` describe the evidence for a specific claim; they are not a universal ranking of truth.

Public receipt lists are redacted projections. Private receipt detail requires owner or assigned-operator authorization. An exit ASN or a globe marker is not cryptographic proof of an end-to-end satellite route. Do not expose raw order payloads, private evidence URLs, exact household coordinates, or signatures in public examples.

Observation targets are registered IDs with request-size, duration, cost, destination, and rate limits. Operators do not receive an open RPC proxy or arbitrary URL fetch capability. Conflicting statements and failed attempts remain in the record; a later valid update is not automatically equivocation unless the policy proves mutually exclusive claims in the same domain, attempt, schema, and checkpoint.

## API and Contract Separation

- The API has no `/execute`, launch, signer, arbitrary RPC relay, or automatic conversion action.
- Preparation endpoints produce a bounded unsigned wallet request only when every relevant check passes and the environment permits it. Preview and unconfigured deployments return a blocked state or explicit error.
- The action deadline must be enforced by the approved call or contract. A frontend expiry timer is not transaction invalidation; an adapter that cannot enforce the required deadline stays unavailable. Late transaction observations still require reconciliation.
- The submission endpoint records a hash of a transaction already sent by the user's wallet. It does not receive a signed transaction or broadcast instruction.
- Session logout, API-key revocation, receipt deletion, and offchain task cancellation do not revoke onchain allowances or financial signatures.
- A server-side eligibility result must be mapped to a concrete enforceable boundary; it cannot be cited as an onchain restriction unless the actual contract/asset integration enforces it.
- Fixed source evidence for the 50 bps rule does not authorize a launch or remove the need for fresh mutable-economics and beneficiary checks.

## Required Review Evidence Before Activation

1. Freeze the signed-domain encoding and compare frontend, SDK, verifier, and contract digests using independently checked test vectors.
2. Test exact recipient/asset/amount/adapter/domain/nonce/deadline constraints and the named failure boundary, not merely a generic revert.
3. Prove allowance and market-context revalidation, pause behavior, unknown-submission reconciliation, and cancellation races.
4. Check principal conservation, authorized withdrawal, cooldown, reward funding/allocation/claim conservation, and duplicate-claim resistance.
5. Verify actual event indexing, block-hash reorg handling, reversals, and finality-driven claim/payment completion against controlled chain evidence.
6. Review operator enrollment, bounded task transport, receipt verification, SSRF prevention, and private/public projection separation.
7. Define governance, upgrades, emergency pause, key separation, incident response, and a recoverable deployment plan before any production release.

No claimed audit, testnet acceptance, real-node fleet, physical network route, or mainnet support follows from the existence of this document.
