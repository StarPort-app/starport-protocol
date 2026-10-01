# Starport Protocol: Canonical Registry & Anti-Phishing Standard

## Executive Notice to Community, Exchanges, and Auditors

Due to heightened institutional interest surrounding Starport's Proof-of-Physical-Orbit (PoPO) consensus, Starlink DePIN telemetry, and Robinhood Chain (Arbitrum Orbit L2, Chain ID 4663) integration, malicious actors may attempt to launch counterfeit tokens, fake DEX liquidity pools, or lookalike phishing domains.

This document establishes the **cryptographic canonical provenance standard** for Starport Protocol to protect community members, alpha groups, and node operators from fraud.

---

## 1. Official Canonical Reality

| Dimension | Canonical Fact | Verification Rule |
| :--- | :--- | :--- |
| **Project Token** | **SPORT** | **Strict Governance Hold**: The SPORT smart contract is implemented in source code, but **no on-chain deployment or token genesis has occurred** (`automaticBroadcast=false`). |
| **Live Circulating Supply** | **0 SPORT** | Any token trading on Uniswap, PancakeSwap, Raydium, or DexScreener under the ticker `SPORT` is a **100% fraudulent counterfeit / phishing scam**. |
| **Settlement Chain** | **Robinhood Chain (Chain ID 4663)** | Starport settlements occur natively on Chain ID 4663 (Arbitrum Orbit L2). Any contract claiming to be Starport on BSC, Solana, or Ethereum Mainnet without multi-sig bridge authorization is unauthorized. |
| **Quote Currency** | **Native ETH (wei)** | All creator revenue, fees, and challenge bonds are denominated in native ETH on Chain ID 4663 (accounting strictly in integer wei). No ERC-20 token wrapper is required. |
| **PONS Creator Tax** | **100 bps (1.0%)** | PONS Factory target is permanently bound to 100 bps (`0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`). Earlier 50 bps (0.5%) parameters are superseded. |
| **Treasury Beneficiary** | **0x3000...0003** | Immutable Cold DAO Treasury Safe. All fee sweeps and emergency withdrawals are strictly hardcoded to this address. |

---

## 2. Official Communication & Code Channels

Official protocol resources are restricted strictly to the following canonical URIs:

- **Official Web Terminal**: [https://starport.nexus](https://starport.nexus)
- **Official Open Protocol Core GitHub**: [https://github.com/StarPort-app/starport-protocol](https://github.com/StarPort-app/starport-protocol)
- **Official Documentation**: [https://starport.nexus/docs](https://starport.nexus/docs)
- **Consensus Whitepaper**: [docs/PHYSICS-INFORMED-CONSENSUS.md](PHYSICS-INFORMED-CONSENSUS.md)
- **ZK-DePIN Circuit Specification**: [docs/ZK-DEPIN-CIRCUIT.md](ZK-DEPIN-CIRCUIT.md)

> [!CAUTION]
> Starport core contributors will **NEVER** DM you first, ask for seed phrases, request private keys, or ask you to send funds to "whitelist" or "activate" a ground station node.

---

## 3. Cryptographic Verification Tooling

To eliminate human error, Starport provides an automated, machine-auditable verification engine:

### A. Verify Entire Canonical Manifest Against Compiled EVM Bytecode
```sh
npm run verify:canonical
```
*Statically checks 18 canonical invariants, including EVM compiler hashes (`solc 0.8.37`), settlement chain ID (4663), and 4-way governance decoupling.*

### B. Authenticate Any Query Address (Detect Fake Tokens)
```sh
node contracts/verify-canonical.mjs --check-address <QUERY_ADDRESS>
```
- If the address matches an authorized protocol contract, the tool reports `[MATCH]` with its verified role.
- If the address is an unverified contract or fake DEX token, the tool emits a high-priority alert:
  `🚨 [ALERT: COUNTERFEIT TOKEN / PHISHING SCAM DETECTED] 🚨`

### C. Authenticate Any Web URL (Detect Phishing Drainers)
```sh
node contracts/verify-canonical.mjs --check-url <QUERY_URL>
```
*Validates the URL against the official canonical domain list, preventing community members from connecting wallets to cloned phishing sites.*

---

## 4. Governance & Role Segregation Matrix

All protocol authority is split across 4 mutually exclusive entities. No single entity has unilateral discretionary power:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CANONICAL ROLES ON CHAIN 4663                   │
├──────────────────────────┬─────────────────────────────┬───────────────┤
│ Role Identifier          │ Canonical Address / Target  │ Authority     │
├──────────────────────────┼─────────────────────────────┼───────────────┤
│ Deployer EOA             │ 0x10000000...0001           │ Ephemeral     │
│ Controller Governance    │ 0x20000000...0002           │ 3-of-5 Safe   │
│ Immutable Cold Treasury  │ 0x30000000...0003           │ Sole Receiver │
│ Automated Keeper Worker  │ 0x40000000...0004           │ Read/Collect  │
└──────────────────────────┴─────────────────────────────┴───────────────┘
```

- **48-Hour Operating Delay**: Any disbursement queued by the Controller must wait 172,800 seconds before execution.
- **24-Hour Emergency Sweeper Delay**: Any emergency fund recovery requires 86,400 seconds and is hardcoded to sweep 100% of proceeds exclusively to the Cold DAO Treasury (`0x3000...0003`).

---

## 5. Machine-Readable Canonical Manifest

The canonical registry is published in JSON schema format at [`contracts/canonical-manifest.json`](../contracts/canonical-manifest.json). Third-party explorers (Etherscan, DexScreener, CoinGecko) can ingest this manifest directly to verify official contracts.
