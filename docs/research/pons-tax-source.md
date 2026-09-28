# PONS creator-tax source verification

## Answer

**Yes. The verified PONS factory source supports `creatorTaxBps = 50`, which is exactly 0.5%. There is no 100 bps / 1% creator-tax minimum in the reviewed launch path. No actual token launch is needed to establish this source-level rule.**

Scope: Robinhood Chain (chain ID 4663), factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`, with SPCX quote token `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa`.

## Direct deployed-source evidence

The [factory's Blockscout contract-code page](https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract) explicitly reports **source code verified (exact match)**. It identifies `PonsV2LaunchFactory`, compiler `v0.8.35+commit.47b9dedd`, Cancun, optimizer enabled with 200 runs, and verification date August 4, 2026.

The source was inspected directly in its read-only editor on September 26, 2026 UTC. Exact excerpts and line references are preserved in `verified-source-snippets.md`.

- **Factory line 770:** only rejects `params.creatorTaxBps > maxCreatorTaxBps`. It does not require a minimum or a multiple of 100.
- **Factory lines 801–806:** curve base fee plus creator tax, and hook fee plus creator tax, must each stay at or below 2,000 bps. Lines 827 and 858 forward/store the chosen value unchanged.
- **Deployer source line 159:** passes the value unchanged to the curve constructor.
- **Curve source lines 222 and 241:** checks the combined upper cap and stores the exact value. There is no minimum or whole-percent conversion.
- **Hook source lines 352 and 372:** checks the combined upper cap and stores the exact value for the graduated pool.

The downstream files above were opened from the source bundle supplied with the verified factory. They were not inferred from UI fee presets.

## Units and rounding

The denominator is **10,000**, so `50 / 10,000 = 0.005 = 0.5%`.

Curve buy/sell tax and graduated hook tax use integer `amount * creatorTaxBps / 10000`. The **token amount** rounds down to the asset's smallest unit; the **rate is not rounded up to 1%**. At 50 bps, amounts below 200 smallest units produce zero creator-tax units. This rounding does not invalidate the launch parameter.

## Separate creator tax from the base fee

The existing read-only snapshot at block **72,737,872** reports `maxCreatorTaxBps = 1000`, SPCX approved, and config 0 enabled with `curveFeeBps = 100`. Therefore, **50 bps passes the creator-tax ceiling; 100 + 50 = 150 bps** for base-plus-creator curve fees. The 100 bps base fee is **not a creator-tax minimum**.

Do not label 0.5% as the entire trading cost: the base fee is additional, and the verified curve also contains a separate launch-time anti-sniping tax. Price impact and transaction costs are separate again.

## Evidence boundary

This is an affirmative contract-source answer, supported by explorer exact-match verification and an existing public-chain state snapshot. It is not an actual launch receipt, and does not promise every unrelated launch precondition will pass. No wallet was accessed, transaction simulated, token launched, signature requested, approval sent, or transaction broadcast. No independent compiler/runtime reproduction or separate live bytecode comparison of every helper contract was performed.

The official GitHub reference was also pinned to commit `162310fbd1217717e2f5e4cde794d6a11322b469`. That checkout contains mixed-version downstream files (for example, its deployer lacks the factory's salt field), so it is **not** treated as a reproducible deployment bundle. The decisive factory gate and downstream excerpts above come from the explorer's verified-source bundle instead. Source-file hashes and retrieval scope are recorded in `pons-tax-source-manifest.json`.
