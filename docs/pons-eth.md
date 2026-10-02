# SPORT / native ETH — R6

The launch quote and creator-fee revenue asset are **native ETH on Robinhood Chain 4663**, with a **1% creator-tax target**. SPORT, the fee vault and financial execution remain undeployed/inactive. This change does not launch a token or move any existing asset.

The 1% creator-tax target supersedes the earlier 0.5% choice (September 30, 2026). It is an additional creator surcharge, not the all-in trading fee or the creator’s total revenue including any base-fee share. Buyback selection remains undecided. No existing on-chain tax was changed.

## Representation and accounting

- PONS `pairToken` and fee-vault `feeAsset`: `0x0000000000000000000000000000000000000000`, the native-asset sentinel. It is not an ERC-20 contract.
- Public launch API: `kind: native`, `symbol: ETH`, `address: null`, `decimals: 18`. Null is not treated as an unknown ERC-20 address because the native kind is explicit.
- Revenue amounts are integer **wei**, not SPCX units, WETH balances or USD valuations.
- API wire version is `0.6.1-creator-tax-100`; older strict clients must update rather than interpreting a renamed ERC-20.

The vault calls the fixed escrow's `balanceOf(vault)` and `claim()`. To maintain full compatibility with the official PONS v2 no-output claim ABI, receipt accounting does not require or depend on optional return bytes; instead, it measures the exact native ETH balance delta and confirms consumed escrow credit before recording collection. Direct ETH deposits and ERC-20 transfers do not increment `totalCollected`. Since PONS credits can be permissionless, an escrow claim alone is not proof of SPORT trading revenue: reconcile the underlying fee/credit events separately.

Controller spending queues native ETH only to the immutable payout address with an enforced 48-hour timelock (`PAYOUT_TIMELOCK = 172800s`) before execution; emergency recovery retains a separate 24-hour delay. Keeper execution remains unsigned/observe-only and has no withdrawal right; its gas balance is separate from vault funds. ETH and ERC-20 emergency recovery retain their existing controller/fixed-recipient boundaries. Collection pause, two-step control changes and the future PONS beneficiary delay remain in place.

## Multi-Asset Real-Yield & Settlement Architecture

SPCX remains a flagship Stock Token in the RWA catalog. For Orbit Earn, the protocol establishes a **Dual-Track Real-Yield Architecture**:
1. **SPORT (Staking & Capacity Asset)**: Used for operator bonding, sybil-resistant capacity sizing, and governance under non-slashable delegated principal custody.
2. **Native ETH (Real-Yield Reward Asset)**: PONS 100 bps creator fee proceeds collected natively in ETH are dynamically allocated via the on-chain parameter splitter, injecting genuine, unhypothecated ETH liquidity into node reward distribution contracts.
3. **Zero Conversion Slippage**: Rewards are funded directly in native integer wei without requiring synthetic token wrapping or autonomous DEX market swaps.

### Macroeconomic Tri-Allocation Architecture (30/30/40 Model)

To guarantee long-term physical network sustainability, protocol fees are governed by a formal macroeconomic tri-allocation:
- **30% Space-Network Backbone Operations**: Funds Layer 2 sequencer transaction fees on Robinhood Chain, high-availability decentralized RPC infrastructure, and low-latency NORAD/CelesTrak orbital ephemeris relaying.
- **30% Terrestrial Ground Segment & SDR Edge Subsidies**: Earmarked directly to support physical ground station operators, HackRF/USRP software-defined radio hardware grants, and Starlink Dishy downlink terminal telemetry bandwidth.
- **40% Immutable Real-Yield Task Reward Reserve**: Enforced via on-chain contract invariants as a strictly non-sweepable allocation dedicated exclusively to paying verified Orbit Earn computation workers and physical PoPO consensus nodes.

At the EVM execution layer, this is encoded via a parameterized fee splitter with $\text{operatingBps} = 6000$ (60% encompassing the combined 30% backbone operations and 30% terrestrial ground segment) and $\text{rewardBps} = 4000$ (40% locked irrevocably into the native reward distributor).

The 1% creator surcharge is not the all-in trading fee. PONS base fees, opening protections, price impact and gas remain separate. Native launch economics and fee settings must be read freshly before a launch; the earlier SPCX approval/threshold snapshot is not evidence of ETH launch terms.

## Deployment boundary

R6 changes the fee-vault creation bytecode and its constructor asset sentinel. Regenerate and review deployment artifacts; do not reuse the R5.1 creation-code hash. The chosen controller, fixed payout and Keeper addresses are unchanged, with deployment/signing/broadcast still paused. Source compatibility is not a substitute for checking the deployed PONS stack.

Sources: [PONS native/custom quote behavior](https://docs.ponsfamily.com/v2#custom-pairs), [PONS native fee claiming](https://docs.ponsfamily.com/v2#claiming-fees), [Robinhood Chain native currency](https://docs.robinhood.com/chain/connecting/).
