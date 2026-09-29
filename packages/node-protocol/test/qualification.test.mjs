import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNodeQualification,NODE_REVIEW_VALIDITY_MS} from '../dist/index.js';
const NOW=Date.parse('2026-09-28T00:00:00.000Z');
const grant=(reviewerId,extra={})=>({reviewerId,policyVersion:'nodes-v1',revision:1,decision:'approve',issuedAt:new Date(NOW).toISOString(),expiresAt:new Date(NOW+NODE_REVIEW_VALIDITY_MS).toISOString(),...extra});
const policy={enrollmentStatus:'approved',nodePolicyVersion:'nodes-v1',currentPolicyVersion:'nodes-v1',currentReviewerIds:['a','b','c'],quorum:2,grants:[grant('a'),grant('b')],now:NOW};
test('qualification requires a current independent-actor quorum and never creates financial/hardware claims',()=>{
  const q=evaluateNodeQualification(policy);assert.equal(q.state,'active');assert.equal(q.taskEligible,true);assert.equal(q.financialEligible,false);assert.equal(q.hardwareAttested,false);
  assert.equal(evaluateNodeQualification({...policy,currentReviewerIds:['a']}).state,'unconfigured');
  assert.equal(evaluateNodeQualification({...policy,grants:[grant('a'),grant('a',{revision:2})]}).taskEligible,false);
});
test('old approvals do not renew on reads; expiration, revocation and ACL removal stop task eligibility',()=>{
  assert.equal(evaluateNodeQualification({...policy,now:NOW+NODE_REVIEW_VALIDITY_MS}).state,'expired');
  assert.equal(evaluateNodeQualification({...policy,grants:[...policy.grants,grant('a',{revision:2,decision:'revoke'})]}).state,'revoked');
  assert.equal(evaluateNodeQualification({...policy,currentReviewerIds:['b','c']}).taskEligible,false);
});
test('policy changes, future issuance and malformed grants fail closed',()=>{
  assert.equal(evaluateNodeQualification({...policy,currentPolicyVersion:'nodes-v2'}).state,'policy_mismatch');
  assert.equal(evaluateNodeQualification({...policy,grants:[grant('a',{issuedAt:new Date(NOW+1).toISOString()}),grant('b')]}).state,'unconfigured');
  assert.equal(evaluateNodeQualification({...policy,grants:[grant('a',{expiresAt:new Date(NOW+NODE_REVIEW_VALIDITY_MS+1).toISOString()}),grant('b')]}).state,'unconfigured');
});
test('renewal is explicit and effective expiry tracks the approvals necessary to retain quorum',()=>{
  const q=evaluateNodeQualification({...policy,grants:[grant('a',{expiresAt:new Date(NOW+1000).toISOString()}),grant('b'),grant('c') ]});
  assert.equal(q.expiresAt,new Date(NOW+NODE_REVIEW_VALIDITY_MS).toISOString());
  assert.equal(evaluateNodeQualification({...policy,enrollmentStatus:'suspended'}).taskEligible,false);
});
