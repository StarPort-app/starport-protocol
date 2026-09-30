> **Current target (September 30, 2026):** SPORT / native ETH, with a **1% (100 bps) additional creator tax**. Earlier 0.5% targets below are historical. Base-fee shares and optional buybacks are separate; no on-chain launch or tax change has occurred. See [current ETH scope](pons-eth.md).

> **R6 update:** Launch quote and creator revenue are now native ETH. Earlier SPCX launch references below are historical, not the current configuration. SPCX remains a separately funded ERC-20 reward candidate; automatic conversion and rewards stay off. See [native ETH scope](pons-eth.md).

# R5 — SPCX fee vault first

This decision supersedes R4 only where it identifies a plain wallet as the final PONS creator-fee recipient or makes a full custom Trade/Pay settlement stack a prerequisite of the initial revenue loop. It does not enable a launch, assign authority, or activate rewards.

### R5.1 emergency-asset amendment (not deployed)

The user requested reception of other assets and emergency handling. The revised vault accepts native ETH and same-chain ERC-20 transfers. PONS automation still claims only the configured SPCX asset; other deposits are not protocol income. The controller may enter emergency mode, which pauses collection and cancels old pending controller/beneficiary changes. Only the controller may recover held ERC-20 assets or ETH, and only to the immutable operating payout wallet. No arbitrary payout target, approval, selector execution, NFT receiver or Keeper withdrawal right is added. Exiting emergency mode does not automatically unpause collection. Generic recovery events report vault debit, not guaranteed recipient net credit for transfer-tax assets. Nonstandard or restricted tokens can still refuse recovery.

The revised permissions require confirmation before deployment. This emergency mechanism does not recover a lost/compromised controller key, and it does not automate withdrawal of other assets still held in PONS escrow. The controller can recover the entire held balance without a withdrawal timelock, but cannot redirect recovery away from the fixed payout wallet.

### September 28 role confirmation and deployment hold

The user confirmed `0xAf3eAA38a445392f1E9d1faE463871998745cb75` for deployment signing, vault control and the immutable operating payout address, and `0x2cC7450618B183346e2A47682a6a09ed255580fA` as the independent Keeper. These are planned roles, not active on-chain authority. The user explicitly paused vault deployment. `vaultAddress` and SPORT remain unset; signing, broadcasting and rewards remain off. Earlier R5 references to unconfirmed role choices below are historical; fee-recipient status remains pending contract deployment.

The constructor checklist, read-only binding observer and unsigned job-store foundation can be prepared during this hold. No private key is required now. The keeper schema is not applied by web startup and no keeper service or scheduler has been provisioned.

## Confirmed core (R6 Standard)

- Starport token: SPORT. PONS launch quote: **Native ETH** on Robinhood Chain 4663 (PONS zero-address sentinel, superseding earlier SPCX quote exploration).
- Creator tax target: **100 bps (1%)**; explicitly selected on September 30, 2026 (superseding earlier 50 bps / 0.5% research targets). Not an additional SPORT transfer tax.
- Creator proceeds stay in **native ETH (wei)**. USDG belongs to the separate Pay application; it is not substituted for launch proceeds or rewards.
- ETH pays keeper gas. Automatic conversion remains off.
- Application availability does not depend on accumulated token-fee volume. Paid rewards require actual available funding; no projected or unswept fee becomes spendable cash.
- Three-day reward epochs remain a future funded feature. The hardware work buckets in R4 are inactive during the software-first phase and are not silently reassigned to passive holders.

## Scope correction

The initial revenue path is **PONS accrued fees → PONS Fee Escrow → StarportFeeVault**. Controller, payout and Keeper addresses have been selected as listed above. The future vault address, not the payout wallet, must become the PONS creator-fee recipient. No selected address has gained authority from an undeployed contract.

Already useful orbital, account, asset, treasury-reference and payment-request features are retained. Further custom payment/trading settlement work is downstream of fee collection, not a prerequisite to operating the public-data application. PONS handles SPORT's own curve/pool market; its integration must not be conflated with general Stock Token order execution.

## Collection versus sweeping

Official PONS documentation exposes `balanceOfToken(recipient, token)` and `claimToken(token)` on the fee escrow. Fees must first be swept from the curve or hook. Sweeps involving conversion or buyback can require PONS's sweep operator. A zero escrow balance therefore does not prove zero accrued fees, and the vault does not pretend to automate restricted upstream swaps. Reference: [PONS v2 claiming fees](https://docs.ponsfamily.com/v2#claiming-fees).

The documented factory/escrow are integration references, not a substitute for resolving and verifying the stack of the actual SPORT launch. The September 28 [verified-source review](../contracts/PONS-SOURCE-REVIEW.md) confirms escrow caller/recipient semantics and factory migration access control. Runtime hashes, current mutable configuration and the eventual SPORT binding remain separate live checks. The older pinned repository snapshot was not a complete verified escrow source bundle.

## Implemented contract boundary

`StarportFeeVault` has immutable fee asset, PONS escrow, PONS factory and payout recipient bindings. Anyone may call `collectFees()`, but only the vault receives the fixed asset. There is no caller-selected recipient, arbitrary call, token approval, exchange route or keeper reimbursement. An exact before/after balance check records actual receipts, not donations or forecasts. An empty claim is a no-op.

The controller may pause collection, initiate a two-step controller handover and manually pay SPCX only to the immutable payout recipient. This is spending authority and must not be assigned to the keeper. No automatic reward allocation or spending percentages are implemented in the collection vault. An immutable payout address must be chosen carefully before deployment.

To avoid trapping future PONS beneficiary rights in the contract forever, a controller can propose a future-recipient change for a launched token through the immutable factory. Execution waits two days and remains controller-only. Old escrow credits and already received balances stay with the old vault. This mechanism is not a payout or a keeper power.

## Keeper boundary

The implemented decision module prepares only an unsigned `collectFees()` call. It checks the expected vault/asset/escrow/beneficiary binding, code hash, recent observation, pause state, existing pending submission and ETH gas sufficiency. Its default minimum claim amount is zero, so no arbitrary revenue target blocks collection; zero owed still causes no transaction. Gas batching may be configured separately and cannot stop ordinary application service.

There is no active signing process or scheduled mainnet collector yet. Deployment addresses, reviewed stack binding, a separately authorized gas wallet/signing service, job persistence and receipt reconciliation must be supplied before automatic broadcast. Unknown transaction outcome requires reconciliation, not a blind second send.

## Evidence and limits

The contract is compiled locally with pinned Solidity 0.8.37, Cancun EVM and optimizer 200. Focused isolated-EVM checks exercise collection, unauthorized spending rejection, failed-token rollback, controller acceptance, delayed future-recipient migration and an inert keeper plan. These use mocks, not the deployed PONS contracts. This is implementation evidence, not an independent security audit, deployed-vault address or proof of PONS mainnet compatibility.
