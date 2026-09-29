# Node task qualification

`evaluateNodeQualification` is a deterministic policy evaluator for trusted application registry records. Its output is for **nonfinancial task admission** only; `financialEligible` and `hardwareAttested` stay false. It is not an issuer eligibility API, securities-distribution approval or proof of an independent physical node.

A current policy identifies the permitted reviewer actor IDs, version and required quorum (two to five). Distinct wallets mapped to one actor cannot multiply approvals. Grants expire after at most 720 hours; reads never refresh their issuance time. Later reviewer revisions supersede earlier ones, including explicit revocations. Removing a reviewer from the policy stops their approval from counting. A policy mismatch or missing quorum fails closed.

When more than the required number of valid approvals exist, effective expiry is the instant at which fewer than the required quorum would remain, not the first unrelated approval to expire. A suspended or retired enrollment is not eligible even with unexpired approvals. Actor identifiers alone do not establish real-world independence.

## Host integration contract

Use a trusted persistent registry, not records supplied by the requesting node. Renewals/revocations require authenticated reviewer authority, conflict disclosure, expected revision and an append-only audit entry. Check qualification again inside the same transaction as task assignment, acceptance, new receipt admission or public-publication authorization. Retrieving a previously recorded receipt is not new work authorization.

For persistent replay protection, call `verifyReceiptSubmission` inside the host's transaction and enforce a unique `(node_id, task_id, attempt_id)` receipt key and immutable signature-use registry. The public `createReceiptVerifier` remains an in-memory reference guard, not a substitute for database uniqueness or multi-worker coordination. Signed conflicting statements should be retained without creating a second payable receipt. An uncertain commit response calls for reconciliation, not blind resubmission.

Qualification records and operator keys must remain private unless an explicit publication policy permits a narrowly redacted projection. Public source does not ship private database access, reviewer wallets or an operational backend.
