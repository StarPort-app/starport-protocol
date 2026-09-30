> **Current target (September 30, 2026):** SPORT / native ETH, with a **1% (100 bps) additional creator tax**. Earlier 0.5% targets below are historical. Base-fee shares and optional buybacks are separate; no on-chain launch or tax change has occurred. See [current ETH scope](pons-eth.md).

> **R6 update:** Launch quote and creator revenue are now native ETH. Earlier SPCX launch references below are historical, not the current configuration. SPCX remains a separately funded ERC-20 reward candidate; automatic conversion and rewards stay off. See [native ETH scope](pons-eth.md).

# Starport Contract Integration — R4 Design

**Implementation status:** this document preserves the historical R4 target interfaces, not the final implementation ABI. See [Earn implementation](earn-implementation.md), [Pay/Trade implementation](execution-implementation.md), and [the implementation map](implementation-status.md) for actual source coverage and differences. [SPCX fee vault first](fee-vault-r5.md) supersedes the plain-wallet fee-recipient target. Fee-vault roles have been selected as preparation inputs; new Earn/Pay/Trade roles and deployment addresses remain unassigned.

## 1. Status and Confirmed Inputs

This is a concrete integration design, not Solidity implementation, deployed bytecode, a launch approval, or permission to move funds. No wallet, contract simulation, chain transaction, or runtime test was used for this revision. The accompanying `deployment-map.design.json` is a disabled design manifest, not executable deployment configuration.

Confirmed product inputs:

- Product: Starport; token ticker: **SPORT**. The SPORT contract address remains **pending deployment**. Do not substitute a same-symbol token or treat the supplied treasury address as the token address.
- Chain target: Robinhood Chain **4663**; gas asset: ETH. The official network documentation separately identifies testnet **46630**. Environments must not share deployments or signing domains. [Robinhood network configuration](https://docs.robinhood.com/chain/connecting/)
- Launch quote / creator-fee asset: **Native ETH** (PONS `address(0)` sentinel) under the active R6 standard (superseding earlier exploratory SPCX references). SPCX remains an RWA asset in the catalog.
- Treasury / PONS creator-fee recipient selected by the user: **`0xAf3eAA38a445392f1E9d1faE463871998745cb75`**. This is a supplied destination only. Its ownership, wallet type, signing policy, and ability or eligibility to receive assets have not been verified.
- PONS creator-tax target: **100 bps (1%)** under the active R6 standard (selected September 30, 2026). The historical 50 bps (0.50%) source review confirmed that PONS contract math operates in basis points without a 100 bps minimum, but 100 bps is the active chosen parameter.
- **No additional SPORT transfer tax**, no Starport wrapper transaction fee in v1, and no automatic conversion. PONS base fees, creator fees, opening protections, price impact, and gas remain distinct costs; the 1% target is not the all-in trading fee.

R4 supersedes earlier statements that the ticker and treasury recipient are undecided. It does not resolve deployment addresses, signing authority, venue eligibility, or operational permissions. Network remains the default home; all nine modules remain in scope and English-only.

## 2. Verified Integration Facts and Their Limits

### PONS

PONS documents direct curve `buy(uint256,uint256,address)` and `sell(uint256,uint256,address)` calls. Its published ABI has no deadline parameter. Quoting uses reserves and current fees rather than a curve quote endpoint. A final buy can be clamped/refunded, with a rate-based minimum. Sells stop when `readyToGraduate()` becomes true. Factory phases distinguish curve trading, swept transition, created pool, and rescue. The created pool uses Uniswap v4 with the launch's recorded currencies, tick spacing, fee field, and hook. Fee balances are asset-specific and withdrawn through escrow. [PONS v2 integration documentation](https://docs.ponsfamily.com/v2)

Documented read selectors relevant to this design are `getLaunchedToken(address)`, `getReserves()`, `sellableTokens()`, `readyToGraduate()`, `pairToken()`, `feeBps()`, `creatorTaxBps()`, and `currentSnipeTaxBps(address)`. These are external integration references, not new Starport APIs. The launch-specific curve, SPORT address, pool identity, current fee state, and deployed helper equivalence are not verified by this document.

### Creator Beneficiary Binding — Explicit Gate

The pinned official factory reference declares `creatorFeeRecipient` inside `TokenParams`. Its direct launch passes `msg.sender` as `originalDeployer`; the internal launch uses the explicit recipient unless it is zero, in which case it uses that original deployer. It records the resolved address in the launch. Its self-service change is `transferCreatorFeeRecipient(token,newRecipient)`, callable by the current recipient; `setCreatorFeeRecipient` is instead a protocol-owner timelocked proposal. No `setFeeRecipient` method was found in that reference. [Pinned official factory source, lines 653–659, 764–765, 797–806, 834–838 and 888–897](https://raw.githubusercontent.com/ponsdotdev/pons-labs/162310fbd1217717e2f5e4cde794d6a11322b469/contractsV2/src/v2/PonsV2LaunchFactory.sol)

That repository snapshot contains known mixed-version dependencies; it is **not proven equivalent to the deployed factory bundle**. The existing explorer excerpts verify the tax gate, not this entire beneficiary path, and the explorer page could not be retrieved through the current web reader. Therefore an eventual launch must first verify the deployed ABI/source binding, then explicitly supply the chosen nonzero treasury recipient and confirm the resulting launch record. Keep the separately authorized initiating account unchanged. Never “solve” a binding mismatch by silently switching the launch wallet, passing zero, or promising a later recipient-change transaction. Already accrued historical balances are separately reconciled; a future-address change is not a transfer of old fees.

### Stock Tokens and Venues

Robinhood identifies Stock Tokens as ERC-20 tokenized debt securities, not direct shareholder rights. Its published restrictions include U.S. persons and other jurisdictions. Chain permissionlessness does not grant an application worldwide distribution permission. [Stock Token overview and restrictions](https://docs.robinhood.com/chain/stock-tokens/)

Robinhood describes RFQ, AMM and other secondary-market integrations; issuer mint/burn access is restricted to authorized participants. This supports investigating a secondary-market adapter, not claiming that Starport has a quote, credentials, liquidity, or permission for a particular pair. [Building with Stock Tokens](https://docs.robinhood.com/chain/building-with-stock-tokens/)

The RHJ REST endpoints are read-only market/asset information, not order execution. REST prices and onchain feeds have different multiplier treatment. [Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/)

Onchain stock feeds include the corporate-action multiplier. The official oracle guidance calls for freshness, positive-value, sequencer-uptime and pause checks; `oraclePaused()` is advisory, so applications must enforce their own guard. Feed addresses and heartbeats require asset-specific discovery. [Oracles and price feeds](https://docs.robinhood.com/chain/oracles-and-price-feeds/)

### Published Addresses Are Not Activation Evidence

The JSON manifest records official documentation-listed PONS and Uniswap addresses with that exact evidence level. Uniswap currently lists Robinhood Chain PoolManager, Quoter, StateView, Universal Router and Permit2 deployments. Their presence does not verify bytecode, chosen router command compatibility, the SPORT pool, or a successful route. [Uniswap v4 deployment directory](https://developers.uniswap.org/docs/protocols/v4/deployments)

SPCX/USDG or another Stock Token pair remains unavailable until an actual eligible, executable route is verified. Do not use a chart row, metadata response, familiar ticker, or public deployment directory as a substitute.

## 3. Smallest Contract Set

Use **three core Starport contracts**, with venue handling as typed, reviewed code within the execution boundary. No contract is needed merely because a UI module exists.

| Planned Contract | Responsibility | Fund Boundary |
| --- | --- | --- |
| `StarportExecutionRouter` | Wallet-called bounded Trade, direct Pay, and invoice settlement; typed adapter dispatch; action replay protection | No standing user deposits or discretionary user-fund withdrawal; temporary trade balances are fully settled/refunded in the same transaction |
| `SportDelegationVault` | Exact SPORT principal accounting, node attribution, owner-requested exits and owner-only withdrawals | Isolated principal; no lending, slashing, reward funding, admin principal withdrawal, or strategy investment |
| `FundedMerkleRewards` | Explicitly funded asset-specific epochs, reviewed immutable roots, eligible claims, bounded pause and unused-fund return | Reward funding only; never delegated principal or operator collateral |

A separate **optional `OperatorBondEscrow` boundary** is required if the independently designed operator-bond policy is activated. It must not reuse the principal vault or reward balances. It is not necessary to browse, trade, pay, or perform non-slashable delegation, and is not an invented deployed component.

Prefer non-upgradeable first versions with immutable asset and execution-target bindings. A replacement uses a new address/domain and explicit user approval; an administrator cannot upgrade a principal contract into a spending strategy. Configuration and emergency roles remain unassigned until independently authorized. The supplied treasury recipient does not automatically become the administrator, publisher, guardian, eligibility authority, or funder.

Use reviewed ERC-20 transfer helpers and reentrancy-safe checks/effects/interactions. Verify actual balance deltas; do not support fee-on-transfer or rebasing principal/payment assets by accident. Library versions and bytecode must be pinned during implementation; no package was installed here. [OpenZeppelin ERC-20 utilities](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20)

## 4. Proposed Execution Interfaces

The following are **proposed Starport interface signatures**, not claims about an existing ABI. Struct encodings, selectors and code hashes must be frozen together before implementation.

```text
tradeExactInput(TradeRequest request, RouteGuard route, MarketGuard market)
    -> (uint256 spentRaw, uint256 receivedRaw)
payDirect(PaymentRequest request) -> bytes32 paymentKey
payInvoice(PaymentRequest request, InvoiceTerms invoice, bytes issuerSignature)
    -> bytes32 invoiceKey
invalidateNonces(bytes32 actionNamespace, uint256 wordIndex, uint256 mask)
cancelInvoice(bytes32 invoiceId)
advanceInvoiceVersion(bytes32 invoiceId, uint64 nextVersion)
isNonceUsed(address owner, bytes32 actionNamespace, uint256 nonce) -> bool
invoiceState(address issuer, bytes32 invoiceId) -> (version, state, settlementDigest)
```

`TradeRequest` binds `intentId`, `user`, `nonce`, input/output token addresses, exact input, absolute minimum output, recipient, maximum venue-fee asset/amount, deadline, route identity, and market-context digest. `RouteGuard` binds the reviewed handler/version, external target/code identity, launch/pool identity and expected lifecycle/fee configuration. It is not arbitrary target/calldata. `MarketGuard` carries the approved feed/policy identities and bounded freshness/multiplier assumptions that the contract can independently check.

`PaymentRequest` binds `preparationId`, `payer`, action nonce, asset, exact raw amount, recipient, deadline, accepted terms digest, and optional invoice digest/version. `msg.sender` must equal the bound user/payer. First-version execution is a transaction called by that wallet, not an offchain signature submitted by a backend or arbitrary relayer. A smart-account wallet is acceptable only through its reviewed caller semantics, not by assuming `tx.origin` is the user.

Proposed events:

```text
TradeSettled(intentId, user, nonce, routeId, assetIn, assetOut,
             requestedInRaw, spentInRaw, receivedOutRaw, recipient, contextDigest)
PaymentSettled(paymentKey, preparationId, payer, recipient, asset, amountRaw, nonce)
InvoiceSettled(invoiceKey, invoiceId, version, invoiceDigest,
               payer, recipient, asset, amountRaw, preparationId)
NoncesInvalidated(owner, actionNamespace, wordIndex, mask)
InvoiceCancelled(invoiceKey, issuer)
InvoiceVersionAdvanced(invoiceKey, previousVersion, nextVersion)
```

Events are indexable evidence, not immediate finality. The indexer stores chain ID, transaction hash, log index, block hash, and canonicality alongside them.

### Nonce, Deadline and Replay Semantics

- Maintain separate nonce bitmap namespaces for Trade and Pay under `(chainId, router address, owner, actionNamespace)`. API idempotency keys, action nonces, and the wallet's EVM transaction nonce are different identifiers and must never be substituted for one another.
- Require a nonzero bounded amount, exact caller, unused action nonce, approved route/asset, and `block.timestamp <= deadline` before token movement. Consume the nonce before external interaction under a reentrancy guard; a full transaction revert rolls back both nonce and fund effects.
- A known revert therefore leaves the contract nonce unconsumed, but **does not authorize an automatic retry**. Preserve the original action and error; refresh conditions and require a new user decision before another wallet submission.
- Invalidate nonce bits only through an owner-called transaction. Invalidation and execution can race: whichever canonical transaction executes first governs; show pending invalidation until chain evidence settles it.
- Every supported execution path enforces its deadline onchain. A UI timer, API expiry, gateway timeout, session logout, or key revocation cannot revoke a signed transaction.
- If later versions add offchain financial signatures, bind EIP-712 name, version, chain ID, verifying contract, full action fields and nonce; do not enable that path by default. EIP-712 is a signing format, not a replay solution by itself. [EIP-712 security considerations](https://eips.ethereum.org/EIPS/eip-712)

## 5. Typed Venue Adapters

### A. PONS Curve Adapter — SPORT / SPCX

The proposed handler is `pons_curve_v1`. It is enabled only after SPORT's actual launch record, curve, quote asset, creator-tax value and relevant code identities are verified. Its chosen v1 policy is **full exact-input settlement or atomic revert**, not an implicit partial-order model.

For a buy, pull the exact approved SPCX input into the router, give only the required allowance to the verified curve, call its typed buy function, clear temporary allowance, and measure recipient output plus any quote refund. Revert the whole transaction if actual input consumption differs from the requested exact input or absolute recipient output falls below the bound. For a sell, similarly bind SPORT input and SPCX output and measure actual deltas. No wrapper fee or token transfer-tax layer is added.

The wrapper adds the missing deadline and strict absolute minimum-output policy. The direct curve must not be advertised as already enforcing those wrapper promises. Before quote creation and again at execution, validate the route state, recipient-specific fee assumptions, token identities and relevant guard values. Do not silently switch venue, recipient, quantity, or slippage after approval.

**Account-dependent fee gate:** establish the deployed curve's actual treatment of the direct caller, authenticated user, output recipient and any exempt address. A wrapper changes `msg.sender`; never assume a wallet-only sniping quote remains correct. Quote and revalidate the exact account tuple used by the real call, including the router. If the wrapper would change, bypass, or make unverifiable an opening-protection rule, leave it unavailable rather than use an apparent exemption or a guessed fee. The same gate applies to v4 callback/router identities and hook fees. No additional source-equivalence or runtime claim is made here.

The quote builder is a deterministic, version-pinned adapter over a coherent block snapshot. It is not a fabricated PONS HTTP quote service. Its integer-rounding implementation and call compatibility are implementation-review gates; this design does not claim they have been tested.

### B. Post-Graduation Adapter

The proposed handler is `pons_v4_v1`. A curve order does not automatically become a pool order. A lifecycle change invalidates the prepared route and requires a fresh quote and review.

Resolve the launch's actual recorded pool identity and check it against the expected SPORT/SPCX pair and hook. Use a fixed allowlisted Universal Router version with a narrowly encoded exact-input swap path. Do not forward arbitrary aggregator commands, callback targets, permit payloads, or user-provided router calldata. Approvals/Permit2 capabilities must be individually reviewed, exact-scoped and expiring; no standing unlimited grant is a prerequisite of this design.

Verify minimum output against actual recipient balance change. Any refund, unexpected token, unsupported fee accounting, missing pool, lifecycle transition, or inability to enforce the declared maximum fee blocks the route. `swept` and `rescued` states do not expose a speculative executable route. Finishing graduation is a separate economic operation, never an automatic trading retry.

The official directory supplies candidate Uniswap addresses in the manifest; all remain disabled until ABI, bytecode, allowance path, hook behavior, fee-budget semantics and the actual SPORT pool are verified.

### C. Stock Token RWA Adapter

Choose one verified secondary-market provider at a time; the first candidate is an RFQ integration, not direct issuer minting. `rwa_rfq_v1` remains unavailable until an actual provider endpoint, settlement contract, permitted taker, asset pair, credentials/access policy and quote signature format are verified. No endpoint or address is invented. Existing AMM liquidity may be a later separately verified typed adapter.

The admission decision is per wallet, action, asset and policy version. Enforce short-lived eligibility at the actual transfer/execution boundary through a reviewed policy integration. A front-end checkbox, a different gateway country, an open ERC-20 transfer function, or a stored historical eligibility response is not sufficient. The policy integration address and authority remain unconfigured; it must not be mislabeled a Robinhood-provided eligibility API.

Before presenting and executing a quote, verify the raw token identities, underlying session availability, executable route, quote/taker/expiry, oracle freshness and positive values, sequencer status, advisory pause flag, and multiplier consistency. Corporate-action uncertainty blocks execution rather than forcing a sale. Do not double-adjust an onchain feed or relabel a raw SPCX balance as USDG. A provider quote that cannot pass through the reviewed router without changing the authorized taker or custody path is unsupported, not silently rewritten.

## 6. Invoice Settlement and Open Links

Support `open` invoices with no assigned payer and `restricted` invoices with one named payer. Public links/QRs expose safe immutable request terms only. The actual payer is bound when an authenticated wallet prepares payment, and is independently enforced as `msg.sender` onchain.

`InvoiceTerms` contains `invoiceId`, `version`, `issuer/payee`, `asset`, exact `amountRaw`, optional `authorizedPayer`, `expiresAt`, and `termsHash`. The issuer signs these request terms in the router's EIP-712 domain. This is **the issuer's wallet signature**, not a server signature, not the payer's financial authorization, and not reuse of an authentication challenge. Verify contract-wallet signatures through the reviewed signature-checking path where applicable. [OpenZeppelin signature and domain utilities](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography)

The logical invoice key binds chain, router, issuer and invoice ID. The digest also binds the version and every term. Track a current version and one consumed/cancelled state for the invoice key, so two versions cannot become two payments for the same invoice. Terms are immutable in each version; advancing/cancelling an issued invoice requires its issuer's onchain action, with old terms rejected once that state is canonical. A new unrelated invoice requires a new invoice ID.

`payInvoice` verifies the issuer signature, current version, expiry, optional restricted payer, exact prepared digest, user nonce and eligibility. It marks the invoice consumed before a guarded exact transfer, then verifies the recipient's received amount and emits the invoice-specific settlement event. A transfer failure reverts consumption and nonce effects. Concurrent payers may prepare offchain, but only the first valid canonical settlement can succeed; the API's single active reservation reduces races without pretending to be the security boundary.

The API accepts only a reported transaction hash afterward. Reconciliation must match the invoice-specific event, sender, recipient, asset, amount, version and preparation. An arbitrary same-amount token transfer is never invoice settlement. Event identity cannot credit two invoices. Unknown submission preserves the reservation until an enforced expiry/invalidation and canonical reconciliation establish safety.

**R4 API design alignment:** `openapi-r4.json` and `api-delta-r4.md` close the issuer handshake. Existing invoice creation now returns a private immutable draft and a bounded issuer typed-data review when configured; `POST /v1/invoices/{id}/issuer-authorization` accepts only the matching issuer signature/version/digest and marks the request issued after verification. Unissued drafts are never publicly payable. Preserve open/restricted access and hash-only transaction submission. Do not fabricate issuer authorization from a session signature. Signed request artifacts require scoped access and must not appear as real examples in public documentation. This is a completed interface design, not implemented signing or verification.

## 7. SPORT Principal Vault

```text
deposit(bytes32 nodeId, uint256 amountRaw, bytes32 termsHash,
        uint256 actionNonce, uint64 deadline) -> uint256 positionId
requestExit(uint256 positionId, uint256 amountRaw,
            uint256 actionNonce, uint64 deadline) -> uint256 exitId
accelerateExit(uint256 exitId, uint256 actionNonce, uint64 deadline)
withdraw(uint256 exitId, uint256 actionNonce, uint64 deadline) -> uint256 amountRaw
position(uint256 positionId) -> (owner, nodeId, principalRaw, exitingRaw)
exitRequest(uint256 exitId) -> (owner, amountRaw, requestedAt, unlockAt, withdrawn)
```

Only the recorded owner can initiate or withdraw a tranche, and withdrawal always pays that owner. SPORT's actual deployed address is immutable at vault deployment. Check exact received deposits; reject unsupported transfer behavior. Each exit fixes its own amount and deadline; later deposits or exits cannot reset an earlier unlock.

Normal exit is **7 days** from the canonical request block timestamp. Reward weight stops at that canonical exit-request effective time once confirmed; reorgs recompute it. The UI does not start a trusted countdown at a web click, and the contract does not pretend to observe its own finality.

An applicable safety incident can shorten an exit to `min(normalUnlock, emergencyRequestTime + 48 hours)`. Snapshot that authorization so later incident revocation cannot relock the tranche. Incident eligibility is a declared node/protocol safety condition under published policy. The optional permissionless stale-checkpoint trigger requires a **real onchain checkpoint oracle** stale for more than 72 hours. Its address is pending; without it, omit that shortcut and retain the unconditional normal exit. An offchain heartbeat alone is not onchain enforcement.

No pause, node suspension, reward dispute, API outage, or guardian silence may block the ordinary matured principal withdrawal path. The owner can call the contract directly. There is no admin SPORT-principal sweep or slashing method. “User-controlled/noncustodial withdrawal” here means an isolated smart-contract escrow with owner-enforced return rights, not a claim that deposited tokens remain in the user's wallet or that smart-contract risk disappears.

Events: `Delegated(positionId,owner,nodeId,amountRaw)`, `ExitRequested(exitId,positionId,owner,amountRaw,requestedAt,unlockAt)`, `ExitAccelerated(exitId,previousUnlockAt,newUnlockAt,incidentRef)`, and `PrincipalWithdrawn(exitId,owner,amountRaw)`.

Operator collateral is a different risk domain: the coordinated policy uses a 14-day normal unbond, a 7-day uncontested incident path, and a 28-day maximum contested exit bound. It must never inherit the principal vault's 48-hour shortcut. The optional escrow must stop new assignments at unbond request and isolate contested slices; no such collateral is taken in this revision.

## 8. Explicitly Funded Merkle Rewards

### Epoch and Allocation Policy

Use **3-day earning epochs (259,200 seconds)**, contiguous from an explicitly configured `firstStartTimestamp`: epoch `n` spans `[firstStartTimestamp + n × 259200, firstStartTimestamp + (n + 1) × 259200)`. There is no Monday or weekly alignment. A 3-day earning interval is not a promise that funding, review, finalization or payment occurs every 3 days.

The proposed reward-budget cap is **25% of actual reconciled surplus per funded epoch**, subject to explicit approval and actual asset funding; it is not APR, gross-fee distribution, or access to principal. The approved net funded budget uses buckets of 70% gateway work, 10% RF observation, 10% independent review and 10% SPORT delegation participation. Unused buckets carry under the approved budget policy, with no automatic asset conversion or guaranteed reward.

SPCX is the initial proposed direct reward asset, subject to distribution eligibility. An ineligible or incompatible participant/asset combination receives no automatic substitute payout. Amounts remain raw units of the funded asset. SPORT principal does not fund SPCX claims.

```text
createEpoch(EpochConfig config) -> uint64 epochId
fundEpoch(uint64 epochId, uint256 amountRaw)
proposeRoot(uint64 epochId, bytes32 root, uint256 allocatedRaw,
            bytes32 manifestDigest, bytes32 policyHash)
recordRootChallenge(uint64 epochId, bytes32 evidenceDigest)
finalizeRoot(uint64 epochId, bytes32 root, bytes32 reviewDecisionDigest)
claim(uint64 epochId, uint256 index, uint256 amountRaw,
      bytes32[] proof, uint256 actionNonce, uint64 deadline)
pauseClaims(uint64 epochId, uint64 duration, bytes32 reasonDigest)
resumeClaims(uint64 epochId)
returnUnallocated(uint64 epochId) -> uint256 returnedRaw
isClaimed(uint64 epochId, uint256 index) -> bool
```

`EpochConfig` binds a single asset, one recorded funder/return destination, epoch start/end, policy hash and reviewed eligibility-policy identity. Configuration roles and the actual funder remain separately authorized; neither is inferred from the supplied fee recipient. `fundEpoch` transfers exact funds from that explicit funder through its separately approved wallet action. No automatic fee sweep, conversion, treasury approval, or funding scheduler is implied.

Record a draft root by epoch end + 48 hours. Material revisions restart its 72-hour challenge window, but finalization must occur by epoch end + 14 days. Unresolved allocations are excluded/reserved before finalization. If a root cannot finalize by that deadline, close without claims and return the unallocated balance only to the recorded source under its published funding terms. Recording an objection is not an unlimited anonymous veto: the named review authority records a decision; unresolved work cannot extend the absolute deadline.

After finalization the root and allocation ceiling are immutable. Late awards use a new explicitly funded allocation/epoch. Claims run for 90 days from finalization. Protective pauses consume at most 7 cumulative days per epoch; the contract computes actual paused duration, automatically stops honoring an expired pause, and extends claims by only that duration. The absolute claim lifecycle is at most 97 days. An administrator cannot turn repeated pauses into an indefinite hold.

### Leaf, Proof and Conservation

Use a domain-separated, double-hashed leaf over typed encoding of:

```text
(chainId, distributorAddress, epochId, index,
 participant, asset, amountRaw, policyHash)
```

Use sorted-pair single-leaf proofs in v1; no empty multiproof shortcut. The chosen hashing pattern follows the documented requirement to avoid ambiguous leaf/internal-node encodings. [OpenZeppelin MerkleProof guidance](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography)

The caller must equal the leaf participant; no arbitrary payout recipient or relayer diversion is permitted. Enforce current eligibility, claim window, unique index/account allocation, sufficient epoch balance, action nonce and deadline. Mark the bitmap before guarded transfer; a revert rolls it back. Emit `RewardClaimed(epochId,index,participant,asset,amountRaw)` and wait for finality before the application labels it paid.

The contract enforces `claimedRaw <= declaredAllocatedRaw <= availableEscrowFundingRaw` using actual token receipts and epoch reservations. It cannot observe its own L1 finality without a separate oracle; the publishing/read-model policy requires independently verified funding finality before approval, rather than pretending that an API flag is a contract fact. **A standard Merkle proof proves inclusion, not the total sum or fairness of all leaves.** Before finalization, require independent complete-manifest verification of sum, duplicate accounts/indexes, source work, eligibility, bucket caps and reservations. The root publisher/reviewer remains a real trust boundary; do not describe a published root alone as proof of economic correctness.

Other events: `EpochCreated`, `EpochFunded`, `RootProposed`, `RootChallenged`, `RootFinalized`, `ClaimsPaused`, `ClaimsResumed`, and `UnallocatedReturned`, each binding epoch, asset and relevant amount/digest. Recovery never withdraws delegated principal or another epoch's reserved balance.

`returnUnallocated` pays only the recorded funder. Before claim expiry it may return only amounts outside finalized allocations/reservations; after the effective claim deadline it may close and return that epoch's remaining unclaimed funds under the published terms. If no root finalizes by the absolute finalization deadline, it closes without claims. A token transfer restriction can still block a return; preserve the source entitlement rather than silently converting or redirecting it. The 72-hour root challenge, 7-day principal exit, and 90-day claim window are independent of the new 3-day earning epoch, so several epochs can legitimately be under review at once.

## 9. A Useful Starlink Path Without False Security Claims

Use an enrolled gateway as an **optional wallet RPC transport**:

```text
user wallet → authenticated gateway ingress → operator's Starlink WAN
            → approved Robinhood RPC upstream → chain
```

The wallet constructs and signs locally. The selected RPC transport carries the already-signed transaction through the gateway; the gateway does not sign, modify, custody, or choose financial parameters. Standard `eth_sendRawTransaction` transmits signed bytes and returns a transaction hash; that response does not establish settlement. [Ethereum JSON-RPC reference](https://ethereum.org/developers/docs/apis/json-rpc/)

This transport is **not** a new Starport `/v1` broadcast endpoint. The application API receives only the returned/reported hash and reconciles it against the original intent/preparation. Financial signatures or serialized transactions must not be copied into task receipts, public evidence, analytics or routine logs.

Gateway admission binds operator/node key, environment, fixed upstream and permitted method set. Permit only the methods required by the reviewed wallet flow; forbid remote signing/unlocked-account methods, arbitrary upstream URLs, and an unauthenticated open RPC proxy. Bound request sizes, batches, quotas, chain IDs and sessions. Pin the supported client/RPC transport explicitly; some wallets ignore a dapp's read RPC when broadcasting. Until a selected wallet proves it uses the gateway, label its transaction route **unverified**, not “sent through Starlink.”

Return a signed service receipt over request ID, node ID, method class, transaction hash, ingress/egress times, upstream identity and result digest—without the raw financial payload. An independently observed test request and operator route evidence can support a service claim; neither an ASN nor that receipt cryptographically proves a satellite hop for every transaction.

The practical value is a selectable connectivity path, transport availability under local outages, independent reachability observations and accountable service receipts. It does not increase blockchain consensus security, make a stock price trustworthy, bypass eligibility, guarantee faster execution, or guarantee transaction success. If a wallet cannot select the gateway safely, expose read-only network diagnostics rather than pretending its default broadcast used that route.

## 10. Unknown Submission and Finality

Before wallet submission, persist the immutable action identity, action nonce, call digest, chain, wallet and expiry; retain the wallet transaction nonce when exposed by the wallet. After submission, record the returned hash. A disconnect or timeout becomes `unknown_submission`, not failure and not permission to switch gateways and send a new financial action.

Reconcile by the existing hash, sender/EVM nonce where available, contract action-nonce state, preparation/intent events, and canonical block evidence. A nonce merely becoming “used” does not establish which action succeeded; match the actual event and call. When a wallet replaced a transaction, record both hashes and match the canonical replacement. The backend does not generate a replacement or new nonce.

Keep included, confirmed, finalized, reverted, replaced/conflicting and reorged observations distinct. The chosen design's `confirmed` level requires verified L1 batch posting; `finalized` requires the containing L1 block's finality. Do not approximate these by an arbitrary count of L2 blocks. The required mapping/reader is not yet implemented; if unavailable, remain at included/unknown rather than fabricate finality. Robinhood's documentation distinguishes sequencer soft confirmation, L1 posting and Ethereum finality, separately from bridge withdrawal delay. [Robinhood finality documentation](https://docs.robinhood.com/chain/transaction-finality/)

Only matched finality-qualified invoice, withdrawal and reward-claim settlement updates the financial read model as completed. Reorganizations write reversals and reconcile existing identities; they do not trigger automatic approval, signing, claim resubmission or duplicate revenue.

## 11. Activation Sequence and Unavailable Dependencies

1. **Design acceptance:** confirm SPORT, supplied recipient, the three contract responsibilities, coordinated economics and explicit eligibility/role decisions. No transaction is implied.
2. **Source and deployment binding:** pin reviewed code/ABI/library revisions; verify actual SPORT/curve deployment only after a separate launch authorization. Record chain, code hashes, factory record, quote asset, recipient and exact 100 bps creator setting. Do not infer these from a ticker or a deployment directory.
3. **Read-only adapters:** ingest source-stamped assets, quotes, lifecycle, fees, node evidence and chain finality. Unavailable venues remain unavailable. No credentials, provider purchase or live RPC test is performed here.
4. **Separately authorized testnet implementation:** implement and review the exact interfaces, signature/nonce rules, invoice handshake, principal escape path and funded-epoch accounting. The current document is not evidence that those checks pass.
5. **Governed production activation:** only after reviewed deployments, actual adapter compatibility, eligibility, role ownership, available funding and release authorization are established. Publish no “live Starlink execution” or “claimable reward” state from design data.

Unresolved activation inputs are the SPORT/token/curve addresses; Starport contract addresses and code hashes; actual role/funder control; approved eligibility integration; provider-specific RFQ endpoint/ABI/credentials/quote access; verified SPORT pool and selected router/Permit2 behavior; per-asset feeds/heartbeats; actual wallet gateway support; finality mapping; and optional onchain incident checkpoint/bond escrow. Their nulls and disabled states in the deployment map are deliberate, not placeholder success.

The staged R4 API includes the explicit invoice-issuer authorization extension and distinguishes direct wallet execution from its reserved, disabled relayed-authorization endpoint. Contract interface drafting does not authorize the server to accept signed transactions or replace its hash-only submission contract.
