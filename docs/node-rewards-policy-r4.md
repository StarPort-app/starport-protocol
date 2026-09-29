> **Current target (September 30, 2026):** SPORT / native ETH, with a **1% (100 bps) additional creator tax**. Earlier 0.5% targets below are historical. Base-fee shares and optional buybacks are separate; no on-chain launch or tax change has occurred. See [current ETH scope](pons-eth.md).

> **R6 update:** Launch quote and creator revenue are now native ETH. Earlier SPCX launch references below are historical, not the current configuration. SPCX remains a separately funded ERC-20 reward candidate; automatic conversion and rewards stay off. See [native ETH scope](pons-eth.md).

# SPORT Node Participation and Funded Rewards — R4

**R5 boundary:** the final fee recipient is a pending contract vault. Hardware reward buckets in this historical R4 policy remain inactive during the software-first rollout; collection does not create a reward entitlement. See [R5](fee-vault-r5.md).

**Implementation update:** principal exits and funded reward custody now have source implementations. See [Earn implementation v1](earn-implementation.md) for the exact subset, constructor gates, review trust assumptions and unimplemented allocator/admission components. This historical policy does not mark those contracts as deployed or every R4 rule as implemented.

## 1. Decision and status

**Proposed protocol policy; design only; not active.** These defaults complete the participation design without pretending that a token, contract, node fleet, reward budget, or eligibility service exists. The companion `participation-policy.design.json` records the same choices as non-executable design data. No deployment, signature, transfer, launch, or operational test is authorized by these documents.

| Item | R4 decision |
| --- | --- |
| Project ticker | **SPORT**; token contract, decimals, supply, and allocation remain pending deployment/design confirmation. Never select an asset by ticker alone. |
| Chain target | Robinhood Chain, **4663**. |
| Treasury recipient supplied by the user | `0xAf3eAA38a445392f1E9d1faE463871998745cb75`. This is not proof of ownership, signer control, historical fee entitlement, or multisig configuration. |
| Launch quote / creator-fee asset | SPCX, recorded address `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa`, recorded decimals 18. Reverify mutable integration details before activation. |
| Creator-fee target | **50 bps (0.50%)**; not an extra SPORT transfer tax, not all trading fees, and not a deployed setting. |
| Reward funding | Manually approved, actually received, reconciled SPCX; direct distributions require applicable asset and participant eligibility. |
| Automatic conversion | **Off**. No synthetic USDG rewards or automatic sale of SPCX. |
| Initial earning epoch | **3 days (72 hours / 259,200 seconds)**; continuous windows from the configured `firstStartTimestamp`, with no weekday alignment. Activation selects and publishes that first start. |
| Reward budget split | **70% gateway work / 10% RF observation / 10% independent review / 10% delegation participation**. |
| Delegation exit | **7 days** normally; a recorded incident may shorten it to **48 hours**. |
| Operator bond exit | **14 days** for uncontested funds; disputed slices release or settle by an absolute **28-day** exit deadline. |

The economic distinction is deliberate: 90% of the reward budget purchases useful work; the 10% delegation component is a conditional participation incentive, not passive ownership of protocol profits. R4 supersedes older design wording that left the project ticker unspecified; it does not establish a token address.

## 2. What each participant gets

- **Ordinary holders:** ownership of their SPORT tokens, subject to the eventual token's actual terms. Merely holding SPORT creates no guaranteed payment, fixed APY/APR, revenue share, voting authority, or ownership of Starlink terminals, SpaceX, stock, or operating companies.
- **Delegators:** a visible, withdrawable SPORT principal position; choice of admitted gateway; a transparent contribution history; potential eligibility for the small funded delegation bucket under the formula below. Delegation is service participation, not base-chain consensus. No minimum token holding is introduced for ordinary Trade/Pay browsing.
- **Gateway operators:** eligibility for bounded assignments, a service reputation/history, and potential work rewards for verified unique service units. Rewards compensate qualifying service, not token price or trading volume. The operator remains responsible for its own lawful equipment/connectivity arrangements and actual costs.
- **RF observers and reviewers:** separately commissioned, budgeted evidence work with published targets and acceptance criteria. Neither role acquires gateway status, authority to sign user funds, or authority over blockchain consensus.

Actual received SPCX and actual costs determine affordability. Self-trading or recycling the operator's own treasury money through fees does not create outside revenue or profit. Token appreciation, locked LP, future turnover, and an unpaid receivable are not operating cash or reward funding. Operating costs can exceed revenue; in that case the new reward budget is zero.

## 3. Supervised node admission

Starlink BYOD gateways are the core network. Admission is supervised in R4, not permissionless and not proof of a global live fleet.

### Capability-specific evidence

| Capability | Admission evidence | Claim it must not make |
| --- | --- | --- |
| `starlink_gateway` | Operator identity grouping, redacted evidence of control of an existing authorized Starlink connection, registered node public key, bounded agent configuration, independent connectivity observations, declared capacity. | An exit ASN, IP address, signature, or map marker alone proves the end-to-end satellite route. |
| `rf_observer` | Equipment/method description, approved public observation targets, timestamp/provenance process, independently reproducible specimen. | Receiving any public signal makes the observer a Starlink gateway. |
| `evidence_reviewer` | Reproduction capability, conflict disclosure, signed assessment procedure, successful blind review specimens. | A review alone proves physical reception, fraud, transaction execution, or finality. |

Do not collect users' private keys, Starlink account passwords, or precise household locations for public display. Public profiles use redacted evidence references and coarse service regions. The gateway country cannot bypass a customer's asset/region eligibility.

### Proposed onboarding sequence

1. **Application:** publish requirements before any bond deposit. Group affiliated operators by disclosed control, not address count. A reviewer responds within **3 calendar days** or marks the application delayed with a reason; no applicant funds are locked while awaiting review.
2. **Evidence review:** require **two non-conflicted reviewer approvals**. These are proposed operational roles, not an existing decentralized committee. Missing reviewers leave admission pending, not falsely approved.
3. **Probation:** minimum **7 days**, maximum **14 days per attempt**. Gateways require at least **100 approved probes**, spread over at least seven days, observed from at least **two independently operated vantage points**, with **95% successful scheduled connectivity probes**. RF observers require **10 approved observation specimens**; reviewers require **10 blind review specimens**, with at least **9 accepted for evidentiary quality**, not for reaching a preferred verdict. The two non-conflicted admission reviewers assess these evidence-role specimens. These are admission measurements, not advertised uptime or accuracy guarantees.
4. **Bounded operation:** probation uses at most **10% of its measured capacity**, no arbitrary RPC/URL relay, and no customer financial task until every financial integration is separately enabled. Routine admission probes earn no reward; a specifically funded pilot mission must be labeled and budgeted separately.
5. **Decision:** admit, request a new evidence attempt, or reject by day 14. Insufficient observations do not create an indefinitely rolling probation. Admission may be suspended for unsafe behavior; it never blocks a delegator's principal exit.
6. **Activation:** collect the separately configured operator bond only after the admission decision and before assigning bonded active work. The bond amount and service tier are disclosed before deposit. Reassess capability and capacity every **30 days**, and immediately after a material operator/key/connectivity change.

Raw SPORT bond amounts, workload sizes, latency limits, concurrency, probe intervals, and supported software versions are calibrated from runtime measurements. Their configuration may change future assignments; it cannot retroactively rewrite deposit terms or accrued allocations. There is intentionally no invented fixed SPORT entry minimum at an unknown price/supply.

## 4. Useful work and auditable points

Points are non-transferable accounting units, not tokens or guaranteed SPCX claims. Publish each epoch's policy hash, funded asset, budgets, eligible task templates, caps, and acceptance rules before paid work begins. Publishing no funded policy means no paid assignments.

| Bucket | Eligible unit | Default points | Acceptance boundary |
| --- | --- | --- | --- |
| Gateway | One independently attributable, externally requested and assigned bounded relay-service task. | **100** | Valid authorization, correct fixed scope, independent attempt observation, and a complete receipt matching the task. A truthful reverted/expired chain outcome may still document delivered relay service; never count it as a successful trade. |
| RF observation | One commissioned observation target/window with original evidence and required provenance. | **100** | Acceptance under the task-specific collection standard; public historical data cannot become newly collected evidence. |
| Independent review | One assigned review of a specified artifact/scope. | **100** | Reproducible reasoning and evidence, timely result, and no conflict of interest. Correct Inconclusive or Fail results can earn points; payment must not reward only Pass verdicts. |

- One canonical task/work item has one total payable points cap. Repeated broadcasts, retries, multiple keys, split uploads, duplicate receipts, or several reviewers claiming the same assigned slot do not multiply it.
- Each template fixes its maximum workload and points before assignment. A materially harder task requires a different pre-approved template, not a retrospective multiplier. Fees or transaction notional never multiply gateway points.
- A task with an unknown financial submission can retain truthful service evidence, but new financial execution is prohibited until the original intent/nonce/hash is reconciled. Reward accounting cannot clear that uncertainty or authorize another payment.
- Operational costs paid under an expense/service invoice and performance incentives must be identified separately. The same cost or identical reward unit cannot be reimbursed twice by relabeling it.
- Every point entry records epoch, canonical task, assigned slot, operator group, capability, policy/template version, source commitment, assessment, observed times, and any reversal. Raw orders and private evidence remain restricted.

### Anti-farming and concentration defaults

Known self-requested/related-party tasks, circular volume, operator-funded wash activity, and duplicate economic actions receive **zero reward points**. Separately authorized testing belongs to a capped pilot mission, never the organic-work bucket. Rate/cost limits apply at customer, operator-group, target, and capability boundaries; a new wallet is not a new independent entity.

Each known control group may receive at most **20% of an individual work bucket per epoch**. Excess is left unallocated, not redistributed until a later funded epoch. At a small launch fleet this deliberately under-distributes; it does not fabricate more independent operators. Identity grouping is fallible: disclose the evidence basis, permit review, and never claim perfect Sybil resistance. A disputed affiliation may suspend new allocations but not seize delegation principal.

For work bucket budget `B`, group points `P_g`, and total eligible points `P`, the maximum provisional allocation is `min(floor(B × P_g / P), floor(B × 20%))`. Allocate within that group by accepted points. If `P = 0`, distribute nothing. Integer rounding dust and rejected/ineligible/unallocated shares remain recorded reserves in the same asset.

## 5. Funding waterfall and budget discipline

Keep creator fees, unrelated customer service income, external mission sponsorship, delegated principal, and operator bonds in distinct ledgers. An internal transfer between fee stages is not fresh revenue.

Before each paid epoch:

1. Reconcile canonical received revenue, historical beneficiary entitlement, and unrestricted wallet balance. Known circular/related-party receipts are labeled separately and excluded from the organic reward-subsidy basis.
2. Reserve committed node/API/data/operating liabilities in their actual payment assets. An SPCX valuation cannot satisfy an ETH or USDG liability.
3. Maintain a target operating reserve of **30 days of approved operating costs**. Use the approved initial operating plan until enough observations exist, then the last **four complete weeks** of measured costs with documented exceptional adjustments. No automatic cross-asset conversion is implied.
4. Determine same-asset spendable surplus after liabilities, reserve shortfall, previous reward commitments, and other earmarks. A negative surplus becomes zero; do not borrow from users or bonds.
5. Proposed funded reward budget **per epoch**: the smaller of the configured **raw-asset epoch cap** and **25% of actual spendable surplus at that funding decision**. This is a funding limit, not APR, APY, or a promised participant return. Explicit treasury approval may fund a smaller amount, never assume forecast revenue. Approved externally sponsored missions have their own segregated budget and terms.
6. Transfer and reconcile the approved amount into the reward distributor **before** the paid epoch opens. The supplied recipient address receives no implied auto-forwarding instruction. A web API or allocator cannot sign this transfer.

Split the actual funded budget 70/10/10/10. If a role has no useful demand, valid points, eligible recipients, or configured capability, its bucket remains unused. Do not move observer/reviewer budgets into passive delegation automatically. Any later reuse is a separately recorded funding decision after outstanding claims and reserves are accounted for.

Direct SPCX rewards are a **conditional option**, not a worldwide entitlement. Check both participant distribution eligibility and the actual asset transfer restrictions. Unknown, denied, stale, or incompatible eligibility blocks allocation/claim as applicable. There is no alternate recipient trick or automatic conversion to evade the restriction. An approved future payout asset requires its own actual funding, disclosed policy, and integration.

## 6. SPORT delegation and capacity-weighted participation

Delegation principal lives in an isolated SPORT vault. It is **non-slashable under this policy**: it cannot finance payroll, cover operator penalties, trade Stock Tokens, be converted, or become reward funding. This is a custody-rule requirement, not a guarantee of token price, contract safety, or unrestricted issuer transfers.

Only active admitted gateways participate in the delegation bucket in R4. RF observers/reviewers earn their distinct work allocations. Buying/delegating more SPORT does not create task demand, network bandwidth, voting control, or reward funding.

For gateway `n` at time `t`:

- `D_n(t)` = eligible active SPORT delegated to that gateway, in verified raw units.
- `C_n(t)` = the lower of independently measured service capacity and scheduler-authorized capacity justified by useful demand, in published capacity units.
- `S_n(t)` = `C_n(t) × supportSportRawPerCapacityUnit`, a versioned configured cap.
- Delegator `i` earns time weight `W_i,n = integral(activeEligiblePrincipal_i,n(t) × min(1, S_n(t)/D_n(t))) dt` over the epoch. If `D_n(t)=0`, that interval contributes zero.

Snapshots/events must reconstruct the integral and checkpoints; a closing-balance snapshot is insufficient. Deposits earn only the time actually active. An exit-requested tranche stops earning at the effective canonical request-block timestamp after confirmation/reconciliation, not at a browser click. Reorged requests are reconciled. Increasing a deposit or opening a new tranche never resets an older tranche's unlock deadline.

First distribute the delegation bucket among gateways in proportion to their independently accepted gateway-work points, with a **20% bucket cap per operator group**. A gateway with no accepted useful work receives zero delegation allocation regardless of stake. Then allocate each gateway share among its delegators by `W_i,n`, with a **10% cap of that gateway share per known delegator control group**. Excess, missing participation, ineligible claims, and rounding residue remain unallocated; do not reward a single participant with the absent participants' shares.

Operator-affiliated self-delegation is excluded from the delegation reward bucket; its principal retains the same withdrawal rights. It can be displayed as self-support but cannot be used to double-dip into the operator's participation incentives.

No early-arrival multiple, referral multiplier, guaranteed return, minimum holding period beyond the disclosed exit queue, or benefit based on trade volume is proposed. `supportSportRawPerCapacityUnit`, capacity-unit definitions, asset decimals, and raw maximum deposit/assignment bounds are configurable after supply, load, and price/liquidity observations. Until calibrated, show **Participation limits not configured** and do not accept new delegations; the policy design itself is complete.

## 7. Epoch challenge, allocation, and claims

- Initial earning epochs are continuous **72-hour** windows: epoch `n` spans `[firstStartTimestamp + n × 259200, firstStartTimestamp + (n + 1) × 259200)`. There is no Monday or weekly alignment. At the boundary, freeze new task admissions into the completed epoch; late receipts retain their task identity and go through the published late-evidence rule rather than being counted twice.
- The **three-day earning window is not a three-day payout promise**. Evidence review, the separate 72-hour root challenge, finalization, participant eligibility, and the claim transaction determine when a funded allocation can actually be received. Ending one earning window may overlap review of earlier windows; funds and commitments remain segregated by epoch.
- Publish the provisional points and candidate allocation commitment within **48 hours** of epoch end. Redact private evidence while retaining auditable commitments.
- Provide a **72-hour challenge period** before finalizing a Merkle root. A material root revision restarts that challenge period, but the whole epoch has a **14-day finalization deadline** after epoch end. Omit unresolved allocations as reserved/disputed rather than declaring them valid by timeout.
- If a root cannot be finalized by that deadline, close the epoch without new claimable allocations and retain an auditable cancellation record. Undistributed funding returns to its recorded source under the funding terms; no new indefinite lock or fictitious yield accumulates. A late disputed award requires a separately funded future allocation, never mutation of an already-final root.
- Finalized roots are immutable and domain-bound to chain, distributor, epoch, policy, asset, participant, index, and amount. Claims are single-use. `claimed ≤ allocated ≤ confirmed unreserved funding`, per asset; funding assigned to other epochs cannot cover a shortfall. A standard Merkle inclusion proof does not prove the sum of all leaves. The contract can cap total paid against declared allocation/funding, but an oversubscribed tree could still deny later valid claims. Independent complete-manifest review must verify the leaf sum, duplicates, caps, eligibility, and the manifest/root match before finalization; this remains an explicit publisher/reviewer trust boundary, not a claimed cryptographic sum proof.
- Claims remain open for **90 days from root finalization**. A distributor-wide protective pause may last at most **7 aggregate days per epoch**; the published deadline extends by its actual paused duration, at most seven days. The absolute claim lifecycle ends by day 97. A pause never changes the beneficiary or amount.
- At the final deadline, unclaimed amounts and dust return to the recorded funding source under the epoch's published terms, after claim state is reconciled. This expiry must be displayed before participation. Do not promise an automatic payout to blocked wallets or a perpetual claim.
- Revalidate applicable eligibility at claim execution. Asset restrictions or a chain outage can prevent transfer independently of Starport's UI; no committee can declare that technical or legal constraint solved by a policy label.

An allocation challenge controls only the disputed reward allocation. It cannot freeze all epoch funds or another user's principal. Operator-bond cases follow their separate bounds below.

## 8. Finite exits, bonds, and emergencies

### Delegated principal

An owner may request exit at any time through the vault, without needing an operator, API, reviewer, or treasury signature. Stop reward time weight for that tranche at the canonical request timestamp. Normal unlock is **request timestamp + 7 days**; the UI shows a trustworthy countdown after the configured confirmation policy and recomputes after reorganization. The contract uses block timestamps, not an imagined ability to observe its own finality.

Incident exit shortens unlock to `min(normal unlock, emergency request timestamp + 48 hours)` when an onchain-recorded protocol safety pause or the gateway's safety suspension applies. Snapshot that eligibility when the request is accepted; lifting the incident cannot relock funds. No pause, reward dispute, bond case, operator suspension, or policy update may extend the normal seven-day bound or block the isolated owner-withdrawal path.

For an optional permissionless incident shortcut, a real onchain operational-checkpoint oracle may make **72 hours without a fresh checkpoint** an emergency condition. An offchain timestamp cannot enforce this onchain; without that reviewed oracle, omit the shortcut and keep the direct seven-day exit, which needs no heartbeat. Ordinary exits must work even if every Starport service disappears.

Withdraw only to the principal owner in the first version. Full recipient/asset/amount/reorg and duplicate-withdrawal rules still apply. Bounds concern protocol-controlled locks: a halted chain, token-level transfer restriction, or compromised contract cannot honestly be guaranteed away.

### Operator bond — separate SPORT escrow

The bond is operator-funded and distinct from delegations. The active service tier publishes its **raw SPORT bond requirement**, assignment/exposure cap, penalty schedule, and policy hash. Raw requirements are calibrated before accepting bond deposits; zero/default/unknown is not a silently valid tier. More bond never proves more capacity.

- An unbond request immediately stops new assignments. Existing bounded service records must close or be marked unresolved within **24 hours**; closing a service record does not resubmit a financial action.
- Uncontested bond unlocks at **request + 14 days**. A challenge must identify an exact receipt/domain/attempt and be filed within **7 days of its relevant published receipt**, and no later than **unbond request + 7 days** for an exiting operator. Late publication cannot restart the exit clock.
- Proposed grounds: demonstrably fabricated evidence, intentional duplicate reward claims, or provably mutually exclusive signed statements in the same domain/attempt/schema/checkpoint. A truthful corrected state, chain reorganization, ordinary downtime, unlucky execution outcome, or a review disagreement alone is not slashable.
- The only proposed penalties are **10% of the bonded amount snapshotted at the incident** for a proven intentional duplicate reward claim and **25%** for proven fabricated evidence or exact-domain equivocation. Aggregate penalties for correlated conduct are capped at **25% of that snapshot**, bounded by the remaining unreserved operator bond. No penalty exceeds the bond or reaches delegation principal. Future deployments must explicitly adopt these terms before deposits; they are not live confiscation authority.
- Initial decision within **7 days of filing**; **7 days to appeal** after notice; final decision within **21 days of filing**. Use a proposed **2-of-3 non-conflicted adjudicator panel**, with no proposer/operator deciding its own case. This is a separate adjudication role, not a claim that the supplied treasury recipient is a multisig.
- Hold only the maximum provable disputed slice, not the entire bond. At most one reserved amount applies to correlated claims. All cases on an exiting bond must settle or release by **unbond request + 28 days**. Missing adjudicators, unresolved evidence, unavailable appeal review, or silence at the deadline releases that slice; service suspension may remain, financial lock may not.
- A finalized penalty goes to a separately accounted remediation reserve, never automatically to an accuser or generic treasury spending. No challenge-volume bounty. A challenge must not become another farming loop.

In an incident, uncontested bond slices may unlock at **request + 7 days**, after the challenge filing window closes; they must not use the delegation vault's 48-hour shortcut. Timely cases retain their hard 28-day outer bound. Requests accepted during an incident remain bound to their recorded terms. If the separate bond-escrow implementation cannot enforce deadlines, slice isolation, and bounded adjudication, bonded activation stays unavailable rather than borrowing the delegation vault as a substitute.

## 9. Contract and integration requirements

The contract-design owner should bind these policy choices, not infer new live capability:

1. **SPORT principal vault:** exact asset identity; credited principal conservation; owner-only withdrawals; tranche-level exit deadlines; no slashing/admin principal sweep; deposits paused independently of exits; seven-day normal and optional bounded incident shortcut; time-weight reconstructible events.
2. **Manual-funded reward distributor:** exact reward asset, source-owned residual terms, funded budgets, continuous three-day earning-epoch metadata/split, policy/eligibility commitment, separate 72-hour root challenge, immutable finalized Merkle commitments, replay-proof claims, 90-day claim window and at most seven days of pause extension, deadlines for closing unfunded/unfinalized epochs.
3. **Separate optional operator-bond escrow:** configured SPORT tier requirements, proof/policy-scoped adjudication, contested-slice isolation, fixed maximum penalties, explicit appeal notices, 14/28-day unbond bounds, and no ability to access user principal. Offchain suspension does not substitute for an enforced escrow deadline.
4. **Allocator/read models:** points provenance, control-group caps, time integral, capacity cap, reserved/disputed amounts, versioned policy changes, and exact integer rounding. The allocator prepares a commitment; it does not create funding or make an ineligible transfer permissible.
5. **Preview/UI:** show ticker SPORT with contract pending; per-asset SPCX income; funded/unfunded distinction; exact earliest/latest exit dates; no fixed yield; no invented current node metrics. Ordinary Trade/Earn users need not register a developer app in Connect.

## 10. Configuration and change control

These defaults are reversible **for future participation**, not retroactive powers over existing funds. Publish changes at least **7 days before** the first affected epoch. Snapshot policy, caps, eligibility rules, and exit terms on relevant deposits/assignments/epochs. Never lengthen an existing tranche's unlock, raise a past incident's penalty, or redirect a finalized allocation.

Runtime calibration must fill: SPORT address/decimals and supported token behavior; raw bond requirements by tier; capacity definitions/measurement windows; support SPORT per capacity unit; workload/rate/concurrency caps; raw-asset epoch caps; approved cost plan; actual signer/role identities; chain confirmation/finality policy; asset/participant eligibility integration; and any optional checkpoint oracle. Unset fields block only the dependent live capability, not public reading or completion of this design.

Activation requires its own reviewed implementation, financial/legal eligibility decisions, independently checked contract evidence, signer-control verification, and explicit authorization. This document supplies policy defaults; it does not claim those gates passed.
