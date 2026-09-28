# Implementation and activation map

Website: [starport.nexus](https://starport.nexus).

This map describes the public source tree, not a guarantee of deployed product availability. The nine product surfaces are integration targets; they are not nine deployed protocols.

| Module | Inspectable implementation | Remaining integration |
| --- | --- | --- |
| Network | Canonical messages; bounded HTTPS transport with DNS pinning; task-bound receipt verifier and local replay guard; opt-in terminal capture | Durable atomic receipt store, operator enrollment/reviews, real hardware observations, production scheduling |
| Earn | `SportDelegationVault`, `FundedMerkleRewards`, deterministic allocation manifest and proofs | SPORT address; approved asset/eligibility adapter; raw caps and roles; independent review; deployment and funded epochs |
| Treasury | `StarportFeeVault`; observe-only collection planner and binding reader | Live deployment/code hashes, PONS beneficiary binding, separately authorized Keeper signer |
| Connect | Read-only SDK; public schemas; runnable node roundtrip | Developer credentials, webhooks and hosted mutation endpoints |
| Signals | Typed source freshness/errors and orbital/market reads in SDK | User subscriptions, scheduler and delivery channels |
| Pass | Operator proof-of-possession encoding/signature utilities | Hosted account identity, persistent grants and user-visible passport integration |
| Missions | Bounded assignment and receipt verification primitives | Persistent assignment lifecycle, human review and funded work accounting |
| Trade | Asset/reference-price reads; `BoundedTradeRouter` with fixed pair/adapter, nonce and intent binding, deadline, exact-input/minimum-output enforcement | Reviewed concrete venue adapter and market/eligibility policy, executable quote, real-asset integration and deployment |
| Pay | `StarportPaymentRouter`; EIP-712 issuer request builder; EOA/ERC-1271 invoice verification; version/cancel/single settlement and exact direct payments | Production eligibility adapter, hosted issuer-handshake integration, deployment and canonical receipt indexing |

## Run and inspect

```sh
npm ci --ignore-scripts
npm test
npm run test:contracts
npm run example:offline
```

Contract tests require an installed Anvil, pinned to v1.7.1 in CI. They start isolated local EVMs, not a mainnet fork. No credentials, database, private application checkout or paid provider is needed for offline verification. CI has read-only repository permissions, fixed action revisions, no deployment steps and no project secrets.

To make one real public HTTPS request, explicitly run:

```sh
node examples/node-roundtrip.mjs --live
```

The example hashes the bounded response, signs an exact task-bound statement using an ephemeral key, verifies it and rejects a repeated attempt. It never prints or persists a private key. Its registry is a local reference context, not a production-approved node. The HTTPS result is not proof that the request traversed Starlink.

## Review findings addressed

- The agent now has a concrete transport rather than only an injectable interface.
- A consumer can independently recompute task binding, verify Ed25519 statements and enforce a bounded replay guard. Hosted consumers still need atomic durable uniqueness; restarting the reference guard loses its in-memory records.
- Earn is no longer only contract names: principal and reward funds reside in separate implementations with finite deadlines. No existing treasury powers were expanded.
- Pay now has an independently hash-checkable issuer handshake and settlement contract. Trade has a concrete settlement boundary, but no pretend PONS/Uniswap/RFQ venue implementation. See [execution details](execution-implementation.md).
- Tests, commands and CI are present in the public tree, rather than being described only as private checks.
- Third-party claims that the fee-vault constructor requires SPORT are incorrect: it requires SPCX, PONS escrow and factory code. SPORT is needed later for launch binding, not for vault construction.

No code change manufactures terminal ownership, distribution eligibility, independent operators, an audit or a mainnet deployment. Those remain external evidence requirements.
