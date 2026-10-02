# Deployed native fee and reward contracts — Robinhood Chain (4663)

This archive contains the exact source, ABI and compiler inputs for these two deployments:

| Contract | Address | Creation block |
|---|---|---:|
| StarportFeeVault | `0xf188dAB05F03828A79539DB79c7b121A812a12a9` | 78260296 |
| OrbitRewardDistributor | `0x24eBC6A73af3c791e6cB52F5D25b90f3b9b9AB44` | 78268172 |

SPORT `0x0b9bfb66b2aE41304D0a777B6a4ae0add6ACA214` is deployed on this chain. Its source is not in this archive.

`deployment-manifest.json` records creation transactions, runtime hashes, decoded constructor arguments, exact-source SHA-256 hashes and public Sourcify verification links. Both creation and runtime were reported as exact matches by Sourcify, and the archived sources matched its returned sources byte-for-byte. Source verification is not an independent security audit or an observation of current balances, pause flags or operational services.

## Version boundary

This address-specific deployment archive is separate from `contracts/src/` and the repository's other design or prototype contracts. Contracts with the same name in those directories **must not** be assumed to describe these deployed addresses. In particular, descriptions of timelocked or non-sweepable reserves elsewhere do not apply to this version. No other repository implementation or private application was replaced by this archive.

## Actual permissions and behavior

- Fee revenue is native ETH. Permissionless `collectFees()` claims into the vault, never into its caller. The initial project-managed/reward-reserve allocation is 60%/40%. The controller may change the ratio for subsequent receipts. Project-managed withdrawals have no waiting period; a declared emergency also permits immediate administrator-selected custody transfers, including reward reserves.
- Reward distributor fundingAuthority is this fee vault. Its publisher is `0x2cC7450618B183346e2A47682a6a09ed255580fA`, reviewer `0x751A4959aa0C9F49512e1b747251058a8D08E56c`, and immutable guardian `0xEFfeBD24bf761ffb5f3fbD24cb2ba1E18c69fc33`. The guardian can freeze and immediately rescue the reward balance to a chosen address, retiring this receiver without marking unpaid entitlements paid. Custody discretion is a real trust assumption, not a guarantee of principal or rewards.
- Rewards must be prefunded. A Merkle proof establishes inclusion in the approved allocation, not independent proof that an orbital computation or radio reception occurred. Publisher/reviewer service eligibility and aggregate accuracy remain trusted responsibilities. There is no SPORT minting, fixed APY or automatic wallet airdrop.
- Daily epochs, review delay and claims are governed by this source. The constructor's maximum epoch cap is uint256 maximum: it is a technical ceiling, not an extra finite daily loss cap; funded-lot availability constrains allocation.
- These deployments are not a SPORT deployment, a staking deployment, a live task-worker network or a validated trading integration. SPORT-independent source verification does not activate those functions.

## Reproduce compilation

Each contract subdirectory includes its original `standard-input.json`. Compile separately with `solc 0.8.30+commit.73712a01` using `solc --standard-json < standard-input.json`. Inputs specify Cancun, optimizer enabled with 200 runs and the actual compilation settings. Immutable constructor values must be applied when comparing deployed runtimes; a template runtime hash is not a deployed code hash. Use the encoded/decoded creation arguments in the manifest and the Sourcify records for deployment-specific comparison.

Source license: MIT, as declared in each Solidity file.
