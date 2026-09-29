# Earn custody and funded rewards — implementation v1

Source exists; activation is disabled. These contracts are separate from the fee vault and do not inherit its controller or funding automatically. No deployment script, address assignment or frontend activation is included.

Both Earn contracts pin the directly bound eligibility code hash. A change stops new delegation deposits or reward claims; it does not block principal exits or the normal epoch-refund path. This detects direct bytecode changes, not every proxy implementation upgrade or mutation of eligibility rules/data. Those dependencies remain part of the activation review.

## SPORT principal

`SportDelegationVault` accepts a configured exact-transfer token through explicit user allowance. An immutable admission adapter must approve the participant/node pair; the tranche and total-principal caps must be nonzero at construction. Each deposit creates an independent owner-bound tranche.

Normal exit records an effective timestamp and a seven-day unlock. During a controller-recorded incident the owner may shorten this to the earlier of the existing unlock and request time plus two days. Ending the incident never relocks a tranche. Pausing deposits, changing admission results, failed reviews and unavailable application servers do not gate withdrawal. The owner can request normal exit and withdraw through the contract alone.

There is no administrator withdrawal, slashing, investment, rescue of principal, reward funding, fee deduction or upgrade path. The controller controls deposit pause and incident declaration only. Token-level freezes and nonstandard/rebasing/transfer-tax behavior can still prevent transfers; exact balance deltas reject unsupported behavior. Donations are not credited as user principal and no arbitrary rescue function is provided.

This version implements a global incident signal, not an individual-node suspension/checkpoint oracle. Capacity-weighted reward accounting remains offchain work: events expose principal and exit timestamps but the vault does not award rewards or prove useful service.

## Funded reward epochs

`FundedMerkleRewards` uses one immutable reward asset and continuous three-day earning windows. A configured funding authority funds an epoch before it opens, subject to a fixed raw budget cap. A different caller cannot lock the epoch by front-running a tiny unsolicited allocation. Exact asset transfers, per-epoch funding records and `totalReserved` separate funded liabilities from donations and other epochs.

After an earning window ends, the publisher has 48 hours to propose or revise an allocation root and a full-manifest commitment. A distinct reviewer must approve the exact root/manifest; a revision cancels approval and restarts the three-day review delay. Finalization is permissionless after that delay and before the 14-day deadline. Without finalization, anyone can close the epoch after the deadline and return its funding only to its recorded source.

Anyone can emit a challenge evidence commitment. A challenge is an auditable **notice**, not an automatic onchain veto or implemented arbitration process. The reviewer can withhold/revoke approval before finalization. Separate addresses alone do not prove independent people; the review committee is a disclosed trust assumption. Unresolved disputes must not be approved by operational policy.

Claims bind chain ID, distributor, epoch, index, caller, reward asset, raw amount and policy hash using a double-hashed ABI leaf and sorted-pair Merkle proof. Claimed indexes use a bitmap. A live immutable eligibility adapter must approve the caller, and tokens only go to that caller. No substitute recipient or asset conversion is supported. Failed transfers revert the bitmap and accounting updates.

The normal claim window is 90 days. Reviewer pauses total at most seven days per epoch, extend the deadline by actual capped pause duration and automatically cease blocking claims when exhausted. Pauses cannot exceed the 97-day absolute lifecycle. After expiry, closure refunds unclaimed funding and unused budget only to the original funder. The publisher cannot change finalized roots or spend reward reserves.

## Manifest and trust boundaries

`contracts/rewards/manifest.mjs` builds deterministic roots/proofs and a canonical JSON commitment. It checks raw integer amounts, unique indexes and participants, supported chain ID and total allocation against the **supplied** funding amount. It does not read the chain or prove that this funding exists; reviewers must compare with canonical epoch state. Tests cross-check its leaf hash against Solidity.

A Merkle inclusion proof does not prove the sum or fairness of all leaves. Both the builder's full-manifest sum check and independent review are required; the contract additionally enforces `claimed <= allocated <= funded`. The 70/10/10/10 proposal, organic-work filtering, capacity integral, 25% surplus rule and asset eligibility evidence are not inferred from a valid proof. They remain separately reviewed allocator/adapter inputs. The claim adapter is not itself supplied as a permissive production implementation; test fixtures are explicitly not a deployable eligibility service.

## Before activation

Select SPORT and reward-asset addresses and behavior; select funding/publisher/reviewer/controller identities and enforce intended independence; implement and review admission/eligibility adapters; set raw caps and epoch start; review the contracts independently; fund gas and epochs; obtain explicit deployment approval. The existing fee-vault owner/payout choices are not silently reused for these new roles.
