# Starport Orbit Earn: Task-Budgeted Orbital Data Service Protocol

> **A formal specification for work-backed, demand-bounded orbital compute and verification markets on Robinhood Chain (Arbitrum Orbit L2, Chain ID 4663).**

---

## 1. Executive Summary & Design Philosophy

Traditional decentralized finance (DeFi) and DePIN protocols rely on inflationary staking pools where yields are distributed unconditionally proportional to Total Value Locked (TVL). This structure introduces structural vulnerabilities: token inflation divorced from utility, mercenary liquidity extraction, and unverified participation where nodes are rewarded merely for holding capital or transmitting unverified heartbeat telemetry.

**Starport Orbit Earn** replaces unconditional TVL staking with a **demand-bounded orbital service market**:

$$\text{Released Rewards} \equiv f(\text{Verified Useful Work Units}) \le \text{Pre-Funded Budget}$$

- **No Work, Zero Yield**: Nodes and delegators earn strictly upon the final acceptance and cross-verification of declared computational deliverables.
- **Physical Demarcation**: Transparently distinguishes physical radio frequency (RF) receiving hardware from distributed **software orbital compute workers**. Calculating Keplerian orbital transit tracks does not require an active satellite ground dish.
- **Segregated Custody**: Ordinary delegator principal is strictly isolated in non-slashable vault custody, decoupled from operator performance bonds and task dispute liabilities.
- **Pre-Funded Lot Budgeting & Dual-Asset Settlement**: Every assigned task is atomically backed by pre-deposited SPORT balances or Native ETH real-yield reserves funded from PONS trading revenue. Rewards are never promised against future speculative trading volume or uncollected fees.

---

## 2. Three Specialized Service Pools

Orbit Earn organizes work into three distinct, non-overlapping computational service pools, each directly serving an existing user-facing product surface:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             STARPORT ORBIT EARN POOLS                            │
├────────────────────────┬─────────────────────────┬───────────────────────────────┤
│   1. ORBIT FORECAST    │    2. CATALOG WATCH     │       3. ORBIT REVIEW         │
│   (Transit Prediction) │    (Integrity Monitor)  │       (Dual Verification)     │
├────────────────────────┼─────────────────────────┼───────────────────────────────┤
│ • Regional pass lists  │ • Ephemeris delta check │ • Independent cross-auditing  │
│ • Peak elevation calc  │ • Decay / anomaly alerts│ • Pinned reference validation │
│ • H3 cell batching     │ • Freshness verification│ • Conflict dispute resolution │
├────────────────────────┼─────────────────────────┼───────────────────────────────┤
│ PRODUCT DESTINATION:   │ PRODUCT DESTINATION:    │ PRODUCT DESTINATION:          │
│ Network Pass Calendar  │ Signals Data Hygiene    │ Immutable Proof Registry      │
└────────────────────────┴─────────────────────────┴───────────────────────────────┘
```

### Pool Specifications

| Service Pool | Canonical Work Unit | Input Specification | Verification Criteria | Product Consumer |
| :--- | :--- | :--- | :--- | :--- |
| **Orbit Forecast** (`orbit_forecast`) | 1 complete region/time/object shard (up to 128 satellites over 24h) | Pinned NORAD TLE snapshot hash, H3 spatial index, UTC window | Dual-node implementation consistency ($\le 0.5^\circ$ elevation, $\le 1.0\text{ s}$ transit) + reference solver check | Network pass calendar, query cache, trajectory visualizer |
| **Catalog Watch** (`catalog_watch`) | 1 material ephemeris delta report for active constellation | Consecutive CelesTrak GP/OMM snapshots (minimum 7,200s cadence) | Verified element changes, decay flags, format compliance | Signals real-time alerts, cache invalidation coordinator |
| **Orbit Review** (`orbit_review`) | 1 independent computational audit package | Pinned original task input, candidate result bodies | Blind assessment against reference numerical profiles | Published verification verdict, quality scoring index |

---

## 3. Two-Stage Spatiotemporal Architecture

To reconcile high-throughput regional caching with sub-second observation precision without compromising user location privacy, Orbit Earn establishes a two-stage geometric calculation pipeline:

```
Stage 1: Decentralized Worker Nodes (Regional Batching)
   ┌───────────────────────────────────────────────────────┐
   │ H3 Resolution 4 Spatial Cell (~11,000 km² coverage)   │
   │ SGP4 Orbital State Propagation (Conservative Envelope)│
   │ Generates candidate satellite visibility shards       │
   └──────────────────────────┬────────────────────────────┘
                              │ Reusable Regional Cache
                              ▼
Stage 2: Client-Side Edge Execution (Zero-Knowledge Topocentric Refinement)
   ┌───────────────────────────────────────────────────────┐
   │ End-User Browser / Terminal (Local Memory Only)       │
   │ Evaluates exact topocentric coordinates (lat, lon, h) │
   │ Precision event bracketing to 250 ms & exact azimuth  │
   │ Zero exact GPS data transmitted to server or network  │
   └───────────────────────────────────────────────────────┘
```

- **Stage 1 (Regional Batching)**: Distributed worker nodes evaluate Keplerian orbital vectors across coarse H3 Resolution 4 cells. Candidate selection conservatively encompasses the entire spatial polygon, producing a high-reuse candidate cache for all users within that zone.
- **Stage 2 (Local Refinement)**: The client browser executes topocentric look-angle evaluations (`satellite.js` / SGP4) against the user's exact coordinates entirely in local memory. Exact geographic coordinates are never transmitted across the network, logged, or recorded on-chain.

---

## 4. Cryptographic Commit-Reveal Task Lifecycle

To prevent front-running, result copy-pasting, and collusion among workers, task assignment and verification enforce a strict cryptographic **Commit-Reveal** sequence:

```
  [Demand Recorded & Priced]
              │
              ▼
  [Atomic Budget Reservation] ────> Locks gross budget B in Funding Ledger
              │
              ▼
  [Slot Assignment (Primary A + Secondary B)]
              │  Enforces: ControlGroupId(A) != ControlGroupId(B) != Reviewer
              ▼
  [Commit Phase (600s Deadline)]
              │  Submits: DomainSeparatedHash(Domain, TaskID, NodeID, TLEHash, ResultHash, Salt)
              ▼
  [Commit Closure Receipt Issued]
              │  Locks immutable candidate set; missing slots forfeited
              ▼
  [Reveal Phase (300s Deadline)]
              │  Submits: Plaintext Result + Salt + Ed25519 Reveal Signature
              ▼
  [Independent Reference Review (900s Target)]
              │  Evaluates: Coverage, Consistency Bounds (|Δθ| <= 0.5°, |Δt| <= 1.0s)
              ▼
  [Final Acceptance & Product Adoption]
              │  Transitions: Reserved Budget ──> Earned Unbatched Liability
              ▼
  [Daily Merkle Settlement Batch]
```

### Cryptographic Invariants:
1. **Domain Separation**: All commitments bind `starport-orbit-work/v1`, chain ID `4663`, policy version, task ID, and operator public key. Signatures are verified against Ed25519 SPKI structures.
2. **Actor Independence**: Primary execution slot 1, primary execution slot 2, and the reference reviewer must originate from three mutually distinct physical control groups:
   $$\text{Cardinality}(\{\text{CG}_{\text{slot1}}, \text{CG}_{\text{slot2}}, \text{CG}_{\text{reviewer}}\}) = 3$$
3. **Timed Fences**: Missing reveals forfeit slot allocations automatically without blocking unrelated tasks or delaying the network settlement cycle.

### 4.1 Byzantine-Resilient Scoped-Intent Journal & Outbox Protocol

In distributed edge networks, observer node restarts, network partitions, or delayed RPC receipts threaten to cause dangling reservations or duplicated task payouts.

Orbit Earn enforces a **Durable Scoped-Intent State Machine**:
1. **Durable Scoped Fences**: Every computational state transition is preceded by a persistent scoped write intent. An unresolved scope blocks both the original event ID and subsequent submission attempts until explicit cryptographic reconciliation, permanently eliminating double-claiming vulnerabilities across asynchronous nodes.
2. **Deterministic Input Archival**: All orbital input datasets (NORAD Keplerian TLE snapshots, H3 spatial bounding cells, ephemeris timestamps) are immutably archived and fingerprinted upon demand dispatch. Workers execute deterministic SGP4 ephemeris propagation against verified input snapshots, ensuring mathematical bit-level reproducibility.
3. **Decoupled Product-Delivery Outbox**: Accepted tasks isolate computational verification from downstream product consumers (such as Network visualizers or Signals alerts) via an atomic outbox queue. Downstream consumer latency cannot invalidate earned worker reward liabilities or delay global Merkle batch finalization.

---

## 5. Mathematical Budget Decomposition & Invariant Conservation

For every accepted task with pre-reserved gross budget $B$ (where $B \ge 100\text{ raw units}$, denominated in either SPORT base units or Native ETH integer wei):

$$\begin{aligned}
\text{Execution Share } (E) &= \lfloor 0.70 \times B \rfloor \quad \longrightarrow \quad \text{Slot 1} = \lfloor E/2 \rfloor, \; \text{Slot 2} = \lfloor E/2 \rfloor \\
\text{Review Share } (R) &= \lfloor 0.10 \times B \rfloor \\
\text{Delegation Share } (D) &= \le \lfloor 0.20 \times B \rfloor \\
\text{Unallocated Dust } (\delta) &= B - (E + R + D)
\end{aligned}$$

### Invariant Budget Conservation Theorem:
Across all state transitions, the aggregate protocol ledger satisfies strict zero-leakage conservation:

$$\text{NetDeposits} = U + T_{\text{res}} + E_{\text{unb}} + P_{\text{uncl}} + F_{\text{uncl}} + C + R_{\text{ret}}$$

Where:
- $U$: Unallocated pre-funded balance
- $T_{\text{res}}$: Atomically reserved task budgets
- $E_{\text{unb}}$: Earned unbatched verified liabilities
- $P_{\text{uncl}}$: Proposed candidate epoch allocations
- $F_{\text{uncl}}$: Finalized Merkle root unclaimed rights
- $C$: Cumulative claimed payouts
- $R_{\text{ret}}$: Returned expired/cancelled funds

*All values are integer BigInts (`NUMERIC(78,0)`). Floating-point arithmetic is strictly prohibited in financial accounting.*

---

## 6. Tri-Cap Dynamic Saturation Ceiling

To prevent capital whales from over-saturating individual nodes and capturing disproportionate rewards without corresponding computational capacity, pool delegation capacity is bounded by a **three-variable minimum function**:

$$\text{MaxDelegatedCapacity} = \min\Big(\mathcal{C}_{\text{demand}}, \; \mathcal{C}_{\text{throughput}}, \; \mathcal{C}_{\text{bond}}\Big)$$

Where:
1. **Demand Cap ($\mathcal{C}_{\text{demand}}$)**: $100 \times \text{Approved Next-Epoch Useful Work Budget}$. Prevents absorbing capital when service demand is low.
2. **Throughput Cap ($\mathcal{C}_{\text{throughput}}$)**: $100 \times \text{Conservative Historical Proven Delivery Capacity}$. Bounded by recent verified output volume.
3. **Bond Coverage Cap ($\mathcal{C}_{\text{bond}}$)**: $10 \times \text{Active Confirmed Operator SPORT Bonds}$. Ensures operator skin-in-the-game.

### Saturation Enforcement:
- When a pool reaches 100% saturation, subsequent deposit attempts revert at the contract level.
- Over-capacity positions are grandfathered but receive zero incremental reward dilution, incentivizing delegators to route capital to unsaturated, high-performing worker nodes.

---

## 7. Settlement & Daily Merkle Batching

```
Day T Execution ───> 24h UTC Cutoff ───> Merkle Root Proposed ───> 24h Challenge Window ───> Finalized Root
                                                                                                  │
                                                                 On-Demand Batch Claims <─────────┘
```

1. **Daily Cadence**: Tasks verified within a 24-hour UTC window are aggregated into an epoch manifest.
2. **24-Hour Dispute Window**: Proposed Merkle roots undergo an immutable 24-hour challenge period before on-chain finalization.
3. **On-Demand Accumulative Claims**: Users are not forced to submit daily on-chain claims. Earned allocations safely accumulate across epochs and can be claimed in a single batched transaction (up to 20 epochs simultaneously), minimizing Layer 2 transaction costs.
4. **Dispute Quarantine**: Contested tasks isolate only their specific reserved allocation; all uncontested tasks within the epoch proceed to settlement without interruption.

---

## 8. Non-Slashable Principal Vault Architecture

Delegator assets are held in a segregated on-chain vault contract (`OrbitStakeVault.sol`):

- **Zero Slashing Penalty**: Ordinary delegators do not execute code and are never subject to slashing penalties for worker computation errors or network downtime.
- **Timelocked Unbonding**:
  - **Normal Unbonding**: 48-hour mandatory queue delay (`EXIT_DELAY = 2 days`).
  - **Emergency Unbonding**: 6-hour accelerated exit window (`EMERGENCY_EXIT_DELAY = 6 hours`) automatically active during recorded system pause events.
- **Operator Bond Decoupling**: Worker node performance bonds (subject to assignment access revocation and 7-day exit locks) are held in separate accounting, preventing commingling with delegator funds.

---

## 9. Verification & Reference Implementation

The complete Orbit Earn specification is backed by comprehensive, machine-auditable verification suites in the protocol repository:

- **Mathematical Economy Engine & Consensus**: [`packages/node-protocol/src/orbit-earn.ts`](packages/node-protocol/src/orbit-earn.ts) (Verified under 589 property test assertions & integer budget conservation).
- **Cryptographic Commit-Reveal Engine**: [`packages/node-protocol/test/orbit-earn.test.mjs`](packages/node-protocol/test/orbit-earn.test.mjs) (Verified with authentic Ed25519 cryptographic signatures).
- **On-Chain Segregated Vault Contract**: [`contracts/src/OrbitStakeVault.sol`](contracts/src/OrbitStakeVault.sol) (Verified with pure non-custodial accounting, zero admin transfer keys, and automated ABI audit in [`contracts/test/orbit-stake-vault.test.mjs`](contracts/test/orbit-stake-vault.test.mjs)).
