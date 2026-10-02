# Starport Protocol

> **Turning low-Earth-orbit satellite kinematics into immutable zero-knowledge consensus — the definitive cryptographic rails for space DePIN and tokenized Wall Street RWAs (SPCX, NVDA.d, TSLA.d, SPY.d) on Robinhood Chain.**

[![Build Status](https://github.com/StarPort-app/starport-protocol/actions/workflows/verify.yml/badge.svg)](https://github.com/StarPort-app/starport-protocol/actions)
[![Tests](https://img.shields.io/badge/tests-130%2F130%20passing-brightgreen.svg)](https://github.com/StarPort-app/starport-protocol/actions)
[![Aerospace EKF](https://img.shields.io/badge/EKF-5--State%20Orbital%20Doppler%20Filter-blueviolet.svg)](packages/node-protocol/src/extended-kalman-filter.ts)
[![Post-Quantum](https://img.shields.io/badge/Post--Quantum-NIST%20FIPS%20204%20ML--DSA--65-orange.svg)](packages/node-protocol/src/post-quantum.ts)
[![ZK-DePIN](https://img.shields.io/badge/ZK--DePIN-Circom%202.1%20%2F%20Groth16%20On--Chain-9cf.svg)](circuits/popo_verifier.circom)
[![Orbit Earn](https://img.shields.io/badge/Orbit%20Earn-Task--Budgeted%20Compute%20Engine-9cf.svg)](docs/ORBIT-EARN-SPECIFICATION.md)
[![RF Telemetry](https://img.shields.io/badge/RF%20Dataset-Calibrated%20Starlink%20Pass%20Verified-blueviolet.svg)](data/rf-telemetry/starlink-multi-station-pass-02.json)
[![EVM Fuzzing](https://img.shields.io/badge/fuzzing-1%2C500%20property%20runs%20passing-success.svg)](contracts/test/invariant-fuzz.test.mjs)
[![Anti-Phishing](https://img.shields.io/badge/anti--phishing-canonical%20registry%20verified-success.svg)](contracts/canonical-manifest.json)
[![Governance Invariants](https://img.shields.io/badge/governance%20invariants-14%2F14%20verified-success.svg)](contracts/verify-governance.mjs)
[![Consensus: PoPO](https://img.shields.io/badge/consensus-Proof--of--Physical--Orbit-blueviolet.svg)](docs/PHYSICS-INFORMED-CONSENSUS.md)
[![Solidity](https://img.shields.io/badge/solidity-0.8.37-363636.svg)](https://docs.soliditylang.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.8%2B-blue.svg)](https://www.typescriptlang.org/)
[![Network](https://img.shields.io/badge/settlement%20chain-Robinhood%20Chain%20(4663)-6b46c1.svg)](https://starport.nexus)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Website:** [starport.nexus](https://starport.nexus) · **Formal Whitepaper:** [Aerospace Proofs & Theorems](docs/FORMAL-PHYSICAL-PROOF-AND-AEROSPACE-CONSENSUS.md) · **Consensus Whitepaper:** [Proof-of-Physical-Orbit (PoPO)](docs/PHYSICS-INFORMED-CONSENSUS.md) · **Ecosystem Positioning:** [Layer 2.5 Middleware](docs/ECOSYSTEM-POSITIONING-AND-COMPETITIVE-LANDSCAPE.md) · **Protocol Maturity:** [Verification Gates & Roadmap](docs/ROADMAP-AND-PROTOCOL-MATURITY.md) · **ZK-DePIN Circuit:** [ZK-PoPO Specification](docs/ZK-DEPIN-CIRCUIT.md) · **Orbit Earn Spec:** [Task-Budgeted Compute](docs/ORBIT-EARN-SPECIFICATION.md) · **Anti-Phishing Standard:** [Canonical Verification](docs/ANTI-PHISHING-AND-CANONICAL-REGISTRY.md) · **Economic Security:** [Slashing Model](docs/ECONOMIC-SECURITY-AND-SLASHING.md) · **Status:** [Implementation Map](docs/implementation-status.md) · **API Spec:** [OpenAPI 3.1](specs/openapi.json)

Project Token: **SPORT** (Contract implementation complete; on-chain deployment paused under Phase 2 governance hold).

---

## Executive Summary

Starport is the first space-grade DePIN and institutional RWA settlement protocol turning low-Earth-orbit satellite kinematics into immutable on-chain consensus.

Leveraging real-time NORAD Keplerian ephemeris from 10,000+ Starlink satellites, distributed SDR edge receivers, and silicon enclave attestations, Starport establishes Proof-of-Physical-Orbit (PoPO) via relativistic Doppler residuals and zero-knowledge geofence range-proofs (ZK-PoPO).

Settling natively in integer-wei ETH on **Robinhood Chain (Arbitrum Orbit L2, Chain ID 4663)** through bounded Uniswap V4 Universal Router execution, Starport establishes the definitive, non-custodial cryptographic rails for space pioneers (SPCX) as well as tokenized Wall Street equities and index RWAs (NVDA.d, TSLA.d, AAPL.d, SPY.d).

The protocol delivers:
1. **Verifiable DePIN Telemetry**: Ground station admission via binary hardware enclave attestation (Intel SGX DCAP, TPM 2.0, AMD SEV-SNP) and orbital radio frequency (RF) Doppler verification against NORAD Two-Line Element (TLE) satellite ephemeris.
2. **Spatial Multi-Station Consensus**: Anti-spoofing Time Difference of Arrival (TDoA) hyperbolic multilateration with aerospace Geometric Dilution of Precision (GDOP $\le 5.0$) across distributed terrestrial receivers.
3. **ZK-PoPO Geofence Privacy**: Arithmetic SNARK circuits (Halo2 / Groth16) protecting edge node GPS locations while mathematically binding relativistic Doppler residuals.
4. **Demand-Budgeted Orbit Earn**: Verifiable task-budgeted compute market across three service pools (`orbit_forecast`, `catalog_watch`, `orbit_review`) with strict 70/10/≤20 integer budget conservation, 2-phase commit-reveal consensus, dynamic tri-cap saturation ceilings, and 100% non-slashable delegator principal custody.
5. **Dual-Track Real-Yield Settlement (30/30/40 Model)**: Automated PONS 100 bps creator fee collection with deterministic on-chain splitting (30% space backbone operations, 30% terrestrial ground SDR subsidies, and a hardcoded non-sweepable 40% `rewardReserve` for direct Native ETH node incentives), epoch-based Merkle rewards with 72h challenge dispute windows, and bounded Uniswap V4 trade execution on **Robinhood Chain (Chain ID 4663)** governed by a **Decoupled Genesis Ladder (Utility-First, Token-Last)**.

---

## Truth in DePIN: Metric Demarcation & Protocol Boundaries

To ensure complete institutional transparency, Starport explicitly demarcates catalog ephemeris models, physical ground stations, and on-chain execution states:

| Scope | Metric / State | Technical Definition & Verification Reality |
| :--- | :--- | :--- |
| **LEO Orbital Tracking** | **10,493 Tracked Constellation Trajectories** | **Astronomical Reference Models (CelesTrak Catalog)**: Real-time Keplerian ephemeris propagated from public NORAD Two-Line Element (TLE) datasets. These orbital bodies serve as external physical reference anchors for Doppler shift and line-of-sight elevation ($\ge 25^\circ$) verification. They are *astronomical beacons*, not ground-operated blockchain consensus nodes. |
| **Ground Sensor Nodes** | **Phase 2 Pilot & Candidate Receivers** | **Terrestrial Edge Sensor Network**: Terrestrial Starlink terminal operators, HackRF/USRP software-defined radio (SDR) observers, and review workers. Admission strictly requires hardware enclave attestation (Intel SGX DCAP / TPM 2.0 / AMD SEV-SNP quotes) and physical RF Doppler validation satisfying dynamic tolerance bounds ($\sigma_f(\theta) \le 500\text{ Hz}$ at zenith) and spectral SNR path-loss profiles. |
| **Production Verification Suite** | **130 / 130 Tests Pass (1,500 Fuzz Runs)** | **Fully Tested Aerospace & Contract Suites**: 76 TypeScript unit/invariant tests (5-state EKF orbital dynamics, NIST FIPS 204 ML-DSA-65 post-quantum seals, GDOP, ZK-PoPO) and 54 EVM contract tests (`Groth16Verifier.sol`, `OrbitStakeVault.sol`, `OrbitalAntiMevHook.sol`) compiled under Solidity `0.8.37`. On-chain mainnet deployment and SPORT token genesis remain paused under Phase 2 governance hold (`automaticBroadcast=false`). |
| **Settlement Token** | **Native ETH (Chain 4663)** | **Native Accounting**: All creator income, fee accrual, challenge bonds, and reward payouts are denominated strictly in native ETH (calculated in integer wei). SPORT token contract is implemented in source code; zero circulating supply exists on mainnet. |

---

## Three-Tier Architecture & Layer 2.5 Middleware Positioning

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           1. PHYSICAL & RF LAYER                                │
│   Starlink Dishy gRPC / HackRF / USRP SDR ───> 5-State EKF (J2 Oblateness Pert) │
│   Elevation Mask Check (>= 25°)           ───> Doppler Residual Test (|Δf|<=2.5k)│
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ Calibrated RF Telemetry & Innovation Vectors
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    2. CRYPTOGRAPHIC ENCLAVE & CONSENSUS LAYER                   │
│   • 5-State Extended Kalman Filter (EKF) with Real-Time χ² Innovation Rejection │
│   • Post-Quantum Lattice Hybrid Attestation (NIST FIPS 204 ML-DSA-65 + Ed25519) │
│   • Intel SGX DCAP (v3/v4) / TPM 2.0 (TPMS_ATTEST) / AMD SEV-SNP Quote Parser   │
│   • Multi-Station TDoA Spatial Hyperbolic Multilateration Consensus (GDOP <= 5) │
│   • ZK-PoPO SNARK Proofs: Halo2 / Groth16 Privacy Geofence & Doppler Compression│
│   • Orbit Earn Task Consensus: 2-Phase Commit-Reveal + 3 Disjoint Review Quorums│
│   • Deterministic Merkle Reward Epoch Allocation Manifest Generator             │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ Cryptographic Proofs & Root Commitment
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│             3. LAYER 2.5 MIDDLEWARE & ORACLES (Robinhood Chain 4663)            │
│   • OrbitalAntiMevHook     : Uniswap v4 Anti-MEV Hook & Physical Space-Time Lock│
│   • StarportFeeVault       : Parameterized Splitter + Non-Sweepable ETH Yield   │
│   • FundedMerkleRewards    : 72h Dispute Window + Mandatory 1 ETH Bond          │
│   • OrbitStakeVault        : Segregated Non-Slashable Vault + 48h Timelock Exit │
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
| **`OrbitalAntiMevHook.sol`** | Uniswap v4 Anti-MEV Hook & Physical Timestamp Oracle | **LEO Space-Time Transaction Ordering**: Intercepts `beforeSwap` calls on Uniswap v4 pools (e.g., `SPCX/ETH`) and verifies that transactions are anchored to fresh satellite transit epochs with non-replayed beacon entropy. Eliminates cross-datacenter latency arbitrage without centralizing sequencing. |
| **`StarportFeeVault.sol`** | Protocol revenue escrow & treasury management | **Dual Timelock Protection**: Mandatory 48-hour delay (`PAYOUT_TIMELOCK = 172800s`) for operating disbursements. Mandatory 24-hour delay (`EMERGENCY_RECOVERY_TIMELOCK = 86400s`) for sweep operations. Both paths are strictly hardcoded to transfer exclusively to the immutable cold DAO treasury recipient. Zero instant drain vulnerability. |
| **`FundedMerkleRewards.sol`** | Merkle root reward distribution for DePIN nodes | **Bonded Dispute Mechanism**: Mandatory on-chain challenge bond (`challengeBond = 1.0 ETH`) enforced at deployment and in `challengeRoot()`. 72-hour dispute window (`DISPUTE_PERIOD = 259200s`) allows community challenging of fraudulent Merkle trees before payouts can occur. |
| **`OrbitStakeVault.sol`** | Segregated, non-slashable principal custody for Orbit Earn | **Zero-Slashing Principal Guarantee**: Segregated vault accounting with 48-hour unbonding cooldown (`EXIT_DELAY = 172800s`), 6-hour emergency exit window (`EMERGENCY_EXIT_DELAY = 21600s`), and zero slashing penalty on delegated principal. Hardcoded tri-cap saturation ceiling $\min(\mathcal{C}_{\text{demand}}, \mathcal{C}_{\text{throughput}}, \mathcal{C}_{\text{bond}})$ prevents pool saturation and sybil capture. Strictly zero admin transfer keys. |
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

## Physical Layer Anti-Spoofing & Anti-Replay Architecture

To withstand sophisticated adversaries equipped with Software-Defined Radios (SDR) and digital RF memories (DRFM), Starport upgrades physical observation verification beyond static thresholds:

1. **Dynamic Doppler Tolerance Envelope $\sigma_f(\theta)$**:
   Rather than applying a loose static window, Starport enforces an adaptive tolerance envelope keyed to line-of-sight elevation $\theta$:
   $$\sigma_f(\theta) = \sigma_{\text{base}} \cdot (1 + \cos\theta)$$
   At zenith ($\theta = 90^\circ$), where slant range is minimal and tropospheric scintillation is near zero, tolerance tightens strictly to $\sigma_{\text{base}} = 500\text{ Hz}$. At the horizon mask ($\theta = 25^\circ$), tolerance expands smoothly to $\approx 953\text{ Hz}$ to account for tropospheric refraction and atmospheric delay gradient. Arbitrary frequency synthesizers that fail to follow the exact elevation curve are rejected.

2. **Spectral Energy Signature Verification (Path-Loss Dynamics)**:
   A genuine orbital pass experiences deterministic Free Space Path Loss (FSPL) governed by Friis transmission physics:
   $$\text{SNR}(t) = P_{\text{tx}} + G_{\text{tx}} + G_{\text{rx}} - 20\log_{10}\left(\frac{4\pi d(t)}{\lambda}\right) - N_0$$
   Starport validates that the observer's measured SNR profile exhibits a convex bell curve peaking at the Point of Closest Approach (PCA), enforcing a minimum dynamic range of $\ge 4.0\text{ dB}$. Static SDR replays, signal generators with flat SNR profiles, or edge-peaked synthetic traces are rejected immediately (`FLAT_SPECTRAL_PROFILE_REPLAY_DETECTED`).

3. **Downlink Beacon Entropy Witness & Ephemeral Nonces**:
   Observers must record unpredictable pseudorandom frame headers broadcast by the satellite during transit. The observer commits to the downlink beacon digest $H_{\text{beacon}}$ and an ephemeral protocol challenge nonce $N_{\text{chal}}$, ensuring that pre-recorded or replayed captures from previous orbital passes fail verification (`BEACON_DIGEST_MISMATCH`).

4. **Silicon Enclave Hardware Attestation & RF Ring Buffer Binding**:
   Terrestrial receiver nodes execute within attested hardware enclaves (Intel SGX DCAP v3/v4, TPM 2.0 `TPMS_ATTEST`, AMD SEV-SNP). The operator's Ed25519 public key and the capture buffer hash are bound directly into the hardware quote's `reportData`, establishing cryptographic proof that the capture originated from an untampered physical environment.

---

## Production ZK-PoPO: Arithmetic Circom Circuit & On-Chain Verifier

Starport eliminates privacy leakage for residential satellite terminal operators through **ZK-PoPO**, featuring a production-ready Circom 2.1 arithmetic circuit and on-chain EVM Groth16 verifier:

```
                               ┌────────────────────────┐
                               │  Private Witness (w)   │
                               │ • Exact GPS (lat, lon) │
                               │ • Raw Frequencies f(t) │
                               │ • Ephemeris Parameters │
                               └───────────┬────────────┘
                                           │
                                           ▼
┌─────────────────────────┐    ┌────────────────────────┐    ┌────────────────────────┐
│   Public Inputs (x)     │    │  ZK-PoPO Circom 2.1    │    │   EVM Groth16 Verifier │
│ • Bounding Box Geofence ├───>│    (4,120 R1CS Gates)  ├───>│  contracts/src/        │
│ • TLE Ephemeris Hash    │    │ • Geofence Range-Check │    │  Groth16Verifier.sol   │
│ • Doppler RMSE Limit    │    │ • Fixed-Point RMSE     │    │ (Precompile 0x08 Gas:  │
│ • Beacon Entropy Digest │    │ • Keccak Commitment    │    │  ~218,450 gas)         │
└─────────────────────────┘    └────────────────────────┘    └────────────────────────┘
```

- **Circom 2.1 Constraint Circuit**: [`circuits/popo_verifier.circom`](circuits/popo_verifier.circom) implements 4,120 quadratic rank-1 constraints:
  - Constrains private latitude and longitude within the public coarse geographic bounding cell $[LAT_{\text{min}}, LAT_{\text{max}}] \times [LON_{\text{min}}, LON_{\text{max}}]$.
  - Calculates scaled fixed-point Doppler frequency residuals and proves RMSE is strictly bounded within tolerance $\epsilon \le 500\text{ Hz}$.
  - Computes deterministic Poseidon / Keccak commitments binding ephemeris TLE data and downlink beacon entropy.
- **On-Chain EVM Verifier**: [`contracts/src/Groth16Verifier.sol`](contracts/src/Groth16Verifier.sol) verifies 128-byte Groth16 proofs on Robinhood Chain using the Ethereum `ecPairing` precompile (`0x08`), consuming ~218,450 gas. Tested and verified in [`contracts/test/zk-verifier.test.mjs`](contracts/test/zk-verifier.test.mjs).

---

## Open Calibrated RF Telemetry Datasets & Verification Runner

To enable peer reproducibility and empirical auditing, Starport publishes open, high-resolution calibrated RF pass datasets:

1. **Single-Station Calibrated Pass**: [`data/rf-telemetry/starlink-telemetry-pass-01.json`](data/rf-telemetry/starlink-telemetry-pass-01.json) contains 121 time-stamped samples of an authentic pass of satellite STARLINK-30154 (NORAD 58001) over London, UK, featuring Ku-band Doppler shift, receiver drift jitter, and Friis path-loss SNR dynamics ($5.2\text{ dB}$).
2. **Multi-Station Synchronized Consensus Pass**: [`data/rf-telemetry/starlink-multi-station-pass-02.json`](data/rf-telemetry/starlink-multi-station-pass-02.json) records simultaneous observations across London (Node Alpha) and Paris (Node Beta) separated by a $343.8\text{ km}$ spatial baseline:
   - Validates macroscopic PCA transit delay ($45.2\text{ s}$ measured vs $45.27\text{ s}$ theoretical, residual $\Delta T_{\text{PCA}} = 70\text{ ms} \ll 1.0\text{ s}$).
   - Validates instantaneous microsecond baseband TDoA cross-correlation ($\Delta \tau = 0.12\,\mu\text{s} \ll 2.50\,\mu\text{s}$, spatial range accuracy $< 40\text{ m}$).
   - Achieves aerospace Geometric Dilution of Precision ($\text{GDOP} = 2.41$ [EXCELLENT]).

Run the automated dataset verification runner:
```sh
npm run sim:dataset
```

---

## Academic Foundations & Ecosystem Demarcation

Starport bridges aerospace physics and decentralized finance through rigorous academic foundations:

- **Opportunistic LEO Navigation Literature (Prof. Zak Kassas et al.)**:
  The mathematical derivation of Doppler tracking from non-cooperative LEO constellations builds upon foundational research by Prof. Zak Kassas et al. (ASPIN Laboratory, UC Irvine / Ohio State University; *IEEE TAES*, *Proc. IEEE*). While ASPIN inverted Doppler shifts to compute continuous 3D positioning for unconstrained receivers, Starport inverts the paradigm for **DePIN admission**: verifying that an edge node is physically situated within a coarse geographic cell (Uber H3 Res 4, $\sim 11,000\text{ km}^2$) without revealing private residential GPS coordinates on-chain.
- **Patent Landscape (US Patent US12335739B2, 2025)**:
  Prior patent US12335739B2 addresses centralized Doppler location/velocity proofs. Starport contributes: (1) zero-knowledge quantization range-proofs (ZK-PoPO), (2) hardware enclave attestation binding (Intel SGX DCAP / TPM 2.0 / AMD SEV-SNP), (3) multi-station TDoA hyperbolic consensus, and (4) non-custodial EVM settlement on Arbitrum Orbit (Robinhood Chain 4663).
- **Ecosystem Comparison**:
  - *Spacecoin*: Requires proprietary in-orbit satellites ($10M+ launch capex); Starport operates terrestrial listening against 10,000+ public Starlink satellites with zero in-orbit capex.
  - *XYO / FOAM*: Terrestrial beacon-to-beacon ranging without celestial anchors (susceptible to static SDR relays); Starport anchors to $7.58\text{ km/s}$ Keplerian relativistic kinematics.
  - *SkyRelay*: Basic opt-in terminal telemetry parsing; Starport upgrades to attested silicon enclaves, dynamic $\sigma_f(\theta)$ tolerance, Friis FSPL bell curves, Circom Groth16 ZK range proofs, and the demand-bounded Orbit Earn compute market on Robinhood Chain 4663.

---

## DePIN-RWA Synergy: The Dual Institutional Theses

A central question in decentralized physical infrastructure is: *Why do tokenized equity securities (e.g. SPCX, NVDA.d) require low-Earth-orbit satellite anchors?*

Starport addresses two fundamental institutional requirements:

### 1. Orbital Fair-Sequencing (PoPO-Timestamping & Anti-MEV)
High-frequency tokenized stock markets on Layer 2 rollups (such as Robinhood Chain on Arbitrum Orbit) face predatory MEV, sequencer front-running, and NTP timestamp manipulation across geographically dispersed nodes. 

Starport leverages LEO constellation signals—moving at $7.58\text{ km/s}$ with speed-of-light radio downlinks—as an incorruptible physical clock. Trade order batches submitted via EIP-712 intents are anchored to the instantaneous satellite position and relativistic beacon digest. Because the satellite's physical trajectory cannot be accelerated, decelerated, or altered by an on-chain validator, it establishes an unforgeable physical ordering timeline that prevents cross-datacenter front-running.

### 2. ZK Sovereign Compliance & Privacy-Preserving Geofencing
Tokenized equities on Robinhood Chain (such as Jersey-domiciled debt instruments referencing private space firms like SpaceX via SPCX) operate under strict regulatory and cross-border distribution mandates.

Traditional compliance requires intrusive KYC identity databases and persistent geo-tracking of end users. ZK-PoPO solves this dilemma: users prove that their execution originated from an authorized jurisdiction (e.g., non-US, approved regulatory zone) without disclosing their exact GPS coordinates, residential address, or IP network route on-chain. The smart contract verifies the zk-SNARK proof, enforcing sovereign regulatory compliance while guaranteeing absolute personal privacy.

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

## Orbit Earn: Demand-Bounded Task Market & Non-Slashable Staking

Starport rejects naive TVL-inflation staking schemes (which emit unbacked tokens simply for locking assets) in favor of **Orbit Earn**: a demand-budgeted computational task market and non-slashable delegator vault.

### 1. Paradigm Shift: Real Compute Utility vs. Synthetic Inflation

| Protocol Dimension | Generic Staking / Mining Pools | Starport Orbit Earn v1 |
| :--- | :--- | :--- |
| **Emission Source** | Unbacked inflationary minting schedules | Strictly demand-budgeted task fees funded by queries & protocol services |
| **Work Requirement** | Idle capital lockup / arbitrary hash loops | Verified orbital pass predictions, catalog diff checks & independent audits |
| **Consensus & Anti-Sybil** | Centralized operator attestations | 2-Phase Commit-Reveal + 3 disjoint peer control review quorums |
| **Delegator Principal Risk** | Vulnerable to operator slashing / rug-pulls | **100% Non-Slashable Principal Custody** in segregated `OrbitStakeVault.sol` |
| **Saturation Protection** | Monopolistic whale pools dilute network | Dynamic Tri-Cap Saturation: $\min(\mathcal{C}_{\text{demand}}, \mathcal{C}_{\text{throughput}}, \mathcal{C}_{\text{bond}})$ |

### 2. Three Verified Service Pools

The task orchestrator routes computational workloads to three specialized service pools:

1. **Orbit Forecast (`orbit_forecast`)**:
   - **Architecture**: Two-stage spatiotemporal compute pipeline.
   - **Stage 1 (Coarse Regional)**: Uber H3 resolution 4 hexagonal index (~11,000 km² per cell) pre-filters satellite visibility windows against NORAD TLE orbital state vectors.
   - **Stage 2 (Local Topocentric)**: Client-side SGP4 propagator evaluates precise slant range, line-of-sight elevation mask ($\ge 25^\circ$), and Doppler curve $\Delta f(t)$ directly on the edge receiver, eliminating private coordinate disclosure.
2. **Catalog Watch (`catalog_watch`)**:
   - **Architecture**: Compliant 2-hour rate-bounded synchronization with public celestial registries (Space-Track, CelesTrak GP datasets).
   - **Capabilities**: Detects epoch jumps, satellite orbital decays, and NORAD ID cross-tagging anomalies, isolating corrupted ephemeris snapshots before downstream ingestion.
3. **Orbit Review (`orbit_review`)**:
   - **Architecture**: Independent Ed25519 commit-reveal consensus.
   - **Capabilities**: Dispatches 3 disjoint peer control groups to re-compute orbital propagation from identical raw snapshots, detecting numerical drift, adversarial spoofing, and malicious calculation outputs.

### 3. Commit-Reveal Task Lifecycle & Dispute Isolation

```
                   [ 1. Consumer / System Task Dispatched ]
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │            PHASE 1: COMMIT WINDOW               │
             │   H_commit = SHA256(task_id || salt || result)  │
             │   Signed with Worker Ed25519 Operator Key       │
             └────────────────────────┬────────────────────────┘
                                      │ Commit Deadline (e.g. 15m)
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │            PHASE 2: REVEAL WINDOW               │
             │   Submit (salt, cleartext_result)               │
             │   Verified: SHA256(preimage) == H_commit        │
             └────────────────────────┬────────────────────────┘
                                      │ Reveal Deadline (e.g. 15m)
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │       3 INDEPENDENT DISJOINT REVIEW GROUPS      │
             │   Cross-verification of numerical propagation   │
             └────────────────────────┬────────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
                 [ Consensus Match ]      [ Divergence / Dispute ]
                         │                         │
                         ▼                         ▼
             ┌───────────────────────┐ ┌───────────────────────┐
             │  Integer Budget Split │ │   Dispute Quarantine  │
             │  • 70% Worker         │ │  • Payout Frozen      │
             │  • 10% Review Quorum  │ │  • 72h Merkle Dispute │
             │  • ≤20% Delegator Pool│ │  • Operator Bond Held │
             └───────────────────────┘ └───────────────────────┘
```

### 4. Mathematical Budget Conservation (70/10/≤20 Split)

Every task budget $B_{\text{task}}$ deposited in integer wei/SPORT is strictly conserved down to 1 wei:

$$\Delta B_{\text{task}} = \lfloor 0.70 \times B_{\text{task}} \rfloor_{\text{worker}} + \lfloor 0.10 \times B_{\text{task}} \rfloor_{\text{reviewer}} + \Delta R_{\text{delegator}} + \Delta \text{Dust}$$

Where delegator reward allocation is bounded by the pool ceiling:

$$\Delta R_{\text{delegator}} = \min\left( \lfloor 0.20 \times B_{\text{task}} \rfloor, \; \text{Cap}_{\text{pool}} \right)$$

$$\Delta \text{Dust} = B_{\text{task}} - \left( \lfloor 0.70 \times B_{\text{task}} \rfloor + \lfloor 0.10 \times B_{\text{task}} \rfloor + \Delta R_{\text{delegator}} \right) \ge 0$$

Residual dust remains strictly unallocated in protocol reserves. Zero unbacked tokens are created.

### 5. Tri-Cap Dynamic Saturation Ceiling

To prevent monopolistic capital capture and Sybil stake concentration, the maximum delegated capital allowed for any operator node $\mathcal{C}_{\text{node}}$ is bounded by the minimum of three independent constraints:

$$\mathcal{C}_{\text{node}} = \min\left(100 \times \mathcal{B}_{\text{demand}}, \; 100 \times \mathcal{T}_{\text{throughput}}, \; 10 \times \mathcal{B}_{\text{bond}}\right)$$

- **Demand Constraint ($100 \times \mathcal{B}_{\text{demand}}$)**: Prevents idle unbacked staking; capital limits scale strictly with active paid consumer queries.
- **Throughput Constraint ($100 \times \mathcal{T}_{\text{throughput}}$)**: Prevents paper nodes; capital limits require proven historical task completions.
- **Bond Multiplier ($10 \times \mathcal{B}_{\text{bond}}$)**: Prevents zero-skin-in-the-game Sybil operators; an operator cannot accept more than $10\times$ their own bonded capital.

### 6. Segregated, Non-Slashable Vault (`OrbitStakeVault.sol`)

Delegator capital is strictly insulated from software execution faults and governance centralization:
- **Zero Administrative Transfer Privilege**: The contract contains strictly zero admin transfer hooks, zero migration proposals, and zero custody rescue functions. Deposited principal is mathematically non-custodial: it can be withdrawn exclusively by the original depositor upon expiration of the timelock.
- **Zero Slashing on Delegator Principal**: If an operator node experiences software crashes, timeouts, or network partitions, only the operator's own bond is subject to challenge. Delegator principal is 100% non-slashable.
- **48-Hour Timelocked Unbonding**: Standard unbonding adheres to a mandatory 48-hour cooldown (`EXIT_DELAY = 172800s`), preventing just-in-time reward extraction.
- **6-Hour Emergency Exit Window**: In the event of emergency pause declarations, delegators can initiate rapid unbonding within a 6-hour window (`EMERGENCY_EXIT_DELAY = 21600s`).
- **Segregated Vault Isolation**: Delegated positions are accounted for in isolated storage mappings with zero cross-pool rehypothecation or lending risk.

See [docs/ORBIT-EARN-SPECIFICATION.md](docs/ORBIT-EARN-SPECIFICATION.md) for the complete 9-section institutional specification.

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

### 3. Run Full Test Suite (130 / 130 Tests)
```sh
# Run TypeScript package test suite (76 unit tests, including 5-state EKF orbital dynamics, NIST FIPS 204 ML-DSA-65 lattice seals, Orbit Earn budget invariants, tri-cap saturation, dynamic tolerance, spectral signatures, aerospace GDOP, ZK-PoPO & intent isolation)
npm test

# Run Solidity smart contract EVM test suite (54 EVM tests, including Groth16 zk-SNARK verifier, OrbitStakeVault, OrbitalAntiMevHook & 1,500 fuzz runs)
npm run test:contracts

# Run standalone EVM property-based invariant fuzz testing (1,500 iterations)
npm run test:fuzz

# Run end-to-end automated ZK-PoPO verification pipeline with EKF tracking & ML-DSA-65 post-quantum sealing
npm run demo:zk

# Run open calibrated RF telemetry dataset verification with ASCII Doppler curve
npm run sim:dataset
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

- **[Formal Physical Proof & Aerospace Consensus Whitepaper](docs/FORMAL-PHYSICAL-PROOF-AND-AEROSPACE-CONSENSUS.md)**: Formal mathematical derivation of orbital kinematics, $J_2$ Earth gravitational oblateness perturbation, 5-state Extended Kalman Filter (EKF), 3 core mathematical theorems (Spatial Uniqueness down to 150m, Hyperbolic TDoA Unforgeability, and Post-Quantum M-LWE/M-SIS Security Reduction), and zero-knowledge Groth16 on-chain verification.
- **[Ecosystem Positioning & Competitive Landscape](docs/ECOSYSTEM-POSITIONING-AND-COMPETITIVE-LANDSCAPE.md)**: Rigorous comparative analysis against Physical DePIN (Helium, GEODNET), Equity RWAs (Ondo, Dinari, Robinhood Assets), and DEX Layers (Uniswap v4, PONS), establishing Starport as Layer 2.5 Verifiable Physical Middleware.
- **[Roadmap, Verification Gates & Protocol Maturity](docs/ROADMAP-AND-PROTOCOL-MATURITY.md)**: Institutional risk governance framework, 4-phase maturation gateway, and formal defense of the Phase 2 Governance Hold.
- **[Orbit Earn: Task-Budgeted Compute & Verification Market](docs/ORBIT-EARN-SPECIFICATION.md)**: Formal mathematical derivation of demand-bounded task orchestration, 70/10/≤20 integer budget split, 2-phase commit-reveal, dynamic tri-cap saturation, and segregated non-slashable delegator vaults.
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
