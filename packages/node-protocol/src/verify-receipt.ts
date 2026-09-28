import { CAPABILITIES, EXPECTED_CHAIN_ID, LIMITS, NON_FINANCIAL_TASK_KINDS, OPERATOR_DOMAIN, OPERATOR_MESSAGE_VERSION } from './constants.js';
import { messageDigest, receiptMessage, taskMessage, type ReceiptMessageInput, type TaskMessageInput } from './messages.js';
import { parseOperatorPublicKey, verifyOperatorSignature } from './keys.js';

/** Supplied by the verifier's trusted assignment/registry store, never by the submitting node. */
export interface ReceiptVerificationContext {
  readonly assignment: TaskMessageInput;
  readonly assignmentIssuedAt: string;
  readonly assignmentStatus: 'accepted';
  readonly operator: { readonly nodeId: string; readonly capability: string; readonly publicKey: string; readonly approved: boolean };
  readonly receivedAtMs: number;
}
export type ReceiptVerification =
  | { readonly accepted: false; readonly code: 'INVALID_CONTEXT' | 'INVALID_STATEMENT' | 'ASSIGNMENT_MISMATCH' | 'OUTSIDE_WINDOW' | 'INVALID_SIGNATURE' | 'ATTEMPT_ALREADY_USED' | 'CAPACITY_REACHED' }
  | { readonly accepted: true; readonly statementDigest: string; readonly evidenceLevel: 'self_reported'; readonly chainResult: 'not_submitted'; readonly authenticatesRoute: false };
const receiptKeys = ['domain', 'chainId', 'taskId', 'attemptId', 'nodeId', 'assignmentStatementDigest', 'statementVersion', 'nodeClaim', 'evidenceReferences', 'transactionHashes', 'observedAt', 'intentId', 'registeredTargetId'];
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x);
const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const exact = (x: Record<string, unknown>, keys: readonly string[]) => Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const refs = (x: unknown): x is string[] => Array.isArray(x) && x.length <= LIMITS.maxEvidenceRefs && x.every(v => typeof v === 'string' && v.length > 0 && v.length <= LIMITS.maxUriChars && !/[\u0000-\u001f\u007f]/.test(v));
function time(x: unknown): number {
  if (typeof x !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)) return NaN;
  const t = Date.parse(x);
  return Number.isFinite(t) && new Date(t).toISOString() === x ? t : NaN;
}
const reject = (code: Extract<ReceiptVerification, {accepted: false}>['code']): ReceiptVerification => ({ accepted: false, code });

/** Checks a signature and its assignment bounds. Does not consume replay state or prove hardware. */
export function verifyReceiptSubmission(submission: unknown, context: ReceiptVerificationContext): ReceiptVerification {
  const a = context?.assignment, operator = context?.operator;
  if (!a || !operator || context.assignmentStatus !== 'accepted' || operator.approved !== true
    || !id(a.taskId) || !id(a.attemptId) || !id(a.nodeId) || a.nodeId !== operator.nodeId
    || a.capability !== operator.capability || !CAPABILITIES.includes(a.capability as typeof CAPABILITIES[number])
    || !NON_FINANCIAL_TASK_KINDS.includes(a.taskKind as typeof NON_FINANCIAL_TASK_KINDS[number])
    || a.domain !== OPERATOR_DOMAIN || a.chainId !== EXPECTED_CHAIN_ID || a.intentId !== null
    || !parseOperatorPublicKey(operator.publicKey) || !Number.isSafeInteger(context.receivedAtMs) || context.receivedAtMs < 0
    || !Number.isSafeInteger(a.maximumWorkUnits) || a.maximumWorkUnits < 1 || a.maximumWorkUnits > LIMITS.maxWorkUnits
    || !Number.isSafeInteger(a.maximumBytes) || a.maximumBytes < 1 || a.maximumBytes > LIMITS.maxAssignmentBytes
    || !refs(a.evidenceCommitments) || !(a.registeredTargetId === null || id(a.registeredTargetId))
    || (a.taskKind === 'observe_registered_target' && a.registeredTargetId === null)) return reject('INVALID_CONTEXT');
  const issued = time(context.assignmentIssuedAt), expires = time(a.expiresAt), now = context.receivedAtMs;
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires - issued < LIMITS.minTaskTtlMs
    || expires - issued > LIMITS.maxTaskTtlMs || issued > now) return reject('INVALID_CONTEXT');
  if (!record(submission) || !exact(submission, ['statement', 'signature']) || typeof submission.signature !== 'string'
    || !record(submission.statement) || !exact(submission.statement, receiptKeys)) return reject('INVALID_STATEMENT');
  const s = submission.statement;
  if (!id(s.taskId) || !id(s.attemptId) || !id(s.nodeId) || typeof s.nodeClaim !== 'string'
    || !s.nodeClaim.length || s.nodeClaim.length > LIMITS.maxClaimChars || !refs(s.evidenceReferences)
    || !Array.isArray(s.transactionHashes) || s.transactionHashes.length !== 0
    || s.intentId !== null || s.statementVersion !== OPERATOR_MESSAGE_VERSION
    || s.domain !== OPERATOR_DOMAIN || s.chainId !== EXPECTED_CHAIN_ID
    || typeof s.assignmentStatementDigest !== 'string' || !/^0x[0-9a-f]{64}$/.test(s.assignmentStatementDigest)) return reject('INVALID_STATEMENT');
  const observed = time(s.observedAt);
  if (!Number.isFinite(observed) || now > expires || observed < issued || observed > expires
    || observed > now + LIMITS.futureSkewMs || now - observed > LIMITS.replayWindowMs) return reject('OUTSIDE_WINDOW');
  try {
    const assignmentBytes = taskMessage(a);
    if (assignmentBytes.byteLength > LIMITS.maxCanonicalBytes) return reject('INVALID_CONTEXT');
    if (s.taskId !== a.taskId || s.attemptId !== a.attemptId || s.nodeId !== a.nodeId
      || s.registeredTargetId !== a.registeredTargetId || s.assignmentStatementDigest !== messageDigest(assignmentBytes)) return reject('ASSIGNMENT_MISMATCH');
    const bytes = receiptMessage(s as unknown as ReceiptMessageInput);
    if (bytes.byteLength > a.maximumBytes) return reject('INVALID_STATEMENT');
    if (!verifyOperatorSignature(operator.publicKey, bytes, submission.signature)) return reject('INVALID_SIGNATURE');
    return { accepted: true, statementDigest: messageDigest(bytes), evidenceLevel: 'self_reported', chainResult: 'not_submitted', authenticatesRoute: false };
  } catch { return reject('INVALID_STATEMENT'); }
}

/** Bounded single-process reference replay guard. Production consumers need an atomic durable unique key. */
export function createReceiptVerifier(maxEntries = 1000) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 100_000) throw new Error('Invalid replay capacity');
  const used = new Map<string, number>();
  let lastReceivedAt = -1;
  return {
    accept(submission: unknown, context: ReceiptVerificationContext): ReceiptVerification {
      const result = verifyReceiptSubmission(submission, context);
      if (!result.accepted) return result;
      if (context.receivedAtMs < lastReceivedAt) return reject('OUTSIDE_WINDOW');
      lastReceivedAt = context.receivedAtMs;
      const a = context.assignment;
      // Expired attempts cannot pass verification again at this receiver time.
      for (const [key, expires] of used) if (expires < context.receivedAtMs) used.delete(key);
      const key = JSON.stringify([a.nodeId, a.taskId, a.attemptId]);
      if (used.has(key)) return reject('ATTEMPT_ALREADY_USED');
      if (used.size >= maxEntries) return reject('CAPACITY_REACHED');
      used.set(key, time(a.expiresAt));
      return result;
    },
  };
}
