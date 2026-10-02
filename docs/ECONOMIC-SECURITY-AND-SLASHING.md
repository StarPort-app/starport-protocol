# Starport Protocol: Economic Security & Game-Theoretic Slashing Model

## 1. Executive Summary

In Decentralized Physical Infrastructure Networks (DePIN), sensory observations (RF Doppler curves, satellite telemetry, TDoA timestamps) directly trigger on-chain state mutations and reward distributions. 

Purely algorithmic or cryptographic security (e.g., hardware enclaves or ZK proofs) is insufficient on its own if an attacker can profitably corrupt the physical oracle. Starport couples **Proof-of-Physical-Orbit (PoPO)** physics-informed consensus with a **rigorous game-theoretic economic security and slashing model** implemented on **Robinhood Chain (Arbitrum Orbit L2, Chain ID 4663)**.

---

## 2. Adversarial Threat Model & Attack Economics

### 2.1 The DePIN Oracle Dilemma

An adversary $\mathcal{A}$ attempts to forge a synthetic Starlink pass to:
1. Illegitimately claim unearned DePIN epoch reward shares.
2. Trigger non-existent RF telemetry conditions to manipulate tokenized RWA liquidity pools on PONS / Uniswap V4.

### 2.2 Attack Cost Formulation

To successfully forge a multi-station spatial consensus pass without detection, $\mathcal{A}$ must compromise:
1. **$k$ Distinct Hardware Enclaves**: $\mathcal{A}$ must extract Ed25519 signing keys from at least $k \ge 3$ geographically distributed Intel SGX DCAP / TPM 2.0 enclaves without triggering quote invalidation.
2. **Relativistic Kinematics**: $\mathcal{A}$ must synthesize Doppler frequency S-curves satisfying Keplerian mechanics ($|\Delta f| \le 2,500\text{ Hz}$).
3. **Geometric TDoA Multilateration**: $\mathcal{A}$ must coordinate synthetic timestamps across all $k$ stations satisfying hyperbolic baseline arrival times ($\Delta t \le 2.5\text{s}$) with non-degenerate geometry ($\text{GDOP} \le 5.0$).

Let:
- $C_{\text{enclave}}$ be the capital cost required to break an enclave's hardware root of trust ($C_{\text{enclave}} > \$50,000$ based on state-of-the-art silicon fault-injection research).
- $B_i$ be the bonded stake deposited by node $i$ ($B_i \ge 1.0\text{ ETH}$ under `FundedMerkleRewards.sol`).
- $M_{\text{extractable}}$ be the maximum extractable value (MEV) attainable from manipulating PONS bonding curves.

The total capital cost $\mathcal{C}_{\text{attack}}$ required to corrupt the quorum is:
$$\mathcal{C}_{\text{attack}} = \sum_{i=1}^{k} \left( B_i + C_{\text{enclave}, i} \right) \ge 3 \times (1.0\text{ ETH} + \$50,000)$$

Under current PONS 100 bps creator tax parameters and liquidity pool depths on Robinhood Chain, the maximum extractable value satisfies:
$$M_{\text{extractable}} \ll \mathcal{C}_{\text{attack}}$$

Therefore, the expected utility $\mathbb{E}[U_{\mathcal{A}}]$ of attempting an oracle corruption attack is strictly negative:
$$\mathbb{E}[U_{\mathcal{A}}] = \text{Pr}(\text{undetected}) \cdot M_{\text{extractable}} - \mathcal{C}_{\text{attack}} < 0$$

---

## 3. On-Chain Slashing & Dispute Game Specification

The protocol implements a two-phase optimistic Merkle reward distribution architecture in [`FundedMerkleRewards.sol`](../contracts/src/FundedMerkleRewards.sol):

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      72-HOUR BONDED DISPUTE TIMELINE                            │
│                                                                                 │
│   Epoch Finalized                                           Dispute Closes      │
│   Root Committed                                            Payouts Unlocked    │
│         │                                                          │            │
│         ▼                                                          ▼            │
│       ──┼──────────────────────────────┬───────────────────────────┼──> Time    │
│         │                              │                           │            │
│         │                     Challenge Submitted                  │            │
│         │                     (1.0 ETH Bond Posted)                │            │
│         │                              │                           │            │
│         │                              ▼                           │            │
│         │                     EVM Verification                     │            │
│         │                     of Physics Residuals                 │            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Dispute Window & Challenge Bond
- **Dispute Period**: Mandatory 72-hour delay (`DISPUTE_PERIOD = 259200s`) between Merkle root proposal and disbursement execution.
- **Challenge Bond**: Any network participant can dispute a proposed reward distribution by calling `challengeRoot()` and depositing `challengeBond = 1.0 ETH`.

### 3.2 Automated Slasher & Whistleblower Bounty
Upon receipt of a dispute challenge furnishing cryptographic evidence of physical impossibility (e.g., Doppler residual exceeding $2,500\text{ Hz}$, TDoA baseline residual exceeding $2.5\text{s}$, or $\text{GDOP} > 10.0$):
1. **Bond Refund**: The challenger's 1.0 ETH bond is 100% refunded.
2. **Whistleblower Reward**: 50% of the fraudulent epoch allocation is awarded to the challenger as a bounty.
3. **Treasury Sweep**: 50% of the slashed stake is swept to the Immutable Cold DAO Treasury (`0x3000000000000000000000000000000000000003`).
4. **Epoch Freezing**: The fraudulent root is purged, preventing malicious withdrawals.

If a challenge is found frivolous or invalid, the challenger's 1.0 ETH bond is slashed and credited directly to the epoch funder.

---

## 4. Byzantine Fault Tolerance (BFT) Threshold

Starport's spatial multi-station consensus satisfies $(3f + 1)$ Byzantine Fault Tolerance over ground sensor clusters:

$$\mathcal{N} \ge 3f + 1$$

Where:
- $\mathcal{N}$ is the number of active ground receiver stations observing the satellite footprint.
- $f$ is the maximum number of Byzantine (corrupted, offline, or spoofed) stations.

As long as $\ge \frac{2\mathcal{N} + 1}{3}$ of observing stations operate genuine silicon hardware enclaves and report accurate relativistic Doppler measurements, the hyperbolic multilateration solver produces an unforgeable space-time quorum certificate.

---

## 5. Summary of Economic Invariants

| Parameter | Specification | Invariant Guarantee |
| :--- | :--- | :--- |
| **Minimum Node Stake** | **1.0 ETH** | Ensures node operators have meaningful skin in the game. |
| **Challenge Bond** | **1.0 ETH** | Prevents griefing attacks and denial-of-service challenges against honest epochs. |
| **Dispute Window** | **72 Hours (259,200s)** | Provides ample time for decentralized observers and automated watchdog daemons to verify proofs. |
| **Whistleblower Bounty** | **50% of Slashed Funds** | Creates strong economic incentives for independent community surveillance. |
| **Cold Treasury Lock** | **0x3000...0003** | Guarantees protocol penalty sweeps flow exclusively to cold multi-sig custody. |
| **Non-Sweepable Reward Reserve** | **Hardcoded Invariant** | Ensures node rewards cannot be redirected by administrators, guaranteeing rug-pull immunity. |

---

### 5.1 Non-Sweepable Real-Yield Reserve (Rug-Pull Immunity)

In traditional DeFi fee collectors, admin keys often retain discretionary sweep permissions over contract balances, exposing participants to exit scams or arbitrary redirection of community rewards.

Starport enforces **Cryptographic Separation of Protocol Cash Flows**:
1. **Parameterized Fee Splitting**: Inflowing PONS DEX trading fees are deterministically divided between network operations (`operatingBalance`) and verified node incentives (`rewardReserve`).
2. **Immutable Reward Locking**: Once funds enter `rewardReserve`, they are strictly non-sweepable (`sweep()` reverts if directed at reward balances, even during emergency mode). The reserves can only be consumed by authorized downstream distribution contracts (`OrbitRewardDistributor`) upon cryptographic proof of accepted orbital compute work.
3. **Zero-Admin Extraction**: This guarantees that protocol cash flows dedicated to space DePIN physical nodes cannot be expropriated by developers, controllers, or compromised signers.
