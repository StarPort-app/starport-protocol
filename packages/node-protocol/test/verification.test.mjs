import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { encodeCanonical, canonicalText, messageDigest, taskMessage, receiptMessage, verifyReceiptSubmission, createReceiptVerifier, OPERATOR_DOMAIN, OPERATOR_MESSAGE_VERSION, EXPECTED_CHAIN_ID } from '../dist/index.js';

const NOW=Date.parse('2026-09-28T12:00:00.000Z');
function fixture(extra={}) {
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const key='ed25519:0x'+publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
  const assignment={domain:OPERATOR_DOMAIN,chainId:EXPECTED_CHAIN_ID,taskId:'task-1',attemptId:'attempt-1',nodeId:'node-1',capability:'starlink_gateway',taskKind:'observe_registered_target',intentId:null,registeredTargetId:'status',evidenceCommitments:[],maximumWorkUnits:1,maximumBytes:16384,expiresAt:new Date(NOW+60000).toISOString(),...extra};
  const statement={domain:OPERATOR_DOMAIN,chainId:EXPECTED_CHAIN_ID,taskId:assignment.taskId,attemptId:assignment.attemptId,nodeId:assignment.nodeId,assignmentStatementDigest:messageDigest(taskMessage(assignment)),statementVersion:OPERATOR_MESSAGE_VERSION,nodeClaim:'HTTPS body digest observed',evidenceReferences:[],transactionHashes:[],observedAt:new Date(NOW).toISOString(),intentId:null,registeredTargetId:'status'};
  const signStatement=s=>({statement:s,signature:'0x'+sign(null,receiptMessage(s),privateKey).toString('hex')});
  const context={assignment,assignmentIssuedAt:new Date(NOW-1000).toISOString(),assignmentStatus:'accepted',operator:{nodeId:'node-1',capability:'starlink_gateway',publicKey:key,approved:true},receivedAtMs:NOW};
  return {context,statement,submission:signStatement(statement),signStatement};
}

test('canonical encoding has a fixed UTF-8 representation, is order independent and rejects ambiguous inputs',()=>{
  const a=encodeCanonical({z:'a=b',a:'Earth 🌍'});
  assert.equal(canonicalText(a),'starport-operator-message/v1\na=Earth 🌍\nz=a=b\n');
  assert.deepEqual(a,encodeCanonical({a:'Earth 🌍',z:'a=b'}));
  for(const value of ['x\ny=z','x\r','x\0','\ud800'])assert.throws(()=>encodeCanonical({a:value}));
  assert.throws(()=>encodeCanonical({'bad=key':'x'}));
});
test('valid Ed25519 receipt verifies only as self-reported, with no chain or satellite provenance',()=>{
  const f=fixture();assert.deepEqual(verifyReceiptSubmission(f.submission,f.context),{accepted:true,statementDigest:messageDigest(receiptMessage(f.statement)),evidenceLevel:'self_reported',chainResult:'not_submitted',authenticatesRoute:false});
});
test('changed content, wrong signer and malformed signatures fail',()=>{
  const f=fixture();
  assert.equal(verifyReceiptSubmission({...f.submission,statement:{...f.statement,nodeClaim:'altered'}},f.context).code,'INVALID_SIGNATURE');
  assert.equal(verifyReceiptSubmission(f.submission,{...f.context,operator:fixture().context.operator}).code,'INVALID_SIGNATURE');
  assert.equal(verifyReceiptSubmission({...f.submission,signature:'0x00'},f.context).code,'INVALID_SIGNATURE');
});
test('binding is recomputed from the trusted assignment, not trusted from the submitted digest',()=>{
  for(const field of ['taskId','attemptId','nodeId','registeredTargetId']){
    const f=fixture();assert.equal(verifyReceiptSubmission(f.signStatement({...f.statement,[field]:'different'}),f.context).code,'ASSIGNMENT_MISMATCH');
  }
  const f=fixture();assert.equal(verifyReceiptSubmission(f.submission,{...f.context,assignment:{...f.context.assignment,maximumWorkUnits:2}}).code,'ASSIGNMENT_MISMATCH');
});
test('wrong domain, chain, financial intent or transactions cannot become accepted receipts',()=>{
  for(const patch of [{chainId:1},{domain:'other'},{intentId:'financial-intent'},{transactionHashes:['0x'+'ab'.repeat(32)]},{statementVersion:'other'}]){
    const f=fixture();assert.equal(verifyReceiptSubmission(f.signStatement({...f.statement,...patch}),f.context).code,'INVALID_STATEMENT');
  }
});
test('invalid registry context, disabled node, excessive budgets and unknown tasks fail closed',()=>{
  const f=fixture();
  for(const patch of [{operator:{...f.context.operator,approved:false}},{assignmentStatus:'offered'},{assignment:{...f.context.assignment,maximumBytes:20000}},{assignment:{...f.context.assignment,taskKind:'transfer_funds'}},{assignment:{...f.context.assignment,intentId:'x'}}])assert.equal(verifyReceiptSubmission(f.submission,{...f.context,...patch}).code,'INVALID_CONTEXT');
});
test('unknown fields, oversized claims/references and canonical control characters are rejected',()=>{
  const f=fixture();
  for(const patch of [{extra:true},{nodeClaim:'x'.repeat(2001)},{evidenceReferences:Array(21).fill('x')},{nodeClaim:'inject\npurpose=other'}])assert.equal(verifyReceiptSubmission({...f.submission,statement:{...f.statement,...patch}},f.context).accepted,false);
  assert.equal(verifyReceiptSubmission({...f.submission,hardwareAttested:true},f.context).accepted,false);
  const small=fixture({maximumBytes:100});assert.equal(verifyReceiptSubmission(small.submission,small.context).code,'INVALID_STATEMENT');
});
test('issued-at, observation, expiry, receive window and canonical timestamp bounds are enforced',()=>{
  const f=fixture();
  for(const observedAt of [new Date(NOW-2000).toISOString(),new Date(NOW+60001).toISOString(),'2026-09-28T12:00:00Z'])assert.equal(verifyReceiptSubmission(f.signStatement({...f.statement,observedAt}),f.context).code,'OUTSIDE_WINDOW');
  assert.equal(verifyReceiptSubmission(f.submission,{...f.context,receivedAtMs:NOW+60001}).code,'OUTSIDE_WINDOW');
  const long=fixture({expiresAt:new Date(NOW+3600000).toISOString()});assert.equal(verifyReceiptSubmission(long.submission,{...long.context,receivedAtMs:NOW+900001}).code,'OUTSIDE_WINDOW');
});
test('replay guard consumes an attempt once, including contradictory valid signatures',()=>{
  const f=fixture(),v=createReceiptVerifier();
  assert.equal(v.accept({...f.submission,signature:'invalid'},f.context).accepted,false);
  assert.equal(v.accept(f.submission,f.context).accepted,true);
  assert.equal(v.accept(f.submission,f.context).code,'ATTEMPT_ALREADY_USED');
  assert.equal(v.accept(f.signStatement({...f.statement,nodeClaim:'contradictory'}),f.context).code,'ATTEMPT_ALREADY_USED');
});
test('bounded replay capacity does not evict valid attempts and refuses backward receiver clocks',()=>{
  const f=fixture(),next=fixture({attemptId:'attempt-2'}),v=createReceiptVerifier(1);
  assert.equal(v.accept(f.submission,f.context).accepted,true);
  assert.equal(v.accept(next.submission,next.context).code,'CAPACITY_REACHED');
  assert.equal(v.accept(f.submission,{...f.context,receivedAtMs:NOW-1}).code,'OUTSIDE_WINDOW');
});
