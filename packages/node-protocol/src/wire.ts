import type { CAPABILITIES, CHAIN_RESULTS, ENROLLMENT_STATUSES, EVIDENCE_LEVELS, INDEPENDENCE_STATES, NON_FINANCIAL_TASK_KINDS, SERVICE_STATES, TASK_STATUSES } from "./constants.js";

export type Capability = (typeof CAPABILITIES)[number];
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
export type ServiceState = (typeof SERVICE_STATES)[number];
export type OperatorIndependence = (typeof INDEPENDENCE_STATES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type NonFinancialTaskKind = (typeof NON_FINANCIAL_TASK_KINDS)[number];
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];
export type ChainResult = (typeof CHAIN_RESULTS)[number];

/** OpenAPI Node. Enrollment returns this projection; wallet and operator key stay internal. */
export interface NodeWire {
  readonly id: string;
  readonly operatorId: string;
  readonly capability: Capability;
  readonly enrollmentStatus: EnrollmentStatus;
  readonly serviceState: ServiceState;
  readonly evidenceReferences: readonly string[];
  readonly lastProbeAt: string | null;
  readonly policyVersion: string;
  readonly operatorIndependence: OperatorIndependence;
  readonly registrationSource: string;
  readonly approximateRegion: string | null;
}

/** OpenAPI TaskAssignment. This slice only issues non-financial kinds, so intentId stays null. */
export interface TaskAssignmentWire {
  readonly id: string;
  readonly attemptId: string;
  readonly nodeId: string;
  readonly capability: Capability;
  readonly intentId: null;
  readonly statementDigest: string;
  readonly status: TaskStatus;
  readonly maximumWorkUnits: number;
  readonly maximumBytes: number;
  readonly expiresAt: string;
  readonly revision: number;
  readonly taskKind: NonFinancialTaskKind;
  readonly registeredTargetId: string | null;
  readonly evidenceCommitments: readonly string[];
}

/** OpenAPI Receipt. evidenceLevel and chainResult are server-derived. The operator signature is not returned. */
export interface ReceiptWire {
  readonly id: string;
  readonly intentId: null;
  readonly attemptId: string;
  readonly nodeId: string;
  readonly statementVersion: string;
  readonly statementDigest: string;
  readonly nodeClaim: string;
  readonly evidenceLevel: EvidenceLevel;
  readonly evidenceReferences: readonly string[];
  readonly transactionHashes: readonly string[];
  readonly chainResult: ChainResult;
  readonly taskId: string;
  readonly observedAt: string;
  readonly signatureVerification: "unverified" | "valid" | "invalid";
  readonly statementScope: string;
  readonly confirmationPolicyId: string | null;
}

/** OpenAPI PublicReceipt. */
export interface PublicReceiptWire {
  readonly id: string;
  readonly nodeId: string;
  readonly statementDigest: string;
  readonly statementScope: string;
  readonly evidenceLevel: EvidenceLevel;
  readonly observedAt: string;
  readonly chainResult: ChainResult;
}

export interface VerifiedAuthContext {
  readonly sessionId: string;
  readonly walletAddress: string;
  readonly chainId: number;
}
