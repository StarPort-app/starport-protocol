> **R6 update:** Launch quote and creator revenue are now native ETH. Earlier SPCX launch references below are historical, not the current configuration. SPCX remains a separately funded ERC-20 reward candidate; automatic conversion and rewards stay off. See [native ETH scope](pons-eth.md).

# PONS / SPCX design evidence

## Confirmed creator-tax rule
**The deployed factory's exact-match verified source supports 0.50% (50 bps). There is no 1% creator-tax minimum.** The 1% read from config 0 is a separate base curve fee, not a minimum for the creator tax. No actual launch is needed to confirm this rule.

The factory checks an upper creator-tax ceiling and combined fee caps. Its bundled deployer forwards the value unchanged; the curve and hook retain basis-point precision and compute amounts with a 10,000 denominator. See [the source review](research/pons-tax-source.md) for the exact source excerpts and provenance.

## Official asset identity
- Symbol: SPCX
- Name: Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token
- Chain: Robinhood Chain, 4663
- Contract: 0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa
- Decimals: 18
- Official asset directory: https://api.robinhood.com/rhj/assets

At the saved API snapshot, currentMultiplier was 1.000000000000000000 and status was ASSET_STATUS_ACTIVE. These are observations, not permanent assumptions or proof of a user's trading eligibility.

## Public-chain snapshot
Read time: 2026-09-26T02:46:10.277358+00:00. Block: 72,737,872.

| Field | Read value |
| --- | --- |
| Factory | 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e |
| SPCX pair approval | true |
| SPCX phantom quote | 28880000000000000000 raw units = 28.88 SPCX |
| SPCX graduation threshold | 72200000000000000000 raw units = 72.2 SPCX |
| Stored quote decimals | 18 |
| Maximum creator tax | 1000 bps |
| Public launch enabled | true |
| Launch config count | 1 |
| Config 0 enabled | true |
| Config 0 base curve fee | 100 bps |
| Config 0 supply | 1000000000000000000000000000 raw project-token units |
| Pool fee field / tick spacing | 0 / 200 |
| Launch fee | 500000000000000 wei = 0.0005 ETH |

Custom SPCX launches use SPCX-specific economics, not the native ETH phantom reserve or threshold.

## Fee presentation
At the saved configuration, the ordinary curve base-plus-creator rate would be 100 + 50 = 150 bps. This excludes any additional opening anti-sniping tax, price impact and transaction costs. It is not all project revenue. SPCX is the fee asset; do not present its quantity as USDG or dollars.

## What was and was not done
The source rule is confirmed from explorer-verified code and reviewed downstream tax handling. No Starport token has been launched; no wallet, nonce, approval, signature, broadcast or creation simulation was used. An independent local compiler/runtime reproduction was not performed. Other launch dependencies and mutable parameters must still be read immediately before a separately authorized launch.

The user-reported frontend 1% minimum was not independently reproduced. It does not override the verified factory rule. Do not silently raise the target to 100 bps or replace the SPCX quote asset.

References:
- https://docs.ponsfamily.com/v2
- https://api.robinhood.com/rhj/assets
- https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract
