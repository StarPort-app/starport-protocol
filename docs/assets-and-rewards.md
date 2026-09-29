# Asset and reward accounting

## Amounts
All ledger amounts are unsigned integer strings in raw token units, accompanied by chainId, token address and verified decimals. A valuation is a separate timestamped record, never a replacement for quantity. Unknown is null, not zero.

SPCX is the launch quote and incoming creator-fee asset. It is not USDG, ETH, cash or direct ownership in SpaceX. Current multiplier metadata must not be applied twice to a price that is already adjusted.

## Funds separation
Keep user assets, delegated principal, operator bond, protocol income, operating reserve and funded reward allocation distinct. No delegation principal may finance operations or discretionary asset trading by default.

## Fee states
Accrued → Swept → Claimable → Claimed. Partial amounts can occupy different stages. A sweep is a transfer between accounting locations, not a new revenue item. Claimable is not spendable until receipt, beneficiary, chain finality and balances are reconciled.

## Reward epochs
Epoch states: Draft, FundingRequired, Funded, Allocating, Claimable, Closed, Paused. Allocation cannot exceed confirmed unreserved funding in the epoch asset. Creator-fee subsidies and external service income are tracked separately.

SPCX is a candidate direct funding/reward asset, not an automatic reward promise. Distribution of a Stock Token requires an applicable eligibility policy. The default conversion policy is disabled; any later SPCX-to-USDG/ETH policy requires explicit asset, amount, slippage, freshness and authorization limits.

No fixed APY, principal guarantee, implicit right to profits, automatic public fundraising approval or claim that relay delegation is base-chain PoS consensus. Economic participation terms require a separate product/legal decision before public activation.

## PONS constraints
No assumed reserve of freely minted project tokens. No use of the locked graduation LP as an operating or staking reward budget. Native PONS buyback behavior is not assumed to be a burn or user reward source.


## R4 design refinement

The selected project ticker is SPORT (contract pending). Initial earning epochs are **3 days / 259,200 seconds**, not weekly. Concrete admission, contribution, funding and finite-exit defaults are specified in [R4 node policy](node-rewards-policy-r4.md); wallet-called execution, invoice issuance and Merkle rewards are specified in [R4 integration](contract-integration-r4.md). These later design choices refine earlier general requirements; no deployed runtime is implied.
