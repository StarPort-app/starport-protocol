# Starport Protocol

Project token: **SPORT** (contract pending deployment).

![Starport concept banner](docs/assets/starport-banner.png)

Starport is a proposed Starlink-connected application network for RWA access, limited transaction tasks, and inspectable service receipts.

## Current status
This repository contains protocol specifications, runnable TypeScript packages and the undeployed StarportFeeVault Solidity implementation. Design-only application features are labeled separately. No deployed Starport contracts, verified live node fleet, independent security audit or guaranteed rewards are represented here.

## Product modules
Network is the default home (`/` leads to `/network`). All nine modules remain available. The proposed launch quote asset is SPCX, revenue is recorded in raw SPCX units, and the creator-tax target is 50 bps (0.5%); these are design requirements, not claims about a live deployment.

| # | Module | Responsibility | App route |
| --- | --- | --- | --- |
| 1 | Trade | Stock Token markets, conditional orders, positions, and execution receipts | /trade |
| 2 | Earn | Node delegation, funded reward epochs, claims, and exits | /earn |
| 3 | Network | Enrollment and service records for Starlink gateways, SDR observers, and evidence reviewers | /network |
| 4 | Pass | Account identity, service quotas, contributions, and delegation history | /pass |
| 5 | Missions | Budgeted relay, observation, review, and product-contribution tasks | /missions |
| 6 | Pay | Payments, invoices, and receipts in USDG or subsequently approved assets | /pay |
| 7 | Treasury | SPCX revenue sweeps, claims, reconciliation, budgeting, and reward funding | /treasury |
| 8 | Signals | Alerts for market data, orders, corporate actions, revenue, and node anomalies | /signals |
| 9 | Connect | An API, SDK, and webhook workspace for external wallet and application integrations | /connect |

![Starport Network design concept](docs/assets/network-concept.png)

The image is an application design preview, not a live network screenshot.

## Open protocol scope
- Amounts, assets, market context and receipt schemas
- Node capabilities, enrollment and service-state contracts
- Public API design and an implemented read-only SDK
- Treasury and reward accounting invariants
- Bounded node-agent and opt-in Starlink capture packages
- Fee-vault source, local tests and reproducible compiler inputs

The consumer application, authentication, indexing, operations and deployment orchestration are maintained separately in starport-app. The public repository is not a fabricated substitute for private runtime code.

## Start reading
- [Protocol overview](docs/overview.md)
- [Node and receipt design](docs/node-and-receipts.md)
- [Assets and rewards](docs/assets-and-rewards.md)
- [PONS / SPCX design evidence](docs/pons-spcx.md)
- [API contract](specs/openapi.json)
- [Contract boundaries](docs/contract-boundaries.md)
- [Repository boundary](docs/repository-boundary.md)

Starport is independent of SpaceX, Starlink, Robinhood and PONS. Factual protocol integration does not imply endorsement. Stock Token access and distribution remain subject to applicable eligibility requirements.


## R4 participation and contract design
- [Node admission, funded rewards and finite exits](docs/node-rewards-policy-r4.md)
- [Trade, payment and reward contract integration](docs/contract-integration-r4.md)

These are proposed policies and interface requirements, not live yield, active custody or deployed contract claims.

## Read-only catalog integration

The companion local application now implements configuration projections and an issuer-sourced Stock Token metadata directory. [Read-only catalog contract](docs/read-only-catalog.md) documents the bounded source, cache and pagination behavior. The remaining business operations are still designs/gated interfaces; this does not establish a live node fleet, tradable route or deployed SPORT contract.


## Build the public packages

Requires Node.js 22.12 or later and the pinned npm toolchain. This repository builds independently; the private application is not required.

```sh
npm ci --ignore-scripts
npm run build
npm run build:contracts
```

The four workspace packages provide canonical operator messages, a bounded probe runner, an opt-in local terminal capture adapter and a read-only public API client. The build does not provision a database, contact terminal hardware, publish packages or deploy contracts. The capture adapter requires a separately installed `grpcurl` and an authorized physical terminal. Financial signing is not provided by these packages.

See `docs/node-runtime.md` for the operator message scheme and runtime boundary. Package build uses the pinned TypeScript workspace; `npm run build` does not publish or deploy.
## R5.1 fee-vault implementation

The planned revenue route is SPORT/SPCX → PONS Fee Escrow → StarportFeeVault. See [R5 design](docs/fee-vault-r5.md), [contract build](contracts/README.md), [permissions](contracts/PERMISSIONS.md) and [PONS source review](contracts/PONS-SOURCE-REVIEW.md). Controller, payout and Keeper addresses are preparation inputs, not deployed authority. The vault is not deployed; live binding and deployment checks remain outstanding. Native ETH reception and emergency ERC-20/native recovery are implemented, with recovery limited to the immutable payout address. The unsigned collection planner cannot sign or broadcast. R4 Trade/Pay/reward designs remain separate, inactive scopes.

## License

MIT. Upstream attribution for adapted telemetry parsing is retained in `packages/starlink-operator/SKYRELAY-MIT.txt`.
