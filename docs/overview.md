# Protocol overview

The architecture below describes the target product. Implemented public packages are listed separately from planned financial components; implementation does not imply live activation.

## Application-led architecture
The app provides Trade, Earn, Network, Pass, Missions, Pay, Treasury, Signals and Connect. A relay node is an application service provider, not a Robinhood Chain consensus validator.

## Separation of responsibilities
1. A user authorizes a bounded intent in their own wallet.
2. The app coordinates an eligible node and an allowed venue adapter.
3. A node may submit only the authorized payload and reports its task progress.
4. The execution contract independently checks user authorization, amount limits, expiry, nonce and available onchain market conditions.
5. Chain transactions and node-reported path evidence are recorded separately.

Starlink provides a communications path. It does not determine asset prices, sign on behalf of a satellite, supply block ordering rights, or establish legal ownership of underlying equities.

## Public implementation map
| Package | Responsibility | Implementation status |
| --- | --- | --- |
| schemas | Versioned JSON Schema and wire types | Design schemas only |
| `@starport/read-only-client` | Public catalog, orbital, chain and receipt reads | Implemented; no order execution or signing |
| `@starport/node-protocol` | Canonical operator messages and receipt projection | Implemented; signatures do not prove hardware or admission |
| `@starport/node-agent` | Bounded, injected probe runner | Implemented; disabled by default, no production transport |
| `@starport/starlink-operator` | Opt-in local terminal sampling | Implemented adapter; physical capture remains unverified |
| `StarportFeeVault` | Fixed-asset collection and controlled payouts/recovery | Implemented and locally checked; not deployed |
| Future execution/reward contracts | Intent settlement, delegation and funded rewards | Design only |

A public release will be consumed by the private app using an immutable version/commit and integrity record. No floating dependency on a moving main branch.
