/**
 * @file orbit-earn.ts
 * @notice Pure mathematical and cryptographic verification algorithms for Starport Orbit Earn v1.
 * @dev Enforces demand-budgeted task economics, 70/10/<=20 integer budget conservation,
 *      dynamic tri-cap saturation ceilings, and 2-phase commit-reveal consensus verification.
 */

import { createHash } from 'node:crypto';

export type OrbitEarnServicePool = 'orbit_forecast' | 'catalog_watch' | 'orbit_review';

export interface OrbitEarnBudgetSplit {
  readonly budgetWei: bigint;
  readonly workerRewardWei: bigint;
  readonly reviewerRewardWei: bigint;
  readonly delegatorRewardWei: bigint;
  readonly unallocatedDustWei: bigint;
}

export interface ReviewSubmission {
  readonly reviewerId: string;
  readonly resultHash: string;
}

export interface ReviewQuorumResult {
  readonly consensusReached: boolean;
  readonly agreedResultHash: string | null;
  readonly participantCount: number;
  readonly concurringCount: number;
}

/**
 * Computes exact integer budget decomposition for an accepted task.
 * Mathematical Invariant: worker + reviewer + delegator + dust === budgetWei.
 * Zero unbacked tokens or rounding leakage are created.
 *
 * @param budgetWei Total gross task budget allocated by consumer/protocol in integer wei
 * @param delegatorCeilingBps Maximum basis points allocated to delegator pool (default: 2000 bps = 20%)
 */
export function computeOrbitEarnBudgetSplit(
  budgetWei: bigint,
  delegatorCeilingBps: number = 2000
): OrbitEarnBudgetSplit {
  if (budgetWei < 0n) {
    throw new RangeError('Budget cannot be negative');
  }
  if (delegatorCeilingBps < 0 || delegatorCeilingBps > 2000) {
    throw new RangeError('Delegator ceiling basis points must be between 0 and 2000 (<= 20%)');
  }

  // 1. Worker reward: exactly 70% of task budget
  const workerRewardWei = (budgetWei * 70n) / 100n;

  // 2. Reviewer reward: exactly 10% of task budget
  const reviewerRewardWei = (budgetWei * 10n) / 100n;

  // 3. Delegator pool: up to 20% (bounded by delegatorCeilingBps)
  const delegatorMaxWei = (budgetWei * BigInt(delegatorCeilingBps)) / 10000n;
  const hard20Wei = (budgetWei * 20n) / 100n;
  const delegatorRewardWei = delegatorMaxWei < hard20Wei ? delegatorMaxWei : hard20Wei;

  // 4. Residual dust stays strictly conserved in protocol reserves
  const unallocatedDustWei = budgetWei - (workerRewardWei + reviewerRewardWei + delegatorRewardWei);

  return {
    budgetWei,
    workerRewardWei,
    reviewerRewardWei,
    delegatorRewardWei,
    unallocatedDustWei,
  };
}

/**
 * Computes the dynamic Tri-Cap Saturation Ceiling for an operator node.
 * Formula: C_max = min(100 * DemandBudget, 100 * ProvenThroughput, 10 * OperatorBond)
 *
 * Prevents Sybil attacks (requires non-zero operator bond), whale monopolization,
 * and idle unbacked stake saturation.
 */
export function computeTriCapSaturationCeiling(
  demandBudget: bigint,
  provenThroughput: bigint,
  operatorBond: bigint
): bigint {
  if (demandBudget < 0n || provenThroughput < 0n || operatorBond < 0n) {
    throw new RangeError('Cap components must be non-negative');
  }

  const capDemand = 100n * demandBudget;
  const capThroughput = 100n * provenThroughput;
  const capBond = 10n * operatorBond;

  let ceiling = capDemand;
  if (capThroughput < ceiling) ceiling = capThroughput;
  if (capBond < ceiling) ceiling = capBond;

  return ceiling;
}

/**
 * Computes a deterministic cryptographic task commitment hash for Phase 1 Commit.
 * Binds task ID, unique salt, and computed result hash.
 */
export function computeTaskCommitment(taskId: string, saltHex: string, resultHashHex: string): string {
  if (!taskId || !saltHex || !resultHashHex) {
    throw new Error('All commitment inputs must be non-empty');
  }
  const normalizedSalt = saltHex.toLowerCase().replace(/^0x/, '');
  const normalizedResult = resultHashHex.toLowerCase().replace(/^0x/, '');
  const preimage = `starport:orbit-earn:commit:v1:${taskId}:${normalizedSalt}:${normalizedResult}`;

  const digest = createHash('sha256').update(preimage, 'utf8').digest('hex');
  return `0x${digest}`;
}

/**
 * Verifies that a revealed salt and result hash strictly reproduce the committed hash.
 */
export function verifyTaskReveal(
  committedDigest: string,
  taskId: string,
  saltHex: string,
  resultHashHex: string
): boolean {
  if (!committedDigest || !taskId || !saltHex || !resultHashHex) {
    return false;
  }
  const expected = computeTaskCommitment(taskId, saltHex, resultHashHex);
  return committedDigest.toLowerCase() === expected.toLowerCase();
}

/**
 * Evaluates independent review quorum across disjoint peer verification submissions.
 * Requires at least minQuorum distinct reviewers to submit identical result hashes.
 */
export function evaluateOrbitReviewQuorum(
  reviews: readonly ReviewSubmission[],
  minQuorum: number = 3
): ReviewQuorumResult {
  if (minQuorum < 1) {
    throw new RangeError('minQuorum must be at least 1');
  }

  const seenReviewers = new Set<string>();
  const hashTallies = new Map<string, number>();

  for (const review of reviews) {
    if (!review.reviewerId || !review.resultHash) continue;
    const normalizedId = review.reviewerId.toLowerCase();
    if (seenReviewers.has(normalizedId)) {
      // Disallow duplicate reviews from the same reviewer ID
      continue;
    }
    seenReviewers.add(normalizedId);

    const normalizedHash = review.resultHash.toLowerCase();
    const count = (hashTallies.get(normalizedHash) ?? 0) + 1;
    hashTallies.set(normalizedHash, count);
  }

  let highestCount = 0;
  let winningHash: string | null = null;

  for (const [hash, count] of hashTallies.entries()) {
    if (count > highestCount) {
      highestCount = count;
      winningHash = hash;
    }
  }

  const consensusReached = highestCount >= minQuorum && winningHash !== null;

  return {
    consensusReached,
    agreedResultHash: consensusReached ? winningHash : null,
    participantCount: seenReviewers.size,
    concurringCount: highestCount,
  };
}
