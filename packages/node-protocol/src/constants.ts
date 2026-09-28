/** Versioned operator-message scheme. Not an Ethereum wallet signature. */

export const OPERATOR_MESSAGE_VERSION = "starport-operator-message/v1";
export const OPERATOR_DOMAIN = "starport-operator/v1";
export const PUBLIC_KEY_SCHEME = "ed25519-raw-v1";
export const EXPECTED_CHAIN_ID = 4663;
export const REGISTRATION_SOURCE = "operator_proposal";

export const STATEMENT_SCOPE =
  "Operator Ed25519 statement for one bounded task attempt. The signature covers only this canonical statement. Satellite routing, ASN data, and SGP4 elements are unauthenticated. Chain finality is a separate server observation.";

export const LIMITS = {
  replayWindowMs: 15 * 60 * 1000,
  futureSkewMs: 60 * 1000,
  possessionMaxAgeMs: 10 * 60 * 1000,
  lateHeartbeatMs: 15 * 60 * 1000,
  heartbeatMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  maxTaskTtlMs: 24 * 60 * 60 * 1000,
  minTaskTtlMs: 1000,
  quorumSize: 2,
  maxCanonicalBytes: 16 * 1024,
  maxCanonicalValueChars: 48_000,
  maxClaimChars: 2000,
  maxEvidenceRefs: 20,
  maxUriChars: 2048,
  maxTransactionHashes: 20,
  maxWorkUnits: 100,
  maxAssignmentBytes: 16 * 1024,
  maxList: 100,
  maxReviewNotes: 1000,
  minReviewNotes: 8,
  maxBasisChars: 500,
  minBasisChars: 8,
  maxDetailChars: 500,
  maxIdChars: 128,
  maxPolicyChars: 64,
  minChallengeChars: 16,
  ed25519PublicKeyBytes: 32,
  ed25519SignatureBytes: 64,
  maxTargets: 32,
  maxProbeBytes: 65_536,
  maxProbeTimeoutMs: 5_000,
  maxProbeConcurrency: 2,
} as const;

export const CAPABILITIES = ["starlink_gateway", "rf_observer", "evidence_reviewer"] as const;
export const ENROLLMENT_STATUSES = ["proposed", "reviewing", "approved", "suspended", "retired"] as const;
export const SERVICE_STATES = ["unknown", "available", "degraded", "offline"] as const;
export const INDEPENDENCE_STATES = ["unverified", "reviewed"] as const;
export const TASK_STATUSES = ["offered", "accepted", "expired", "receipt_submitted", "rejected"] as const;
export const NON_FINANCIAL_TASK_KINDS = ["observe_registered_target", "review_evidence"] as const;
export const EVIDENCE_LEVELS = ["self_reported", "independently_observed", "chain_confirmed"] as const;
export const CHAIN_RESULTS = ["unknown", "not_submitted", "included", "confirmed", "finalized", "reverted", "reorged"] as const;
export const SERVER_CHAIN_OBSERVATIONS = ["unknown", "not_submitted", "reverted", "reorged"] as const;

export const SCHEMA_DELTA_STATUS = "proposal-not-applied" as const;
