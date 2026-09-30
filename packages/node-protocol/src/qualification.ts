import type { HardwareAttestationResult } from './hardware-attestation.js';
import type { RfDopplerVerificationResult } from './rf-doppler.js';

export const NODE_REVIEW_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

export interface NodeQualificationGrant {
  readonly reviewerId: string;
  readonly policyVersion: string;
  readonly revision: number;
  readonly decision: 'approve' | 'revoke';
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface NodeQualification {
  readonly state: 'active' | 'review_required' | 'expired' | 'revoked' | 'policy_mismatch' | 'unconfigured';
  readonly policyVersion: string;
  readonly validApprovals: number;
  readonly requiredApprovals: number;
  readonly expiresAt: string | null;
  readonly taskEligible: boolean;
  readonly financialEligible: false;
  readonly hardwareAttested: boolean;
  readonly rfVerified: boolean;
}

/** Evaluates trusted registry records, silicon attestation proofs, and RF Doppler verification. */
export function evaluateNodeQualification(input: {
  enrollmentStatus: string;
  nodePolicyVersion: string;
  currentPolicyVersion: string;
  currentReviewerIds: readonly string[];
  quorum: number;
  grants: readonly NodeQualificationGrant[];
  now: number;
  hardwareAttestation?: HardwareAttestationResult;
  rfDopplerProof?: RfDopplerVerificationResult;
}): NodeQualification {
  const isHardwareAttested = Boolean(input.hardwareAttestation?.valid && input.hardwareAttestation?.hardwareAttested);
  const isRfVerified = Boolean(input.rfDopplerProof?.valid && input.rfDopplerProof?.verifiedRfPass);

  const base = {
    policyVersion: input.currentPolicyVersion,
    validApprovals: 0,
    requiredApprovals: input.quorum,
    expiresAt: null,
    taskEligible: false,
    financialEligible: false as const,
    hardwareAttested: isHardwareAttested,
    rfVerified: isRfVerified,
  };

  if (!Number.isSafeInteger(input.now) || input.now < 0 || !Number.isInteger(input.quorum) || input.quorum < 2 || input.quorum > 5
    || !input.currentPolicyVersion || !Array.isArray(input.currentReviewerIds) || input.currentReviewerIds.length > 64
    || !Array.isArray(input.grants) || input.grants.length > 128) return {...base, state: 'unconfigured'};
  const reviewers = new Set(input.currentReviewerIds);
  if (reviewers.size < input.quorum) return {...base, state: 'unconfigured'};
  if (input.nodePolicyVersion !== input.currentPolicyVersion) return {...base, state: 'policy_mismatch'};
  if (input.enrollmentStatus !== 'approved') return {...base, state: 'review_required'};
  const latest = new Map<string, NodeQualificationGrant>();
  for (const grant of input.grants) {
    if (!reviewers.has(grant.reviewerId)) continue;
    if (!Number.isSafeInteger(grant.revision) || grant.revision < 0) return {...base, state: 'unconfigured'};
    const previous = latest.get(grant.reviewerId);
    if (previous?.revision === grant.revision) return {...base, state: 'unconfigured'};
    if (!previous || grant.revision > previous.revision) latest.set(grant.reviewerId, grant);
  }
  const expiries: number[] = [];
  let revoked = false, expired = false;
  for (const grant of latest.values()) {
    if (grant.policyVersion !== input.currentPolicyVersion) continue;
    const issued = Date.parse(grant.issuedAt), expires = Date.parse(grant.expiresAt);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > NODE_REVIEW_VALIDITY_MS
      || new Date(issued).toISOString() !== grant.issuedAt || new Date(expires).toISOString() !== grant.expiresAt || issued > input.now) return {...base, state: 'unconfigured'};
    if (grant.decision === 'revoke') { revoked = true; continue; }
    if (grant.decision !== 'approve') return {...base, state: 'unconfigured'};
    if (expires <= input.now) { expired = true; continue; }
    expiries.push(expires);
  }
  expiries.sort((a, b) => b - a);
  const active = expiries.length >= input.quorum;
  return {
    ...base,
    validApprovals: expiries.length,
    taskEligible: active,
    expiresAt: active ? new Date(expiries[input.quorum - 1]).toISOString() : null,
    state: active ? 'active' : revoked ? 'revoked' : expired ? 'expired' : 'review_required',
    hardwareAttested: isHardwareAttested,
    rfVerified: isRfVerified,
  };
}
