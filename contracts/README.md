# Starport SPCX Fee Vault

Collection-only financial foundation. The deployed vault address is **not assigned**. Use the R5 deployment design as a review checklist, not a deployment script.

R5.1 adds native ETH reception and emergency recovery of same-chain ERC-20/native assets to the immutable payout wallet. Keeper rights do not expand. Read [the revised permission matrix](PERMISSIONS.md); the updated deployment artifact is not approved for signing until these permissions are confirmed. No NFT receiver or arbitrary-call interface is provided.

Deployment is explicitly paused. The user confirmed the same public wallet for deployment, control and immutable operating payouts, plus a distinct Keeper address; the exact choices are in `deployment.design.json`. Address configuration is not deployed authority or proof of private-key control. `npm run prepare:fee-vault` builds only a constructor-argument checklist, with no transaction data, nonce, signature or RPC call.

```sh
npm ci --ignore-scripts
npm run build:contracts
npm run test:contracts
```

Run from the Starport Protocol repository. Build artifacts are written to ignored `contracts/out/`. The focused tests start and stop their own localhost Anvil instance, use synthetic unlocked accounts and do not read real private keys or contact a public chain. Anvil must already be installed. No live deployment command or signer is provided.

Compiler: pinned `solc@0.8.37`, EVM Cancun, optimizer 200. Its `tmp` dependency is pinned to `0.2.7` to avoid the advisories reported by the initial install. Registry checksums are retained in the package lock; candidate install scripts are disabled. Compilation is not an audit or a live compatibility claim.

The build also exports `contracts/out/standard-input.json`, containing the exact compiler input for subsequent explorer source verification. Use Solidity standard JSON with contract `src/StarportFeeVault.sol:StarportFeeVault`, the pinned compiler above, and the actual deployment constructor arguments. No explorer submission happens during build. Public GitHub publication is not required to verify a deployed contract in the explorer; either publication still needs authorization. See [the scoped PONS source review](PONS-SOURCE-REVIEW.md) for verified call semantics and remaining live checks.

The vault can claim a single asset from its immutable escrow, account for actual receipts and pay operating funds only to an immutable payout address under controller authorization. Permissionless collection grants no withdrawal right. Two-step control transfer and a delayed, controller-only PONS future-beneficiary change provide explicit management paths. There is no user staking, swap, asset conversion or automatic reward distribution.

`keeper/collection-plan.mjs` is an inert unsigned-call planner, not a daemon or broadcaster. Live activation requires a verified SPORT stack, deployed vault, authorized controller/payout roles and a separately funded ETH keeper. Do not substitute the previously supplied wallet address for the vault address or infer a management role from it.

`keeper/monitor.mjs` adds an observe-only adapter for reviewed runtime code, immutable bindings, PONS launch recipient and quote asset, escrow credits and estimated gas. Its first gate is the deployment pause; a paused invocation makes no network request. It still has no signer or broadcasting method. The companion app worker can persist unsigned preparation metadata only after a separately applied keeper schema and service binding; it does not apply that schema automatically.
