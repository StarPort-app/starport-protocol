# ZK-PoPO: Zero-Knowledge Proof-of-Physical-Orbit Circuit Specification

**Specification Status:** Production Reference Specification (Phase 2 Open Protocol)  
**Proving Systems:** Groth16 / Plonk / Halo2 (BN254 / BLS12-381 Scalar Fields)  
**Circuit Target:** Privacy-Preserving Terrestrial RF Satellite Telemetry Verification  
**Reference Implementations:** `@starport/protocol-core/zk-popo.ts`, `specs/zk-popo-circuit.json`

---

## 1. Motivation: The Privacy Dilemma in Satellite DePIN

In physical infrastructure networks (DePIN), verifying that a ground node received a physical radio frequency (RF) transmission typically requires revealing the station's exact geographic coordinates $(\phi, \lambda, h)$ on a public blockchain.

For residential Starlink Dishy owners, maritime vessels, defense assets, or privacy-conscious node operators, **broadcasting precise GPS coordinates creates severe doxxing and physical targeting vulnerabilities**.

**ZK-PoPO (Zero-Knowledge Proof-of-Physical-Orbit)** resolves this dilemma using arithmetic constraint circuits (R1CS):
- **Publicly Discloses:** 
  1. The NORAD TLE ephemeris commitment (Keplerian orbital trajectory).
  2. Coarse geographic region/footprint (e.g. S2 Geometry Cell ID or H3 resolution 4 cell $\approx 11,000\text{ km}^2$).
  3. Relativistic Doppler RMSE tolerance constraint ($\le 2,500\text{ Hz}$).
- **Zero-Knowledge Concealed (Private Witness):**
  1. Exact latitude, longitude, and elevation $(\phi_{obs}, \lambda_{obs}, h_{obs})$.
  2. Raw time-series RF frequency captures $\{f_i, t_i\}_{i=1}^N$.
  3. Hardware silicon identity and Dishy terminal serial numbers.

---

## 2. Mathematical Circuit Formulation

The arithmetic circuit $\mathcal{C}_{\text{PoPO}}$ is defined over the scalar field $\mathbb{F}_r$ (BN254, $r \approx 2.1888 \times 10^{77}$).

### 2.1 Public Inputs Vector $x \in \mathbb{F}_r^m$

$$x = \begin{bmatrix} \mathcal{H}_{\text{TLE}} \\ \text{CellID}_{\text{geo}} \\ f_0 \\ \epsilon_{\text{max}} \\ t_{\text{start}} \\ t_{\text{end}} \end{bmatrix}$$

- $\mathcal{H}_{\text{TLE}} \in \mathbb{F}_r$: Poseidon hash of the NORAD Two-Line Element parameters ($a, e, i, \Omega, \omega, M_0$).
- $\text{CellID}_{\text{geo}} \in \mathbb{F}_r$: Quantized coarse spatial cell (bounding the observer to a country/regional footprint without pin-pointing coordinates).
- $f_0 \in \mathbb{F}_r$: Nominal transmission carrier frequency ($11.325\text{ GHz}$).
- $\epsilon_{\text{max}} \in \mathbb{F}_r$: Maximum allowable Root Mean Square Error squared in Hz$^2$ ($\epsilon_{\text{max}} = 2500^2 = 6,250,000$).
- $[t_{\text{start}}, t_{\text{end}}]$: Time window of the satellite overhead pass.

### 2.2 Private Witness $w \in \mathbb{F}_r^k$

$$w = \begin{bmatrix} \phi_{\text{obs}}, \lambda_{\text{obs}}, h_{\text{obs}} \\ \{t_i, f_{obs, i}\}_{i=1}^N \\ \sigma_{\text{enclave}} \\ \mathcal{K}_{\text{op}} \end{bmatrix}$$

- $\phi_{\text{obs}}, \lambda_{\text{obs}}, h_{\text{obs}}$: Exact private observer WGS84 coordinates in fixed-point representation (Q32.32).
- $\{t_i, f_{obs, i}\}_{i=1}^N$: $N$ discrete frequency and timestamp observation samples.
- $\sigma_{\text{enclave}}$: Signature of the physical trusted execution environment (Intel SGX DCAP / TPM 2.0).
- $\mathcal{K}_{\text{op}}$: Operator Ed25519 signing key.

---

## 3. R1CS Constraint Equations

The circuit enforces four families of quadratic arithmetic constraints:

### Constraint Group A: Geofence Inclusion Proof
Proves that the private observer coordinates fall strictly inside the boundary of $\text{CellID}_{\text{geo}}$ without revealing the interior position:

$$\phi_{\text{min}}(\text{CellID}) \le \phi_{\text{obs}} \le \phi_{\text{max}}(\text{CellID})$$
$$\lambda_{\text{min}}(\text{CellID}) \le \lambda_{\text{obs}} \le \lambda_{\text{max}}(\text{CellID})$$

Enforced in arithmetic gates via standard range-check gadgets:

$$\text{RangeCheck}(\phi_{\text{obs}} - \phi_{\text{min}}, \Delta \phi) = 1$$
$$\text{RangeCheck}(\lambda_{\text{obs}} - \lambda_{\text{min}}, \Delta \lambda) = 1$$

### Constraint Group B: Keplerian State Inversion
For each sample timestamp $t_i$, the circuit computes the satellite state vector $(\vec{r}_{sat, i}, \vec{v}_{sat, i})$ using fixed-point polynomial approximations of the Keplerian true anomaly and coordinate rotation:

$$\vec{r}_{obs} = \text{WGS84\_To\_ECEF}(\phi_{\text{obs}}, \lambda_{\text{obs}}, h_{\text{obs}})$$
$$\vec{u}_{los, i} = \frac{\vec{r}_{sat, i} - \vec{r}_{obs}}{\|\vec{r}_{sat, i} - \vec{r}_{obs}\|}$$

### Constraint Group C: Relativistic Doppler Residual Gate
For each observation index $i \in \{1..N\}$, the circuit computes the theoretical Doppler shift:

$$f_{theo, i} = f_0 \cdot \left( 1 - \frac{(\vec{v}_{sat, i} - \vec{\omega}_{\oplus} \times \vec{r}_{obs}) \cdot \vec{u}_{los, i}}{c} \right)$$

The Doppler deviation $\delta_i$ is constrained:

$$\delta_i = f_{obs, i} - f_{theo, i}$$

The aggregate Root Mean Square Error (RMSE) squared over all $N$ samples must not exceed $\epsilon_{\text{max}}$:

$$\sum_{i=1}^N \delta_i^2 \le N \cdot \epsilon_{\text{max}}$$

### Constraint Group D: Silicon Enclave Binding
Verifies that the private observation samples hash to the payload signed by the hardware enclave:

$$\text{Poseidon}(f_{obs, 1}, f_{obs, 2}, \dots, f_{obs, N}) = \text{EnclaveReportData}[0..31]$$

---

## 4. Verifier Complexity & Gas Bounds

| Proving System | Proof Size | On-Chain Verification Gas (EVM) | Verification Time |
| :--- | :--- | :--- | :--- |
| **Groth16 (BN254)** | **128 bytes** (3 group elements) | **~195,000 gas** (Pairing precompile `0x08`) | **< 4 ms** |
| **Plonk (KZG)** | **576 bytes** | **~280,000 gas** | **< 6 ms** |
| **Halo2 (IPA)** | **~4.5 KB** | Recursive SNARK outer wrapper | **< 12 ms** |

---

## 5. Security & Privacy Guarantees

> **Theorem 2 (Location Zero-Knowledge):**  
> For any two distinct observer coordinates $(\phi_1, \lambda_1)$ and $(\phi_2, \lambda_2)$ within the same geographic cell $\text{CellID}_{\text{geo}}$ observing a valid satellite pass, the resulting SNARK proofs $\pi_1$ and $\pi_2$ are computationally indistinguishable under the Decisional Diffie-Hellman (DDH) assumption on BN254.

**Practical Implication:**  
Node operators can deploy Starlink antennas at private residential, maritime, or sensitive commercial sites without risking geographic location disclosure on Robinhood Chain or Ethereum block explorers.
