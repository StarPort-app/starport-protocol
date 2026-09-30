# Fee vault permissions — R6 native ETH

Not deployed. The user selected native ETH quote and creator fees for R6; collection uses the native escrow ledger, and ordinary payouts send ETH to the same fixed payout. Donations are not counted as collected fees. The earlier R5.1 revision added native ETH reception and controller-only emergency ERC-20/native recovery. The fixed payout address and all management identities remain unchanged. Confirm this revision before signing a deployment.

## Roles

- Deployment / controller / immutable payout: `0xAf3eAA38a445392f1E9d1faE463871998745cb75`.
- Keeper: `0x2cC7450618B183346e2A47682a6a09ed255580fA`. No management, withdrawal, arbitrary-call or token-approval permission.
- Anyone may trigger `collectFees()` while collection is enabled; the fixed fee asset can only be claimed into this vault.

## Accepted assets and accounting

- Native ETH can be received after deployment. Deployment itself is nonpayable: ETH gas stays with the deploying/calling wallet, not a constructor value transfer.
- ERC-20 tokens on the same chain can be transferred to the vault. Merely receiving an asset does not add it to PONS fee accounting. `totalCollected` remains the cumulative verified receipt of the native ETH claimed from the fixed PONS escrow.
- ERC-721/ERC-1155 receiver support is not implemented. Do not send NFTs or assume assets on other chains are recoverable by this contract.
- Rebasing, blacklisted, frozen or unusual tokens may refuse recovery. For emergency ERC-20 recovery, the event amount is the verified vault debit; a transfer-tax token can credit less to the recipient. No exact recipient credit is promised for generic recovery.

## Emergency handling

The controller enters emergency mode immediately. This pauses collection, clears a previously proposed controller and cancels a queued future PONS recipient change. New future-recipient changes and normal operating payouts are blocked during emergency mode. A newly initiated two-step controller handover remains possible so the controller can deliberately rotate authority.

Only the controller may recover ERC-20 assets (including SPCX) or native ETH during emergency mode. Assets go **only to the immutable payout address**. There is no caller-selected payout, arbitrary external call, allowance grant, asset conversion, upgrade or Keeper reimbursement. Recovery has no amount cap beyond the available balance and no timelock: the controller can move the entire recoverable balance to the fixed payout wallet.

Exiting emergency mode leaves collection paused. The controller must explicitly unpause collection in a separate call. Pending changes cancelled on entry are not restored.

## Unchanged powers and limits

- Ordinary native ETH spending remains controller-only, to the immutable payout address, without a spending cap or timelock.
- PONS future fee-recipient migration keeps its two-day delay and controller-only execution. It does not move old escrow credits or already received assets.
- Changing the controller requires acceptance by the proposed controller. The payout address, fee asset, escrow and factory remain immutable.
- Emergency control uses the same controller; it is not a recovery mechanism for a lost or compromised controller key. A payout wallet that cannot receive an asset can still block that asset's recovery.
- PONS compatibility/source binding remains a separate deployment gate. These local permission changes neither sweep restricted PONS fees nor change the 1% launch-tax target.

## Upstream PONS authority

The verified factory source reviewed on September 28, 2026 also grants its protocol owner a future creator-recipient override with a three-day notice and a three-day execution window. A creator's self-service transfer does not cancel that pending override. Starport's two-day migration delay and emergency mode do not restrict PONS's separate authority. Do not represent future fee routing as irrevocable. See [the scoped source review](PONS-SOURCE-REVIEW.md).
