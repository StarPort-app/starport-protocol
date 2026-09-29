# Nodes, tasks and receipts

## Capabilities
- starlink_gateway: the operator has an existing authorized Starlink connection and offers an application relay service.
- rf_observer: receives a supported public satellite signal; not automatically a Starlink gateway.
- evidence_reviewer: recomputes and reviews supplied material; does not claim physical RF reception.

Node enrollment fixes an operator identity/key, capabilities, evidence references and policy version. Operator count is not key count; independence cannot be inferred from different addresses.

## Task states
Draft → Authorized → Accepted → Submitted → Included → Confirmed → Finalized.
Alternative terminal states: Expired, CancelledBeforeSubmission, Reverted, Rejected.
UnknownSubmission is a recoverable uncertainty state: reconcile by known intent ID / nonce / transaction hash before any retry. Never create a fresh economic action to clear a pending UI.

An accepted task does not guarantee execution. A node cannot change destination, amount, limits, asset, venue, chain, nonce or deadline.

## Intent authorization fields
chainId, verifyingContract, schemaVersion, intentId, user, allowedAdapter, assetIn, assetOut, amountInRaw, minAmountOutRaw, maximumFee, recipient, deadline, nonce, marketContextHash.

## Evidence and settlement
A service receipt includes task/attempt identity, operator signature, evidence level, recorded times, related transaction references and raw evidence commitments. A node claim is not chain finality or a cryptographic proof of the end-to-end satellite path.

Evidence levels: self_reported, independently_observed, chain_confirmed. They are not a single increasing proof-of-truth scale: each statement has a scope.

Store failures and conflicting claims. A later valid state update is not automatically equivocation; any dispute domain must include attempt, schema, checkpoint and the exact mutually exclusive claim.

## Operator control
No private keys from users. No arbitrary transaction proxy, open RPC relay or server-side wallet import. Task endpoints enforce size, cost, target and rate bounds. Chain-specific restrictions and user eligibility are not bypassed by changing gateway country.


## R4 design refinement

The selected project ticker is SPORT (contract pending). Initial earning epochs are **3 days / 259,200 seconds**, not weekly. Concrete admission, contribution, funding and finite-exit defaults are specified in [R4 node policy](node-rewards-policy-r4.md); wallet-called execution, invoice issuance and Merkle rewards are specified in [R4 integration](contract-integration-r4.md). These later design choices refine earlier general requirements; no deployed runtime is implied.
