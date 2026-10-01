# Fee vault permissions — R6 native ETH

Not deployed. The user selected native ETH quote and creator fees for R6; collection uses the native escrow ledger, and ordinary payouts send ETH to the separate fixed payout. Donations are not counted as collected fees. The R5.1 revision added native ETH reception and controller-only emergency ERC-20/native recovery. Confirm this revision before signing a deployment.

## Governance and role separation

To prevent key centralization and eliminate single-point-of-failure vulnerabilities, protocol authority is divided across distinct cryptographic entities:

1. **Deployer EOA (Designated Genesis Account)**:
   - Sole role is executing the initial deployment transaction.
   - Holds zero post-deployment administrative, operational, or withdrawal permissions.
2. **Controller Multi-Sig (3-of-5 Gnosis Safe)**:
   - Multi-sig governance account with quorum threshold.
   - Authorized to manage operating transfers to the payout address, toggle pause states, initiate 2-step controller handover, and propose future PONS recipient updates.
   - Enforces a 48-hour timelock on non-emergency operating disbursements.
3. **Immutable Cold Payout Recipient (Cold Treasury Multi-Sig / DAO Vault)**:
   - Physically isolated cold treasury multi-sig / DAO vault.
   - Hardcoded in contract immutables at construction.
   - **All disbursements—both normal operating payouts and emergency asset recoveries—can exclusively flow into this specific address.** Neither the Deployer nor the Controller can divert funds to any arbitrary recipient.
4. **Keeper Worker (Restricted Automation Account)**:
   - Hot automation account restricted solely to invoking `collectFees()`.
   - Has zero management, withdrawal, transfer, arbitrary-call, or token-approval permissions.

## Accepted assets and accounting

- Native ETH can be received after deployment. Deployment itself is nonpayable: ETH gas stays with the deploying/calling wallet, not a constructor value transfer.
- ERC-20 tokens on the same chain can be transferred to the vault. Merely receiving an asset does not add it to PONS fee accounting. `totalCollected` remains the cumulative verified receipt of the native ETH claimed from the fixed PONS escrow.
- ERC-721/ERC-1155 receiver support is not implemented. Do not send NFTs or assume assets on other chains are recoverable by this contract.
- Rebasing, blacklisted, frozen or unusual tokens may refuse recovery. For emergency ERC-20 recovery, the event amount is the verified vault debit; a transfer-tax token can credit less to the recipient. No exact recipient credit is promised for generic recovery.

## Emergency handling & fund safety invariants

- **No Arbitrary Drains**: The controller enters emergency mode if an upstream protocol compromise occurs. This immediately pauses fee collection, clears any proposed controller candidate, and voids pending future-recipient migrations.
- **Strict Destination Invariant**: In emergency mode, `emergencyRecoverToken` and `emergencyRecoverNative` transfer assets **only to the immutable cold payout recipient**. Even if a controller key were compromised, the attacker cannot siphon funds to an attacker-controlled wallet.
- **Fail-Safe Exit**: Exiting emergency mode leaves collection paused. The controller multi-sig must explicitly unpause collection in a separate, timelocked transaction.

## Upstream PONS authority & migration buffer

The PONS factory owner retains a 3-day notice window before executing an override of the creator fee recipient. Starport's contract incorporates a 2-day migration delay (`RECIPIENT_CHANGE_DELAY = 2 days`) and emergency circuit-breaker pausing. If an unexpected upstream override is initiated, the 24-hour buffer allows the Keeper and Controller to identify the pending migration event, pause collections, and safeguard accrued treasury assets before any upstream change can finalize.
