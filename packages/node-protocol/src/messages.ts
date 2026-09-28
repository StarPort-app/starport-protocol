import { OPERATOR_MESSAGE_VERSION } from "./constants.js";
import {
  canonicalAddress,
  canonicalInteger,
  canonicalList,
  digestCanonical,
  encodeCanonical,
  presentFlag,
} from "./canonical.js";

export interface PossessionMessageInput {
  readonly domain: string;
  readonly chainId: number;
  readonly sessionId: string;
  readonly operatorAddress: string;
  readonly capability: string;
  readonly publicKey: string;
  readonly evidenceReferences: readonly string[];
  readonly policyVersion: string;
  readonly challengeId: string;
  readonly signedAt: string;
}

export interface TaskMessageInput {
  readonly domain: string;
  readonly chainId: number;
  readonly taskId: string;
  readonly attemptId: string;
  readonly nodeId: string;
  readonly capability: string;
  readonly taskKind: string;
  readonly intentId: string | null;
  readonly registeredTargetId: string | null;
  readonly evidenceCommitments: readonly string[];
  readonly maximumWorkUnits: number;
  readonly maximumBytes: number;
  readonly expiresAt: string;
}

export interface ReceiptMessageInput {
  readonly domain: string;
  readonly chainId: number;
  readonly taskId: string;
  readonly attemptId: string;
  readonly nodeId: string;
  readonly assignmentStatementDigest: string;
  readonly statementVersion: string;
  readonly nodeClaim: string;
  readonly evidenceReferences: readonly string[];
  readonly transactionHashes: readonly string[];
  readonly observedAt: string;
  readonly intentId: string | null;
  readonly registeredTargetId: string | null;
}

export function possessionMessage(input: PossessionMessageInput): Uint8Array {
  return encodeCanonical({
    capability: input.capability,
    chainId: canonicalInteger(input.chainId),
    challengeId: input.challengeId,
    domain: input.domain,
    evidenceReferences: canonicalList(input.evidenceReferences),
    operatorAddress: canonicalAddress(input.operatorAddress),
    policyVersion: input.policyVersion,
    publicKey: input.publicKey,
    purpose: "proof-of-possession",
    scheme: OPERATOR_MESSAGE_VERSION,
    sessionId: input.sessionId,
    signedAt: input.signedAt,
  });
}

export function taskMessage(input: TaskMessageInput): Uint8Array {
  const intent = presentFlag(input.intentId);
  const target = presentFlag(input.registeredTargetId);
  return encodeCanonical({
    attemptId: input.attemptId,
    capability: input.capability,
    chainId: canonicalInteger(input.chainId),
    domain: input.domain,
    evidenceCommitments: canonicalList(input.evidenceCommitments),
    expiresAt: input.expiresAt,
    intentId: intent.text,
    intentIdPresent: intent.present,
    maximumBytes: canonicalInteger(input.maximumBytes),
    maximumWorkUnits: canonicalInteger(input.maximumWorkUnits),
    nodeId: input.nodeId,
    purpose: "task-assignment",
    registeredTargetId: target.text,
    registeredTargetPresent: target.present,
    scheme: OPERATOR_MESSAGE_VERSION,
    taskId: input.taskId,
    taskKind: input.taskKind,
  });
}

export function receiptMessage(input: ReceiptMessageInput): Uint8Array {
  const intent = presentFlag(input.intentId);
  const target = presentFlag(input.registeredTargetId);
  return encodeCanonical({
    assignmentStatementDigest: input.assignmentStatementDigest,
    attemptId: input.attemptId,
    chainId: canonicalInteger(input.chainId),
    domain: input.domain,
    evidenceReferences: canonicalList(input.evidenceReferences),
    intentId: intent.text,
    intentIdPresent: intent.present,
    nodeClaim: input.nodeClaim,
    nodeId: input.nodeId,
    observedAt: input.observedAt,
    purpose: "receipt",
    registeredTargetId: target.text,
    registeredTargetPresent: target.present,
    scheme: OPERATOR_MESSAGE_VERSION,
    statementVersion: input.statementVersion,
    taskId: input.taskId,
    transactionHashes: canonicalList(input.transactionHashes),
  });
}

export function messageDigest(bytes: Uint8Array): string {
  return digestCanonical(bytes);
}
