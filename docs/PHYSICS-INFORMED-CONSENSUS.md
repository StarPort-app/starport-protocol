# Proof-of-Physical-Orbit (PoPO): Physics-Informed Cryptographic Consensus

**Specification Status:** Formal Protocol Whitepaper  
**Target Chain:** Robinhood Chain (Arbitrum Orbit L2, Chain ID 4663)  
**Security Model:** Physics-Informed Multi-Layer Byzantine Fault Tolerance (PI-BFT)  
**Reference Implementations:** `@starport/protocol-core/rf-doppler.ts`, `@starport/protocol-core/hardware-attestation.ts`, `contracts/src/BoundedTradeRouter.sol`

---

## 1. Executive Summary & Problem Formulation

Traditional decentralized physical infrastructure networks (DePIN) suffer from the **"Oracle of Deceit"** vulnerability: nodes self-report synthetic telemetry or replay captured data to claim protocol rewards and influence state execution without possessing physical hardware or true real-world observation.

Starport introduces **Proof-of-Physical-Orbit (PoPO)**, a physics-informed cryptographic protocol that binds deterministic orbital celestial mechanics, radio frequency (RF) Doppler residuals, silicon-level hardware enclave quotes, and distributed Time Difference of Arrival (TDoA) spatial consensus into an unforgeable cryptographic proof.

### The Tripartite PoPO Security Postulate

An observation statement $\mathcal{S}$ is admitted into protocol consensus if and only if it satisfies three independent, orthogonal cryptographic and physical boundaries:

$$\text{Admit}(\mathcal{S}) \iff \mathcal{P}_{\text{orbital}}(\mathcal{S}) \land \mathcal{P}_{\text{spatial}}(\mathcal{S}) \land \mathcal{P}_{\text{silicon}}(\mathcal{S})$$

1. **Orbital Inversion ($\mathcal{P}_{\text{orbital}}$)**: Observed RF frequency shift curve must match the instantaneous Keplerian state vector $(\vec{r}_{sat}, \vec{v}_{sat})$ propagated from NORAD Two-Line Element (TLE) ephemeris with residual $|\Delta f| \le 2,500\text{ Hz}$.
2. **Spatial Baseline Consensus ($\mathcal{P}_{\text{spatial}}$)**: Observers on distinct geographic baselines must achieve Time Difference of Arrival (TDoA) hyperbolic multilateration agreement within $|\Delta t_{obs} - \Delta t_{theo}| \le 2.5\text{ s}$.
3. **Hardware Enclave Attestation ($\mathcal{P}_{\text{silicon}}$)**: Observation generation and signing must execute within a verified trusted execution environment (Intel SGX DCAP v3/v4, TPM 2.0 `TPMS_ATTEST`, or AMD SEV-SNP) whose cryptographic `reportData` binds the operator's public key $\mathcal{H}(\mathcal{K}_{op})$.

---

## 2. Mathematical Physics Formulation

### 2.1 Keplerian Orbital Dynamics & Coordinate Frames

Satellite state vectors are propagated from mean orbital elements using a high-precision Newton-Raphson Keplerian state solver.

Given mean anomaly $M(t) = M_0 + n(t - t_0)$, the eccentric anomaly $E(t)$ is solved iteratively:

$$E_{k+1} = E_k - \frac{E_k - e \sin E_k - M(t)}{1 - e \cos E_k}$$

The true anomaly $\nu(t)$ and radial distance $r(t)$ in the orbital plane are derived:

$$\cos \nu = \frac{\cos E - e}{1 - e \cos E}, \quad r = a(1 - e \cos E)$$

The orbital coordinates are transformed into the Earth-Centered Inertial (ECI) frame $\vec{r}_{ECI}$ via 3D Euler rotation matrices parameterized by Longitude of Ascending Node ($\Omega$), Orbital Inclination ($i$), and Argument of Perigee ($\omega$):

$$\vec{r}_{ECI} = \mathbf{R}_z(-\Omega) \mathbf{R}_x(-i) \mathbf{R}_z(-\omega) \begin{bmatrix} r \cos \nu \\ r \sin \nu \\ 0 \end{bmatrix}$$

To account for terrestrial ground station positions, $\vec{r}_{ECI}$ is transformed to Earth-Centered Earth-Fixed (ECEF) coordinates $\vec{r}_{ECEF}$ by rotating through the Greenwich Mean Sidereal Time (GMST) angle $\theta_{GMST}(t)$, accounting for Earth's sidereal angular velocity $\omega_{\oplus} \approx 7.2921159 \times 10^{-5}\text{ rad/s}$:

$$\vec{r}_{ECEF}(t) = \mathbf{R}_z(\theta_{GMST}(t)) \vec{r}_{ECI}(t)$$

### 2.2 Relativistic Doppler Frequency Shift Residual

For an observer located at WGS84 coordinates $(\phi_{obs}, \lambda_{obs}, h_{obs})$ with ECEF position $\vec{r}_{obs}$ and velocity $\vec{v}_{obs} = \vec{\omega}_{\oplus} \times \vec{r}_{obs}$, the line-of-sight unit vector $\vec{u}_{los}(t)$ is:

$$\vec{u}_{los}(t) = \frac{\vec{r}_{sat}(t) - \vec{r}_{obs}}{\|\vec{r}_{sat}(t) - \vec{r}_{obs}\|}$$

The theoretical Doppler-shifted carrier frequency $f_{theo}(t)$ for nominal transmission frequency $f_0$ (e.g. Starlink Ku-band downlink $f_0 \approx 11.325\text{ GHz}$) is:

$$f_{theo}(t) = f_0 \left( 1 - \frac{(\vec{v}_{sat}(t) - \vec{v}_{obs}) \cdot \vec{u}_{los}(t)}{c} \right)$$

#### Invariant 1: Elevation Mask & Doppler Residual Bound
A terrestrial observation is physically valid only if the satellite elevation angle $\theta_{elev} \ge 25^\circ$ above the local horizon and the empirical residual satisfies:

$$|\Delta f(t)| = |f_{obs}(t) - f_{theo}(t)| \le 2,500\text{ Hz}$$

---

## 3. Spatial Hyperbolic TDoA Multilateration Consensus

To prevent a single malicious actor from replaying authentic RF telemetry across multiple sybil identities, Starport implements **Multi-Station Hyperbolic TDoA Consensus**.

```
                           🛰️ Satellite Orbit (v_sat ≈ 7.5 km/s)
                             \
                              \
                               \
                                v
                ─────────────────────────────────
               /                                 \
              / (Line of Sight 1)                 \ (Line of Sight 2)
             v                                     v
   📡 Observer Alpha (London)             📡 Observer Beta (Paris)
      Position: r_obs,1                      Position: r_obs,2
      T_pca,1 = t1                           T_pca,2 = t2
      
      Baseline Vector: Δr = r_obs,2 - r_obs,1 (||Δr|| ≈ 343 km)
      Theoretical Time Delta: Δt_theo = (Δr · v_sat) / ||v_sat||²
      Consensus Verification: |(t2 - t1) - Δt_theo| <= 2.5 seconds
```

### 3.1 Geometric Baseline Projection

Let two observer stations be located at $\vec{r}_{obs, 1}$ and $\vec{r}_{obs, 2}$ separated by a spatial baseline vector $\vec{b}_{12} = \vec{r}_{obs, 2} - \vec{r}_{obs, 1}$.

As the satellite traverses its orbit with velocity vector $\vec{v}_{sat}$, the Point of Closest Approach (PCA) occurs when $\frac{d}{dt}\|\vec{r}_{sat}(t) - \vec{r}_{obs}\| = 0$. The theoretical time differential $\Delta t_{theo}$ between the two stations' PCAs is governed by the baseline projection along the orbital track:

$$\Delta t_{theo} = \frac{\vec{b}_{12} \cdot \vec{v}_{sat}}{\|\vec{v}_{sat}\|^2}$$

### 3.2 Anti-Spoofing Security Theorem

> **Theorem 1 (Spatial Consensus Unforgeability):**  
> An adversary controlling $k$ colluding nodes cannot synthesize a valid multi-station observation tuple without possessing physical directional reception antennas located at the reported WGS84 coordinates, unless they solve an underdetermined system of non-linear hyperbolic equations parameterized by unknown ionospheric group delays and orbital velocity $\vec{v}_{sat} \approx 7,500\text{ m/s}$ in real time.

---

## 4. Silicon-Level Hardware Enclave Cryptographic Binding

To guarantee that telemetry originates from authentic physical equipment rather than software emulators, nodes submit binary attestation quotes parsed and verified according to industrial silicon specifications:

### 4.1 Intel SGX DCAP (v3 / v4) Verification
- **Header Parsing**: Enforces `version == 3 || version == 4`, `attKeyType == 2` (ECDSA-256), and authentic Intel vendor GUID `939a7233-f79c-4ca9-940a-0db3957f0607`.
- **Measurement Verification**: Verifies `mrEnclave` and `mrSigner` against authorized Starport node agent build digests.
- **Cryptographic Report Binding**:
  $$\text{reportData}[0..31] = \text{SHA-256}(\mathcal{K}_{op})$$
  Ensures the hardware quote cannot be repurposed for an unauthorized operator key.

### 4.2 TPM 2.0 Platform Attestation (`TPMS_ATTEST`)
- **Magic & Structure**: Validates `magic == 0xFF544347` (`TPM_GENERATED_VALUE`) and `type == 0x8018` (`TPM_ST_ATTEST_QUOTE`).
- **PCR Digest**: Extracts SHA-256 PCR banks measuring platform firmware, bootloader, and Dishy terminal daemon.
- **Binding**: Enforces `extraData == SHA-256(operatorPublicKey)`.

---

## 5. Non-Custodial Decoupling Architecture

Starport enforces an absolute architectural separation between **Evidence Production** and **Asset Settlement**:

```
┌─────────────────────────────────┐
│        DEPIN EVIDENCE           │
│  • Ed25519 Signed Receipts      │
│  • RF Doppler Residual Proofs   │  ─── CANNOT ───>  NO STATE MUTATION
│  • Silicon DCAP Enclave Quotes  │                   NO ASSET TRANSFERS
│  • Multi-Station TDoA Root      │                   NO BLOCK PROPOSING
└─────────────────────────────────┘
                 │
       Deterministic Commit
                 ▼
┌─────────────────────────────────┐
│        ON-CHAIN ESCROW          │
│  • User Signed Intent (EIP-712) │  ─── PERMITS ──>  EXACT-INPUT SETTLEMENT
│  • 72h Merkle Challenge Window  │                   UNISWAP V4 COMMAND 0x10
│  • 48h/24h Dual Timelocks       │                   IMMUTABLE TREASURY
└─────────────────────────────────┘
```

### 5.1 Formal Invariant: Zero-Discretion Intent Execution

In `BoundedTradeRouter.sol`, execution parameters are immutable user-signed intents:

$$\text{TradeTerms} = \{ \text{user}, \text{assetIn}, \text{assetOut}, \text{recipient}, \text{amountIn}, \text{minAmountOut}, \text{deadline}, \text{nonce} \}$$

A relay node functions strictly as an untrusted transport carrier:
- If a relay node alters `recipient`, the transaction reverts with `InvalidTrade()`.
- If a relay node alters `amountIn` or `minAmountOut`, the slippage assertion reverts.
- If an attacker replays a past intent, `_consumeNonce(nonce)` halts execution.

---

## 6. Summary of Protocol Invariants

| Invariant | Physical / Cryptographic Bound | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Orbital Kinematics** | NORAD TLE Newton-Raphson Propagator | `@starport/protocol-core/rf-doppler.ts` |
| **RF Doppler Window** | $|\Delta f| \le 2,500\text{ Hz}$, Elevation $\ge 25^\circ$ | `verifyRfDopplerProof()` |
| **Spatial Multilateration** | TDoA residual $|\Delta t| \le 2.5\text{ s}$ across $\ge 2$ stations | `verifyMultiStationRfConsensus()` |
| **Silicon Integrity** | Intel SGX DCAP / TPM 2.0 Quote Layout | `verifyHardwareAttestation()` |
| **Non-Custodial Decoupling**| Receipts have zero transfer or minting authority | Isolated Merkle Tree & `BoundedTradeRouter.sol` |
| **Timelocked Governance** | 48h Payout Timelock, 24h Emergency Timelock | `StarportFeeVault.sol` |
