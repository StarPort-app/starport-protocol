import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeOrbitEarnBudgetSplit,
  computeTriCapSaturationCeiling,
  computeTaskCommitment,
  verifyTaskReveal,
  evaluateOrbitReviewQuorum,
} from '../dist/index.js';

test('computeOrbitEarnBudgetSplit: mathematical invariant worker + reviewer + delegator + dust === budget', () => {
  const testBudgets = [
    0n,
    1n,
    2n,
    3n,
    99n,
    100n,
    1000n,
    1_000_000n,
    10_000_000_000_000_000_000n, // 10 ETH in wei
    123_456_789_101_112_131n,
  ];

  for (const budget of testBudgets) {
    const split = computeOrbitEarnBudgetSplit(budget, 2000); // 20% cap
    assert.equal(
      split.workerRewardWei + split.reviewerRewardWei + split.delegatorRewardWei + split.unallocatedDustWei,
      budget,
      `Conservation failed for budget ${budget}`
    );
    // Worker is exactly 70%
    assert.equal(split.workerRewardWei, (budget * 70n) / 100n);
    // Reviewer is exactly 10%
    assert.equal(split.reviewerRewardWei, (budget * 10n) / 100n);
    // Delegator is exactly 20%
    assert.equal(split.delegatorRewardWei, (budget * 20n) / 100n);
    // Dust is non-negative
    assert.ok(split.unallocatedDustWei >= 0n);
  }
});

test('computeOrbitEarnBudgetSplit: respects custom delegator basis point caps', () => {
  const budget = 10_000n;

  // 5% cap (500 bps)
  const split5 = computeOrbitEarnBudgetSplit(budget, 500);
  assert.equal(split5.delegatorRewardWei, 500n); // 5%
  assert.equal(split5.workerRewardWei, 7000n); // 70%
  assert.equal(split5.reviewerRewardWei, 1000n); // 10%
  assert.equal(split5.unallocatedDustWei, 1500n); // remaining 15% is unallocated dust

  // Negative budget throws
  assert.throws(() => computeOrbitEarnBudgetSplit(-100n), /cannot be negative/);
  // Cap > 2000 bps throws
  assert.throws(() => computeOrbitEarnBudgetSplit(100n, 2500), /basis points must be between 0 and 2000/);
});

test('computeTriCapSaturationCeiling: enforces min(100 * demand, 100 * throughput, 10 * bond)', () => {
  // Case A: Demand is the tightest constraint
  const capA = computeTriCapSaturationCeiling(100n, 500n, 500n);
  // 100 * 100 = 10,000; 100 * 500 = 50,000; 10 * 500 = 5,000 => Bond is 5,000
  assert.equal(capA, 5000n);

  // Case B: Throughput is the tightest constraint
  const capB = computeTriCapSaturationCeiling(1000n, 10n, 1000n);
  // 100 * 1000 = 100,000; 100 * 10 = 1,000; 10 * 1000 = 10,000 => Throughput is 1,000
  assert.equal(capB, 1000n);

  // Case C: Zero operator bond forces ZERO capacity (anti-Sybil gate)
  const capZeroBond = computeTriCapSaturationCeiling(1000n, 1000n, 0n);
  assert.equal(capZeroBond, 0n);

  // Case D: Whale delegation cannot exceed saturation ceiling
  const capD = computeTriCapSaturationCeiling(50n, 50n, 100n);
  // 100 * 50 = 5,000; 100 * 50 = 5,000; 10 * 100 = 1,000 => Bond is 1,000
  assert.equal(capD, 1000n);
});

test('computeTaskCommitment & verifyTaskReveal: cryptographic 2-phase commit-reveal', () => {
  const taskId = 'task-pass-20261001-001';
  const salt = '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b';
  const resultHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  const committedHash = computeTaskCommitment(taskId, salt, resultHash);
  assert.ok(committedHash.startsWith('0x'));
  assert.equal(committedHash.length, 66);

  // Authentic reveal succeeds
  assert.equal(verifyTaskReveal(committedHash, taskId, salt, resultHash), true);

  // Tampered salt fails
  assert.equal(
    verifyTaskReveal(committedHash, taskId, '0x0000000000000000000000000000000000000000000000000000000000000000', resultHash),
    false
  );

  // Tampered result hash fails
  assert.equal(
    verifyTaskReveal(committedHash, taskId, salt, '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    false
  );

  // Tampered task ID fails
  assert.equal(verifyTaskReveal(committedHash, 'different-task-id', salt, resultHash), false);
});

test('evaluateOrbitReviewQuorum: enforces minimum 3 disjoint peer reviews', () => {
  const correctResultHash = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const corruptedResultHash = '0xbad00000bad00000bad00000bad00000bad00000bad00000bad00000bad00000';

  // Case 1: 3 distinct concurring reviewers pass quorum
  const reviews1 = [
    { reviewerId: 'station-lon-01', resultHash: correctResultHash },
    { reviewerId: 'station-par-02', resultHash: correctResultHash },
    { reviewerId: 'station-tok-03', resultHash: correctResultHash },
  ];
  const quorum1 = evaluateOrbitReviewQuorum(reviews1, 3);
  assert.equal(quorum1.consensusReached, true);
  assert.equal(quorum1.agreedResultHash, correctResultHash);
  assert.equal(quorum1.participantCount, 3);
  assert.equal(quorum1.concurringCount, 3);

  // Case 2: Sybil attempt - duplicate reviewer ID does not multiply votes
  const sybilReviews = [
    { reviewerId: 'station-lon-01', resultHash: correctResultHash },
    { reviewerId: 'station-lon-01', resultHash: correctResultHash }, // duplicate
    { reviewerId: 'station-par-02', resultHash: correctResultHash },
  ];
  const sybilQuorum = evaluateOrbitReviewQuorum(sybilReviews, 3);
  assert.equal(sybilQuorum.consensusReached, false); // only 2 distinct reviewers
  assert.equal(sybilQuorum.participantCount, 2);

  // Case 3: Divergence / disagreement fails to reach consensus
  const splitReviews = [
    { reviewerId: 'station-lon-01', resultHash: correctResultHash },
    { reviewerId: 'station-par-02', resultHash: correctResultHash },
    { reviewerId: 'station-tok-03', resultHash: corruptedResultHash },
    { reviewerId: 'station-nyc-04', resultHash: corruptedResultHash },
  ];
  const splitQuorum = evaluateOrbitReviewQuorum(splitReviews, 3);
  assert.equal(splitQuorum.consensusReached, false); // neither reached 3
});
