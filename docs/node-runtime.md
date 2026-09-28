# Node protocol and disabled agent runtime

## Package boundary

`@starport/node-protocol` contains statement encoding, verification, wire types and public receipt projection. `@starport/node-agent` contains a disabled-by-default, dependency-injected bounded probe runner. Both packages export compiled JavaScript and declarations; the agent imports the protocol by package name, not a relative sibling source path. The private application owns persistence, authenticated sessions, ACL decisions and publication authorization. These modules do not implement financial execution or a deployed network.

No package generates or persists operator keys. The signer is injected by the operator host and must not expose or log its key material. Unit tests generate fresh ephemeral Ed25519 keys entirely inside the test process. Operator keys are distinct from wallet keys; the runtime never imports wallet credentials.

## Exact canonical scheme

The scheme identifier is `starport-operator-message/v1`, domain `starport-operator/v1`, chain identifier `4663`. This is not EIP-191, EIP-712 or an Ethereum transaction signature.

1. The first UTF-8 line is exactly `starport-operator-message/v1`.
2. Sort field names by JavaScript string order (ASCII field names). A name matches `^[a-z][A-Za-z0-9]{0,40}$`.
3. Emit each field as `name=value` followed by LF, including a final LF after the last field. There is no BOM, CRLF, whitespace normalization or Unicode normalization.
4. Values reject U+0000–001F, U+007F and unpaired UTF-16 surrogates. Valid Unicode is encoded as UTF-8. Values may include `=` because only the first separator is structural.
5. Nonnegative safe integers use their shortest decimal representation. Wallet addresses are exactly `0x` plus 40 lowercase hexadecimal digits. Timestamps accepted by the service are canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ` and round-trip through ISO serialization.
6. Lists use `JSON.stringify` on the ordered string array; their order is signed, not sorted. Optional fields use both an empty value and `Present=0` when absent, otherwise a nonempty value and `Present=1`.
7. The digest is SHA-256 of these exact bytes, represented as `0x` plus 64 lowercase hexadecimal digits. Signatures use Ed25519 over the bytes themselves, not over a hex string or digest. The public-key wire form is `ed25519:0x` plus 64 lowercase hexadecimal digits; signatures are `0x` plus 128 lowercase hexadecimal digits.

Every message includes `purpose`, `scheme`, `domain` and `chainId`:

- **`proof-of-possession`** additionally binds `capability`, `challengeId`, `evidenceReferences`, `operatorAddress`, `policyVersion`, `publicKey`, `sessionId`, `signedAt`.
- **`task-assignment`** additionally binds `attemptId`, `capability`, `evidenceCommitments`, `expiresAt`, `intentId`, `intentIdPresent`, `maximumBytes`, `maximumWorkUnits`, `nodeId`, `registeredTargetId`, `registeredTargetPresent`, `taskId`, `taskKind`. This digest is produced by the application dispatcher; the operator signing helper does not sign assignments.
- **`receipt`** additionally binds `assignmentStatementDigest`, `attemptId`, `evidenceReferences`, `intentId`, `intentIdPresent`, `nodeClaim`, `nodeId`, `observedAt`, `registeredTargetId`, `registeredTargetPresent`, `statementVersion`, `taskId`, `transactionHashes`.

The generic encoder has a 65,536-byte absolute limit. Service proofs/receipts and the operator signing helper enforce the tighter 16,384-byte policy, including each assignment's smaller maximum. `signBoundedOperatorMessage` permits only exact canonical possession/receipt field sets, the fixed domain/chain/version, a possession key matching its signer, and absent financial intent. It refuses duplicate/extra fields and transaction-signing instructions. Its checks do not turn an arbitrary claim into verified evidence.

## Probe boundary

The runtime is disabled unless explicitly enabled by a trusted host. `createHttpsProbeTransport(targets)` is an opt-in concrete transport; callers can still inject other reviewed transports. Targets are fixed registered canonical HTTPS GET URLs; they cannot be selected by arbitrary request URL, body, RPC method or environment destination. Registrations are copied and frozen to prevent later mutation. Local/private and special-purpose IPv4 hosts, literal IPv6, bare hostnames, non-HTTPS URLs, userinfo and fragments are refused.

Caps are finite safe integers: at most 2 concurrent reads, 65,536 response bytes, and 5,000 milliseconds per probe. The concrete transport independently enforces these caps, restricts port 443, resolves fresh IPv4 addresses, rejects a mixed public/private answer, pins the connection to the validated address and preserves the hostname for TLS certificate verification/SNI/Host. It uses no shared global Agent or environment proxy, follows no redirects, rejects compressed bodies and caps headers at 8 KiB. IPv6-only hosts are intentionally unsupported. A registration syntax check alone is not a safe replacement for this transport. Tests inject DNS/socket events to examine each boundary; the optional live example uses real DNS and TLS.

A timeout is returned even if an injected transport ignores cancellation; its concurrency slot stays occupied until that read actually settles. This fails closed rather than permitting unbounded abandoned requests. Rejected, disabled, timeout, oversized, failure and unknown results are preserved as such. No demo success is substituted. Returned diagnostics omit underlying transport exception details, raw bodies and keys.

## Evidence and hardware limits

A valid operator signature proves control of the registered Ed25519 key for one exact statement only. A successful registered GET produces a body digest and a `self_reported` result with `authenticatesRoute=false`. It does not prove Starlink uplink, satellite routing, ASN ownership, SGP4/orbital correctness, SDR capture provenance, regional deployment, independent operators, wallet ownership, admission, eligibility, rewards or chain finality.

Admission and independence remain separate reviewed application states. Public receipts require explicit application publication authorization and expose only the narrow allowlisted projection. Hardware attestation, production authorization, live database verification and operational deployment are not established by these public modules or their tests.

## Independent receipt verification

`verifyReceiptSubmission` consumes an untrusted statement/signature plus a **trusted** assignment and operator registry context. It recomputes the assignment digest, checks exact fields/domain/chain/task/attempt/node/target, canonical times, task budgets, receipt size and Ed25519 signature. This non-financial profile requires a null financial intent and no transaction hashes. Its output remains `self_reported`, `not_submitted` and `authenticatesRoute=false`.

`createReceiptVerifier` adds an atomic single-process consume-once guard keyed by node/task/attempt, a finite capacity and backward-clock refusal. It never evicts a still-valid attempt to accept new traffic. It is not a durable distributed store: a production host must enforce the same unique key in a transaction across all workers and preserve replay history across restarts. The trusted registry context cannot be taken from the submitting operator. No receipt verification result approves hardware or grants rewards by itself.

Transport references: [Node HTTPS](https://nodejs.org/api/https.html), [Node DNS](https://nodejs.org/api/dns.html), and [IANA special-purpose IPv4 registry](https://www.iana.org/assignments/iana-ipv4-special-registry/). The policy conservatively excludes special-purpose ranges rather than enabling their public exceptions.
