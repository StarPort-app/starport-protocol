# SPORT / native ETH — R6

The launch quote and creator-fee revenue asset are **native ETH on Robinhood Chain 4663**, with a **1% creator-tax target**. SPORT, the fee vault and financial execution remain undeployed/inactive. This change does not launch a token or move any existing asset.

The 1% creator-tax target supersedes the earlier 0.5% choice (September 30, 2026). It is an additional creator surcharge, not the all-in trading fee or the creator’s total revenue including any base-fee share. Buyback selection remains undecided. No existing on-chain tax was changed.

## Representation and accounting

- PONS `pairToken` and fee-vault `feeAsset`: `0x0000000000000000000000000000000000000000`, the native-asset sentinel. It is not an ERC-20 contract.
- Public launch API: `kind: native`, `symbol: ETH`, `address: null`, `decimals: 18`. Null is not treated as an unknown ERC-20 address because the native kind is explicit.
- Revenue amounts are integer **wei**, not SPCX units, WETH balances or USD valuations.
- API wire version is `0.6.1-creator-tax-100`; older strict clients must update rather than interpreting a renamed ERC-20.

The vault calls the fixed escrow's `balanceOf(vault)` and `claim()`. It verifies the returned amount and exact ETH balance increase before recording collection. Direct ETH deposits and ERC-20 transfers do not increment `totalCollected`. Since PONS credits can be permissionless, an escrow claim alone is not proof of SPORT trading revenue: reconcile the underlying fee/credit events separately.

Controller spending sends ETH only to the immutable payout address. Keeper execution remains unsigned/observe-only and has no withdrawal right; its gas balance is separate from vault funds. ETH and ERC-20 emergency recovery retain their existing controller/fixed-recipient boundaries. Collection pause, two-step control changes and the future PONS beneficiary delay remain in place.

## What is unchanged

SPCX remains a Stock Token in the RWA catalog and a separately funded ERC-20 reward candidate. `FundedMerkleRewards` accepts a configured ERC-20, **not native ETH**. ETH fees cannot be counted as funded SPCX rewards. A future reward-asset decision or conversion needs separate implementation/authorization; no automatic swap or wrapping was added. USDG Pay and SPORT principal custody are unchanged.

The 1% creator surcharge is not the all-in trading fee. PONS base fees, opening protections, price impact and gas remain separate. Native launch economics and fee settings must be read freshly before a launch; the earlier SPCX approval/threshold snapshot is not evidence of ETH launch terms.

## Deployment boundary

R6 changes the fee-vault creation bytecode and its constructor asset sentinel. Regenerate and review deployment artifacts; do not reuse the R5.1 creation-code hash. The chosen controller, fixed payout and Keeper addresses are unchanged, with deployment/signing/broadcast still paused. Source compatibility is not a substitute for checking the deployed PONS stack.

Sources: [PONS native/custom quote behavior](https://docs.ponsfamily.com/v2#custom-pairs), [PONS native fee claiming](https://docs.ponsfamily.com/v2#claiming-fees), [Robinhood Chain native currency](https://docs.robinhood.com/chain/connecting/).
