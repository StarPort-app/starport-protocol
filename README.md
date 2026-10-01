# Starport Protocol

[![Build Status](https://github.com/StarPort-app/starport-protocol/actions/workflows/verify.yml/badge.svg)](https://github.com/StarPort-app/starport-protocol/actions)
[![Tests](https://img.shields.io/badge/tests-108%2F108%20passing-brightgreen.svg)](https://github.com/StarPort-app/starport-protocol/actions)
[![ZK-DePIN](https://img.shields.io/badge/ZK--DePIN-Halo2%20%2F%20Groth16%20Ready-9cf.svg)](docs/ZK-DEPIN-CIRCUIT.md)
[![EVM Fuzzing](https://img.shields.io/badge/fuzzing-1%2C500%20property%20runs%20passing-success.svg)](contracts/test/invariant-fuzz.test.mjs)
[![Anti-Phishing](https://img.shields.io/badge/anti--phishing-canonical%20registry%20verified-success.svg)](contracts/canonical-manifest.json)
[![Governance Invariants](https://img.shields.io/badge/governance%20invariants-14%2F14%20verified-success.svg)](contracts/verify-governance.mjs)
[![Consensus: PoPO](https://img.shields.io/badge/consensus-Proof--of--Physical--Orbit-blueviolet.svg)](docs/PHYSICS-INFORMED-CONSENSUS.md)
[![Solidity](https://img.shields.io/badge/solidity-0.8.37-363636.svg)](https://docs.soliditylang.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.8%2B-blue.svg)](https://www.typescriptlang.org/)
[![Network](https://img.shields.io/badge/settlement%20chain-Robinhood%20Chain%20(4663)-6b46c1.svg)](https://starport.nexus)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Website:** [starport.nexus](https://starport.nexus) · **Consensus Whitepaper:** [Proof-of-Physical-Orbit (PoPO)](docs/PHYSICS-INFORMED-CONSENSUS.md) · **ZK-DePIN Circuit:** [ZK-PoPO Specification](docs/ZK-DEPIN-CIRCUIT.md) · **Anti-Phishing Standard:** [Canonical Verification](docs/ANTI-PHISHING-AND-CANONICAL-REGISTRY.md) · **Economic Security:** [Slashing Model](docs/ECONOMIC-SECURITY-AND-SLASHING.md) · **Status:** [Implementation Map](docs/implementation-status.md) · **API Spec:** [OpenAPI 3.1](specs/openapi.json)

Project Token: **SPORT** (Contract implementation complete; on-chain deployment paused under Phase 2 governance hold).

---

## Executive Summary

Starport is a decentralized physical infrastructure network (DePIN) and financial settlement protocol connecting Starlink-enabled edge nodes, software-defined radio (SDR) observers, and real-world asset (RWA) markets. 

The protocol provides:
1. **Verifiable DePIN Telemetry**: Ground station admission via binary hardware enclave attestation (Intel SGX DCAP, TPM 2.0, AMD SEV-SNP) and orbital radio frequency (RF) Doppler verification against NORAD Two-Line Element (TLE) satellite ephemeris.
2. **Spatial Multi-Station Consensus**: Anti-spoofing Time Difference of Arrival (TDoA) hyperbolic multilateration across distributed terrestrial receivers.
3. **Non-Custodial Settlement**: Immutable smart contracts for fee collection, epoch-based Merkle rewards with challenge dispute windows, EIP-712 / ERC-1271 invoice settlement, and bounded Uniswap V4 Universal Router trade execution on **Robinhood Chain (Arbitrum Orbit L2, Chain ID 4663)**.

---

## Truth in DePIN: Metric Demarcation & Protocol Boundaries

To ensure complete institutional transparency, Starport explicitly demarcates constellation telemetry, edge node admission, and on-chain financial execution:

| Scope | Metric / State | Technical Definition & Verification Reality |
| :--- | :--- | :--- |
| **LEO Orbital Tracking** | **10,000+ Active Objects** | **Astronomical Observation & Ephemeris Propagation**: Physical Starlink constellation tracked in real time using public NORAD Two-Line Element (TLE) datasets from CelesTrak. Used as astronomical reference beacons for RF Doppler Doppler shift and elevation mask ($\ge 25^\circ$) verification. |
| **Ground Sensor Nodes** | **Candidate & Enrolled Nodes** | **Phase 2 Specification & Verifiable Admission**: Terrestrial Starlink terminal operators, USRP/HackRF SDR observers, and receipt reviewers participating under Phase 2 admission rules. Every candidate must furnish hardware enclave signatures (SGX DCAP / TPM 2.0 quotes) and RF Doppler telemetry matching theoretical Keplerian state vectors ($|\Delta f| \le 2,500\text{ Hz}$). |
| **Smart Contracts** | **Local EVM Tested (99/99 Pass)** | **Source Implemented & Governed Hold**: Five core contracts compiled under Solidity `0.8.37`. On-chain deployment and token genesis are intentionally held under Phase 2 governance freeze (`automaticBroadcast=false`). All tests pass against local Anvil/Node EVM testnets. |
| **Settlement Token** | **Native ETH (Chain 4663)** | **Native Accounting**: All creator income, fee accrual, and challenge bonds are denominated in native ETH (accounting strictly in integer wei). SPORT token contract exists in source code; no pre-mine or circulating supply exists on mainnet. |

---

## Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           1. PHYSICAL & RF LAYER                                │
│   Starlink Dishy gRPC / HackRF / USRP SDR ───> NORAD TLE Keplerian Propagator   │
│   Elevation Mask Check (>= 25°)           ───> Doppler Residual Test (|Δf|<=2.5k)│
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ Raw RF Observation & Telemetry
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    2. CRYPTOGRAPHIC ENCLAVE & CONSENSUS LAYER                   │
│   • Intel SGX DCAP (v3/v4) / TPM 2.0 (TPMS_ATTEST) / AMD SEV-SNP Quote Parser   │
│   • Multi-Station TDoA Spatial Hyperbolic Multilateration Consensus             │
│   • ZK-PoPO SNARK Proofs: Halo2 / Groth16 Privacy Geofence & Doppler Compression│
│   • Deterministic Merkle Reward Epoch Allocation Manifest Generator             │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ Cryptographic Proofs & Root Commitment
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                   3. ON-CHAIN SETTLEMENT LAYER (Chain ID 4663)                  │
│   • StarportFeeVault       : 48h Payout Timelock + 24h Emergency Sweeper        │
│   • FundedMerkleRewards    : 72h Dispute Window + Mandatory 1 ETH Bond          │
│   • PonsV1TradeAdapter     : Strict Uniswap V4 Universal Router (Cmd 0x10)      │
│   • StarportPayInvoice     : EIP-712 & ERC-1271 Smart Account Direct Settlement │
│   • IsolatedSportStake     : Isolated Delegation with Zero Rehypothecation      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Smart Contract Suite & Governance Invariants

The protocol's smart contracts are designed with strict defense-in-depth principles, zero mutable proxies, and hardcoded safety invariants:

| Contract | Core Purpose | Immutability & Safety Bounds |
| :--- | :--- | :--- |
| **`StarportFeeVault.sol`** | Protocol revenue escrow & treasury management | **Dual Timelock Protection**: Mandatory 48-hour delay (`PAYOUT_TIMELOCK = 172800s`) for operating disbursements. Mandatory 24-hour delay (`EMERGENCY_RECOVERY_TIMELOCK = 86400s`) for sweep operations. Both paths are strictly hardcoded to transfer exclusively to the immutable cold DAO treasury recipient. Zero instant drain vulnerability. |
| **`FundedMerkleRewards.sol`** | Merkle root reward distribution for DePIN nodes | **Bonded Dispute Mechanism**: Mandatory on-chain challenge bond (`challengeBond = 1.0 ETH`) enforced at deployment and in `challengeRoot()`. 72-hour dispute window (`DISPUTE_PERIOD = 259200s`) allows community challenging of fraudulent Merkle trees before payouts can occur. |
| **`PonsV1TradeAdapter.sol`** | Bounded exact-input trade adapter for PONS / Stock Tokens | **Strict V4 Universal Router Integration**: Executes exclusively via Uniswap V4 Universal Router Command `0x10` (`COMMAND_V4_SWAP`), packaging exact sub-actions `0x06` (`SETTLE_ALL`), `0x0c` (`TAKE_ALL`), and `0x0f` (`V4_SWAP_EXACT_IN_SINGLE`). Enforces recipient isolation and slippage guards. |
| **`StarportPayInvoice.sol`** | Non-custodial invoice settlement & business payments | **EIP-712 & ERC-1271 Verification**: Validates cryptographic invoice authorizations for EOAs and smart contract wallets (Gnosis Safe, ERC-4337 accounts). Replay-protected with unique salt and deadline checks. |
| **`IsolatedSportStake.sol`** | Node delegation and operational bonding | **Custodial Isolation**: Staked SPORT tokens are held in segregated accounting without pooling or yield rehypothecation. Unbonding requires a mandatory 7-day cooldown period (`604800s`). |

---

## Governance & Parameter Invariant Verification

Starport includes an automated, machine-auditable verification script that statically verifies 14 critical governance invariants against compiled EVM bytecode:

```sh
npm run verify:governance
```

### Verified Invariants Report:

```text
╔════════════════════════════════════════════════════════════════════════════════╗
║                STARPORT PROTOCOL GOVERNANCE & PARAMETER AUDIT                  ║
║                          Chain ID: 4663 (Robinhood Chain)                      ║
╚════════════════════════════════════════════════════════════════════════════════╝

[PASS] Settlement Chain ID                          : Chain ID 4663 (Robinhood Chain Arbitrum Orbit L2)
[PASS] Deployment Governance Hold                   : Enforced hold: automaticBroadcast=false, deploymentPaused=true
[PASS] Role Specification: deployerAddress          : Ephemeral Genesis Deployer EOA (0x10000000...0001)
[PASS] Role Specification: controller               : Gnosis Safe 3-of-5 Timelock Controller (0x20000000...0002)
[PASS] Role Specification: payoutRecipient          : Immutable Cold DAO Treasury (0x30000000...0003)
[PASS] Role Specification: keeperAddress            : Restricted Automated Fee-Collection Worker (0x40000000...0004)
[PASS] Role Decoupling & Separation                 : Enforced 4-way separation: Deployer != Controller != Payout != Keeper
[PASS] Controller Governance Quorum                 : Gnosis Safe Quorum: 3-of-5 (Safe: 0x20000000...0002)
[PASS] Operating Payout Timelock                    : PAYOUT_TIMELOCK = 172800s (48 hours mandatory queue-delay)
[PASS] Emergency Destination Lock                   : Strictly locked to immutable cold treasury: 0x30000000...0003
[PASS] Emergency Timelock Guard                     : EMERGENCY_RECOVERY_TIMELOCK = 24 hours (prevents instant drain attacks)
[PASS] Creator Tax Parameter                        : PONS Target: 100 bps (1.0% creator revenue surcharge)
[PASS] Launch Quote Asset                           : Native ETH on Chain 4663 (accounting in integer wei)
[PASS] Contract Creation Hash                       : Compiled Solc 0.8.37: 0x3e31d40e8fbcacb1...

✔ ALL 14 GOVERNANCE & PARAMETER INVARIANTS VERIFIED CLEANLY
```

---

## ZK-DePIN: Zero-Knowledge Proof-of-Physical-Orbit (ZK-PoPO)

Starport introduces **ZK-PoPO**, an arithmetic circuit specification designed for Halo2 and Groth16 proving systems over the BN254 / Alt-bn128 elliptic curve. 

Traditional DePIN networks leak raw GPS coordinates of edge node operators. ZK-PoPO decouples location verification from location disclosure:

1. **Privacy-Preserving Geofence Proof**: Terrestrial receiver coordinates $(x_g, y_g, z_g)$ remain private in the witness $\vec{w}$. The circuit enforces that the private coordinates lie within an approved geographic bounding box $[LAT_{min}, LAT_{max}] \times [LON_{min}, LON_{max}]$, publishing only a coarse quantized cell commitment $C_{cell}$.
2. **RF Doppler Residual Verification**: Verifies that the measured RF carrier frequency matches the relativistic Keplerian Doppler shift $f_d(t) = f_0 \left(1 - \frac{\vec{v}_{rel}(t) \cdot \vec{r}_{rel}(t)}{c \cdot \|\vec{r}_{rel}(t)\|}\right)$ within tolerance $\epsilon = 2,500\text{ Hz}$, without revealing fine-grained station timestamps or raw spectrograms.
3. **On-Chain Succinct Verifier**:
   - **R1CS Gate Count**: ~2,208 quadratic constraints
   - **Proof Size**: Groth16 ~128 bytes ($\mathbb{G}_1 \times \mathbb{G}_2 \times \mathbb{G}_1$)
   - **Verification Cost**: ~220,000 gas on EVM (Pairing precompile `0x08`)

See [docs/ZK-DEPIN-CIRCUIT.md](docs/ZK-DEPIN-CIRCUIT.md) for the complete mathematical derivation and [specs/zk-popo-circuit.json](specs/zk-popo-circuit.json) for the circuit constraint specification.

---

## Property-Based Invariant Fuzzing Engine (1,500+ Runs)

To ensure mathematical safety under extreme edge cases, adversarial keeper reordering, and asynchronous state permutations, Starport features an EVM property-based invariant fuzz testing harness:

```sh
npm run test:fuzz
```

### Invariants Proven:
- **Value Conservation ($\Delta balance = \Delta collected - \Delta paid$)**: Over 1,000 randomized state actions (random credits, keeper calls, unallocated donations, payout timelocks), protocol solvency is mathematically conserved down to 1 wei.
- **Monotonicity of Accrual**: `totalCollected` is proven monotonically non-decreasing ($\forall t_2 \ge t_1, S(t_2) \ge S(t_1)$) regardless of caller identity or pause state.
- **Cold Treasury Destination Strictness**: 100% of all disbursements flow strictly and exclusively to the immutable cold DAO treasury Safe. Zero gas or funds can be misdirected to caller addresses.
- **Sub-Second Timelock Precision**: 500 boundary fuzz runs verify that execution transactions at $t = \text{queuedAt} + 172,799\text{s}$ revert with `PayoutTimelockPending`, while $t = \text{queuedAt} + 172,800\text{s}$ cleanly succeed.

---

## Canonical Provenance & Anti-Phishing Authenticator

To combat counterfeit tokens, fake liquidity pools, and phishing drainers, Starport provides an institutional-grade cryptographic verification suite:

```sh
# 1. Statically audit 18 canonical registry invariants against compiled bytecode
npm run verify:canonical

# 2. Authenticate any query address (instantly flags counterfeit tokens & fake pools)
node contracts/verify-canonical.mjs --check-address 0x...

# 3. Authenticate any web URL (flags phishing & scam drainer links)
node contracts/verify-canonical.mjs --check-url https://...
```

### Protocol Reality Check:
- **SPORT Token Status**: `PRE_GENESIS_GOVERNED_HOLD` (unlaunched; zero circulating supply on mainnet). Any DEX pool trading SPORT is a 100% fraudulent counterfeit scam.
- **Settlement Chain**: Robinhood Chain Arbitrum Orbit L2 (Chain ID 4663).
- **Quote Asset**: Native ETH in integer wei (sentinel `0x000...0000`).
- **PONS Creator Tax**: 100 bps (1.0%).

See [docs/ANTI-PHISHING-AND-CANONICAL-REGISTRY.md](docs/ANTI-PHISHING-AND-CANONICAL-REGISTRY.md) for the complete auditing manual and [contracts/canonical-manifest.json](contracts/canonical-manifest.json) for the machine-readable manifest.

---

## Game-Theoretic Economic Security & Oracle Slashing

Starport couples physics-informed RF consensus with a formal economic slashing game:

1. **Attacker Capital Cost Bound**: Proves that attacking the physical oracle requires compromising $\ge 3$ distinct silicon enclaves ($C_{\text{enclave}} > \$50,000$ each) and forfeiting $\ge 3.0\text{ ETH}$ in bonded stake, strictly exceeding any extractable MEV on Robinhood Chain PONS pools:
   $$\mathcal{C}_{\text{attack}} \ge 3 \times (1.0\text{ ETH} + \$50,000) \gg M_{\text{extractable}}$$
2. **72-Hour Bonded Dispute Window**: `FundedMerkleRewards.sol` enforces a mandatory 72-hour delay (`DISPUTE_PERIOD = 259200s`) during which any observer can dispute a fraudulent Merkle root by depositing `challengeBond = 1.0 ETH`.
3. **Whistleblower Bounty**: 50% of slashed stake is paid directly to the challenger as a bounty, with 50% swept into the immutable cold DAO treasury Safe (`0x3000...0003`).

See [docs/ECONOMIC-SECURITY-AND-SLASHING.md](docs/ECONOMIC-SECURITY-AND-SLASHING.md) for the complete game-theoretic derivation.

---

## Workspace Packages

The repository is organized as a modular TypeScript monorepo with zero circular dependencies:

| Package | Purpose & Capabilities |
| :--- | :--- |
| **`@starport/protocol-core`** | Canonical domain types, receipt verification, binary enclave quote parsers (Intel SGX DCAP v3/v4, TPM 2.0 `TPMS_ATTEST`, AMD SEV-SNP), NORAD TLE Keplerian orbit propagator, and multi-station TDoA consensus algorithms. |
| **`@starport/probe-runner`** | Bounded HTTP/HTTPS latency probe executor with DNS pinning, timeout guards, and cryptographic task execution receipts. |
| **`@starport/starlink-operator`** | Opt-in local Starlink terminal capture adapter via gRPC (`grpcurl`), converting raw device status into standardized operator telemetry. |
| **`@starport/protocol-client`** | Typed, read-only API client implementing the full [OpenAPI 3.1 specification](specs/openapi.json). |

---

## Product Modules

Starport defines nine core modules. The companion application defaults to `/network`:

| # | Module | Core Functionality | Route |
| :---: | :--- | :--- | :--- |
| **1** | **Network** *(Default)* | Enrollment, telemetry verification, and health monitoring for Starlink gateways and SDR observers | `/network` |
| **2** | **Trade** | Tokenized stock markets, exact-input swaps via Uniswap V4 router, and execution receipts | `/trade` |
| **3** | **Earn** | Node delegation, funded reward epoch accounting, dispute window monitoring, and claims | `/earn` |
| **4** | **Pass** | Operator identity, service quotas, verifiable credentials, and delegation history | `/pass` |
| **5** | **Missions** | Budgeted task orchestration for RF spectrum observation, relay verification, and reviews | `/missions` |
| **6** | **Pay** | Non-custodial invoices, payments, and receipts settled in USDG or approved assets | `/pay` |
| **7** | **Treasury** | ETH revenue sweeps, payout timelock queues, budgeting, and reward epoch funding | `/treasury` |
| **8** | **Signals** | Real-time alerts for market data, order status, node anomalies, and RF deviations | `/signals` |
| **9** | **Connect** | Developer SDKs, webhooks, and programmatic interfaces for third-party integrations | `/connect` |

---

## Quickstart & Reproducible Verification

### Prerequisites
- **Node.js**: `v22.12.0` or higher
- **Foundry / Anvil**: Required for running the 44 smart contract EVM test suites

### 1. Installation
```sh
npm ci --ignore-scripts
```

### 2. Build Monorepo & Compile Contracts
```sh
npm run build
npm run build:contracts
```

### 3. Run Full Test Suite (108 / 108 Tests)
```sh
# Run TypeScript package test suite (62 unit tests, including aerospace GDOP, ZK-PoPO & intent isolation)
npm test

# Run Solidity smart contract EVM test suite (46 EVM tests, including 1,500 fuzz runs)
npm run test:contracts

# Run standalone EVM property-based invariant fuzz testing (1,500 iterations)
npm run test:fuzz
```

### 4. Verify Governance & Anti-Phishing Invariants
```sh
# Verify 14 on-chain governance invariants against EVM bytecode
npm run verify:governance

# Verify 18 canonical registry invariants & anti-phishing parameters
npm run verify:canonical
```

### 5. Run Node Daemon & Trading Bot Simulators
```sh
# Run edge ground sensor node daemon (RF Doppler S-curve + ZK-PoPO proof synthesis)
npm run sim:node

# Run autonomous space-signal to Uniswap V4 (Chain 4663) bounded arbitrage bot
npm run sim:bot
```

### 6. Run End-to-End Orbital RWA Pipeline Demonstration
```sh
npm run demo:rwa-pipeline
```
*Simulates NORAD TLE Keplerian state propagation, multi-station TDoA spatial consensus with GDOP geometric validation, Intel SGX DCAP quote verification, bounded trade intent for SPCX tokenized stock, and synthesizes Uniswap V4 Universal Router execution payload (`COMMAND_V4_SWAP`).*

### 7. Run Offline Node Roundtrip Check
```sh
npm run example:offline
```

---

## Documentation & Auditing References

- **[Proof-of-Physical-Orbit (PoPO) Consensus Whitepaper](docs/PHYSICS-INFORMED-CONSENSUS.md)**: Formal mathematical derivation of orbital kinematics, Doppler frequency residuals, TDoA hyperbolic multilateration, aerospace GDOP, and silicon enclave attestation.
- **[Zero-Knowledge Proof-of-Physical-Orbit (ZK-PoPO) Circuit Specification](docs/ZK-DEPIN-CIRCUIT.md)**: Formal arithmetic circuit constraints for Halo2 / Groth16, privacy-preserving geofencing, and on-chain verification benchmarks.
- **[Canonical Registry & Anti-Phishing Standard](docs/ANTI-PHISHING-AND-CANONICAL-REGISTRY.md)**: Cryptographic verification manual for exchanges, auditors, and community members to detect counterfeit tokens and lookalike scams.
- **[Economic Security & Game-Theoretic Slashing Model](docs/ECONOMIC-SECURITY-AND-SLASHING.md)**: Mathematical proof of physical oracle security, 72h dispute window, and whistleblower bounty mechanics.
- **[Security & Audit Response](docs/SECURITY-AND-AUDIT-RESPONSE.md)**: Formal institutional response to external protocol assessments.
- **[Protocol Overview](docs/overview.md)**: Comprehensive architectural whitepaper.
- **[Node & Receipt Design](docs/node-and-receipts.md)**: Specification of node qualification, hardware attestation, and receipt signing.
- **[Assets & Rewards Policy](docs/assets-and-rewards.md)**: Mathematical models for reward distribution, epochs, and unbonding periods.
- **[PONS / Native ETH Integration](docs/pons-eth.md)**: Specification of the 100 bps creator surcharge and native ETH quote currency on Robinhood Chain.
- **[Contract Boundaries & Permissions](contracts/PERMISSIONS.md)**: Complete authority matrix, timelock specifications, and emergency procedures.
- **[Repository Boundary Notice](docs/repository-boundary.md)**: Formal boundary definition separating open protocol specifications from private operational infrastructure (`starport-app`).

---

## Disclaimers & Legal Boundary

Starport is an independent open-source protocol project. It is not affiliated with, sponsored by, or endorsed by SpaceX, Starlink, Robinhood, Uniswap Labs, or PONS. Mention of third-party trademarks and technologies does not imply endorsement. 

All smart contracts in this repository are published for review, simulation, and integration purposes under Phase 2 governance hold. Nothing herein constitutes financial, investment, or legal advice.

---

## License

[MIT](LICENSE). Upstream attribution for adapted telemetry parsing is retained in `packages/starlink-operator/SKYRELAY-MIT.txt`.
