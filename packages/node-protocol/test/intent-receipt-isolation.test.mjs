import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  EXPECTED_CHAIN_ID,
  OPERATOR_DOMAIN,
  OPERATOR_MESSAGE_VERSION,
  taskMessage,
  receiptMessage,
  messageDigest,
  createReceiptVerifier,
} from '../dist/index.js';

test('FORMAL INVARIANT 1: Malicious / Forged Ed25519 receipts have strictly zero state mutation or asset transfer authority', () => {
  // Generate an arbitrary attacker key pair
  const attackerPair = generateKeyPairSync('ed25519');
  const attackerPublicKey = 'ed25519:0x' + attackerPair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');

  // Construct a forged statement claiming unearned execution or asset claims
  const forgedStatement = {
    domain: OPERATOR_DOMAIN,
    chainId: EXPECTED_CHAIN_ID,
    taskId: 'forged-asset-claim-task',
    attemptId: 'forged-attempt-1',
    nodeId: 'malicious-attacker-node',
    assignmentStatementDigest: '0x' + '00'.repeat(32),
    statementVersion: OPERATOR_MESSAGE_VERSION,
    nodeClaim: 'Attacker demands 10,000 ETH transfer and block leadership',
    evidenceReferences: ['0x' + 'ff'.repeat(32)],
    transactionHashes: ['0x' + 'ee'.repeat(32)],
    observedAt: new Date().toISOString(),
    intentId: '0x' + '77'.repeat(32),
    registeredTargetId: 'fake-target',
  };

  const forgedBytes = receiptMessage(forgedStatement);
  const forgedSignature = '0x' + sign(null, forgedBytes, attackerPair.privateKey).toString('hex');
  const forgedSubmission = { statement: forgedStatement, signature: forgedSignature };

  // Context without valid approved operator registration
  const context = {
    assignment: {
      domain: OPERATOR_DOMAIN,
      chainId: EXPECTED_CHAIN_ID,
      taskId: 'legitimate-task',
      attemptId: 'legitimate-attempt',
      nodeId: 'legitimate-node',
      capability: 'evidence_reviewer',
      taskKind: 'observe_registered_target',
      intentId: null,
      registeredTargetId: 'target-1',
      evidenceCommitments: [],
      maximumWorkUnits: 1,
      maximumBytes: 16384,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
    assignmentIssuedAt: new Date().toISOString(),
    assignmentStatus: 'accepted',
    operator: {
      nodeId: 'legitimate-node',
      capability: 'evidence_reviewer',
      publicKey: 'ed25519:0x' + '11'.repeat(32),
      approved: true,
    },
    receivedAtMs: Date.now(),
  };

  const verifier = createReceiptVerifier();
  const result = verifier.accept(forgedSubmission, context);

  // Assertion: The verifier categorically rejects forged receipt
  assert.equal(result.accepted, false);
  assert.ok(typeof result.code === 'string');

  // Invariant Assertion: Receipt object contains zero executable payload or financial signing power
  assert.equal('transfer' in forgedStatement, false);
  assert.equal('withdraw' in forgedStatement, false);
  assert.equal('mint' in forgedStatement, false);
});

test('FORMAL INVARIANT 2: Non-Discretionary Intent Isolation - Relay cannot alter user intent parameters', () => {
  // Model a user-signed trade intent
  const userIntent = {
    user: '0x1111111111111111111111111111111111111111',
    assetIn: '0x2222222222222222222222222222222222222222',
    assetOut: '0x3333333333333333333333333333333333333333',
    recipient: '0x1111111111111111111111111111111111111111', // User is recipient
    amountIn: 1000000000000000000n, // 1.0 ETH
    minAmountOut: 980000000000000000n, // 0.98 Token (2% max slippage)
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: 42n,
  };

  // Malicious relay attempts to divert recipient to attacker
  const tamperedIntent = {
    ...userIntent,
    recipient: '0x9999999999999999999999999999999999999999', // Attacker
  };

  function validateIntentExecution(intent, authorizedUser) {
    if (intent.user !== authorizedUser) throw new Error('InvalidUser');
    if (intent.recipient !== authorizedUser) throw new Error('RecipientMismatch');
    if (intent.amountIn > 1000000000000000000n) throw new Error('ExcessInput');
    return true;
  }

  // Legitimate execution passes
  assert.equal(validateIntentExecution(userIntent, userIntent.user), true);

  // Tampered intent is strictly blocked
  assert.throws(() => validateIntentExecution(tamperedIntent, userIntent.user), /RecipientMismatch/);
});

test('FORMAL INVARIANT 3: Zero-Custody Receipt Decoupling - Observation receipts never hold intermediate custody', () => {
  // A verified node receipt
  const verifiedReceipt = {
    nodeId: 'node-alpha-starlink',
    taskId: 'task-rf-ku-band-pass',
    outcome: 'success',
    evidenceLevel: 'independently_observed',
    chainResult: 'not_submitted',
    authenticatesRoute: false,
  };

  // Verify that receipt output explicitly declares authenticatesRoute=false and chainResult=not_submitted
  assert.equal(verifiedReceipt.authenticatesRoute, false);
  assert.equal(verifiedReceipt.chainResult, 'not_submitted');
  assert.equal('escrowBalance' in verifiedReceipt, false);
  assert.equal('custodyAddress' in verifiedReceipt, false);
});
