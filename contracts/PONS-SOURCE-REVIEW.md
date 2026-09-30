# PONS deployment source review

Review date: September 28, 2026. Scope: the source displayed by Robinhood Chain Blockscout as **verified (exact match)** for the two addresses below. This is a scoped integration review, not a full audit, live transaction simulation or proof of current mutable configuration.

## Escrow

R6 uses the native ledger: the reviewed `balanceOf(recipient)` returns `_balances[recipient]`, and `claim()` calls the debit path for `_balances[msg.sender]`, sends ETH only to `msg.sender`, and returns the claimed amount. The ERC-20 observations below remain accurate but are no longer the Starport fee-vault collection path. Deployed runtime/binding verification remains outstanding.

[PonsV2FeeEscrow](https://robinhoodchain.blockscout.com/address/0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e?tab=contract)

Explorer reports compiler `v0.8.35+commit.47b9dedd`, Cancun, optimizer 200, source path `contracts/src/v2/PonsV2FeeEscrow.sol`, verified August 3, 2026.

- `balanceOfToken(recipient, token)` reads the recipient/token credit mapping.
- `claimToken(token)` claims the caller's full credit. Its internal transfer pays `msg.sender`, not `tx.origin`, and debits that caller's credit before transfer.
- This matches StarportFeeVault's caller model: an external Keeper calls the vault; the vault calls the escrow; escrow funds arrive at the vault.
- The escrow returns a `uint256`; the vault may ignore that return value and independently verifies its balance delta. Return types do not change the function selector.
- Partial `claimToken(token, amount)` also exists upstream. The current vault uses full claims only. A token-imposed transfer limit or freeze could prevent collection; generic asset receipt is not a promise that every token is claimable from escrow.

## Factory

[PonsV2LaunchFactory](https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract)

Explorer reports the same compiler/EVM/optimizer settings, source path `contracts/src/v2/PonsV2LaunchFactory.sol`, verified August 4, 2026. Displayed constructor argument `feeEscrow_` matches the escrow above, and the source stores it immutably.

- `transferCreatorFeeRecipient(token, newRecipient)` requires an existing launch and `msg.sender == launch.creatorFeeRecipient`. Starport must be registered as the recipient before its migration path works.
- The factory propagates recipient changes to the active curve or pool hook and the buyback vault. This is not a transfer of assets already held by Starport or old escrow credits.
- Source checks creator tax against `maxCreatorTaxBps` and combined fee ceilings; no 1% minimum is forced by the contract math. The active target is **100 bps (1%)** in native ETH, selected on September 30, 2026. The 1% target remains conditional on current mutable limits, approved pairing, launch configuration and helper validation at launch time.
- The PONS owner can propose a creator-recipient override with a three-day delay and a three-day execution window. Self-service recipient migration does not cancel it. Starport's local emergency mode cannot stop an upstream override.

## Remaining deployment checks

Keep `deployedStackCompatibilityVerified` false until the complete required binding checks are recorded. This source review alone does not populate runtime code hashes or authorize deployment.

1. Read chain ID, current runtime code hashes and factory/escrow bindings using the approved read-only RPC.
2. Verify the configured SPCX implementation and transfer behavior; re-read mutable pairing/tax settings before SPORT launch.
3. Confirm the final R5.1 permission matrix, wallet network/account, deployment gas estimate and balance before user-controlled signing.
4. After deployment, verify the receipt, deployed code and all immutable/role getters before assigning the vault as a PONS beneficiary.

SPORT launch, automated Keeper signing and repository publication remain separate actions.
