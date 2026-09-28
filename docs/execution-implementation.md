# Wallet-called Pay and bounded Trade — implementation v1

These source implementations are not deployed and do not enable the application to submit financial transactions. They refine the historical R4 combined-router design into two smaller, separately addressed non-upgradeable contracts: payment authorization and exchange settlement have different external dependencies and can be reviewed/activated independently.

## Pay

`StarportPaymentRouter` binds one payment asset, one eligibility adapter, a guardian and a nonzero raw payment cap at construction. No role is assigned by the source tree. Its payer must be `msg.sender`; there is no backend relay signature or `tx.origin` authorization. The router calls `transferFrom` directly from payer to payee and checks exact debit/credit. It retains no temporary customer balance and takes no wrapper fee.

Every payment requires a preparation ID, caller-bound payer, recipient, asset, amount, nonce, deadline and accepted terms digest. Deadlines cannot be more than one day ahead. Nonces and preparation IDs are consumed once per payer; failed calls roll back them along with token effects. Owners may invalidate their own nonce bitmap. The guardian may pause new payments, but cannot withdraw user funds, change recipients or replace the immutable bindings.

### Issuer-authorized invoices

The exact EIP-712 domain is `Starport Pay`, version `1`, runtime chain ID and the router address. The `InvoiceTerms` type is:

```text
InvoiceTerms(bytes32 invoiceId,uint64 version,address issuer,address payee,address asset,uint256 amountRaw,address authorizedPayer,uint256 expiresAt,bytes32 termsHash)
```

`contracts/pay/invoice.mjs` builds this typed data and its digest without a wallet or signer. `invoiceIdFor(id)` hashes `StarportInvoice:` followed by a bounded canonical ASCII identifier. Tests compare viem's typed-data digest with Solidity/OpenZeppelin, including cross-router rejection.

The issuer authenticates the request; the payer separately authorizes the payment transaction. An open invoice has zero `authorizedPayer`; a restricted invoice binds one payer. Payee, asset, amount and signed digest must match the payer's request. OpenZeppelin checks EOA or ERC-1271 issuer signatures at settlement time, not merely at offchain issuance. Contract-wallet signature revocation therefore applies to unsettled invoices.

The logical key includes chain, router, issuer and invoice ID. Version one is the default. Only the issuer can advance the current version or cancel its invoice. Cancellation is terminal; settlement is single-use across versions. A direct ERC-20 transfer or `payDirect` call is not an invoice settlement: consumers must match the `InvoiceSettled` event and canonical chain evidence.

The contract checks onchain cancellation/expiry/version, not whether a private application draft was published to a website. The hosted API still needs its own private draft → issuer review → issued-request flow. Real signatures and user payment data do not belong in public examples or logs.

## Trade

`BoundedTradeRouter` binds one directed ERC-20 pair, one typed adapter, one market/eligibility policy, a guardian and a raw input cap. A reverse direction or another venue uses a separately reviewed router/binding. The user cannot supply arbitrary target addresses, router commands, external calldata, approvals, callbacks or delegatecalls.

A wallet request binds its intent ID, action nonce, expected route ID and `TradeExecution`: user, both assets, recipient, exact input, minimum output, deadline, quote ID and market-context hash. The caller must equal the user; an intent and nonce can each execute once. Deadline enforcement is onchain, with a one-day maximum lifetime. Reverts do not consume the intent or nonce and do not authorize an automatic retry.

Settlement pulls the exact input, grants only that amount to the immutable adapter, calls its typed method and clears the allowance. It requires full exact-input consumption, measures actual output, compares the adapter's reported output, enforces minimum output and sends the exact amount to the user's recipient. Partial fills, leftover input, mismatched reports, insufficient output or transfer failure revert the entire transaction. Existing donated balances are preserved, not counted as output. There is no admin rescue, user deposit pool, automatic conversion policy or wrapper fee.

### What an adapter and policy must actually provide

The included adapter/policy fixtures are test doubles, not production integrations. A real adapter must preserve taker/account-dependent fee behavior, quote expiry and lifecycle semantics, and consume/deliver assets through the router's documented boundary. A real policy must validate wallet/asset eligibility, executable quote and market context, including oracle freshness, sequencer status, session/multiplier/pause constraints as applicable. A context hash alone does not prove any of these facts.

Minimum output is an enforceable net outcome bound, not an independently measured venue-fee ceiling. This v1 has no separately enforced maximum-venue-fee field; an adapter requiring that promise needs reviewed fee accounting before activation. PONS graduation transitions and RFQ providers are not automatically handled.

Runtime code hashes detect a change to directly bound code. They do **not** detect every mutable policy dependency, proxy implementation update or upstream venue change. Deployments require review of those dependencies, rather than treating `extcodehash` as a complete immutability proof. Unsupported rebasing, transfer-tax, ERC-7674 temporary-allowance and restricted-token behaviors must be excluded or separately reviewed.

## Evidence and activation

Local Anvil tests use synthetic unlocked accounts and fixture assets/venues. They cover exact settlement, current eligibility refusal, nonce/preparation/intent replay, issuer signature domains, restricted payers, version/cancellation, ERC-1271 revocation, transfer rollback, partial-fill rejection, allowance cleanup and an actual reentrant callback reaching the guard selector. They are not mainnet venue tests or an independent audit.

Before activation: bind actual tokens and behavior; implement/review eligibility and venue dependencies; select roles and raw caps; validate quotes and event/finality reconciliation; review complete deployed bytecode; obtain separate wallet/deployment approval. The source build, public CI and repository publication perform none of those financial actions.

References: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271), [OpenZeppelin cryptography](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography).
