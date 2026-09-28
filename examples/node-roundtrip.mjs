import { generateKeyPairSync, sign } from 'node:crypto';
import { createNodeAgent, createHttpsProbeTransport, signBoundedOperatorMessage } from '@starport/node-agent';
import { EXPECTED_CHAIN_ID, OPERATOR_DOMAIN, OPERATOR_MESSAGE_VERSION, taskMessage, messageDigest, receiptMessage, createReceiptVerifier } from '@starport/node-protocol';

const mode=process.argv[2];
if(process.argv.length!==3||!['--offline-check','--live'].includes(mode)){
  console.log('Usage: node examples/node-roundtrip.mjs --offline-check | --live\n--live makes one bounded public GET to https://starport.nexus/v1/capabilities. No wallet, terminal or chain transaction.');
  process.exit(process.argv.length===2?0:1);
}
const target={id:'starport-capabilities',kind:'https_get',method:'GET',url:'https://starport.nexus/v1/capabilities',timeoutMs:5000,maxBytes:65536};
const started=Date.now();
const assignment={domain:OPERATOR_DOMAIN,chainId:EXPECTED_CHAIN_ID,taskId:'reference-task',attemptId:'reference-attempt',nodeId:'reference-operator',capability:'evidence_reviewer',taskKind:'observe_registered_target',intentId:null,registeredTargetId:target.id,evidenceCommitments:[],maximumWorkUnits:1,maximumBytes:16384,expiresAt:new Date(started+60000).toISOString()};
const transport=mode==='--live'?createHttpsProbeTransport([target]):{async read(){return {statusCode:200,body:Buffer.from('explicit synthetic offline specimen'),truncated:false};}};
const result=await createNodeAgent({targets:[target],transport,clock:Date.now,runtimeEnabled:true}).probe({taskId:assignment.taskId,targetId:target.id});
if(result.outcome!=='success'){console.log(JSON.stringify({mode,outcome:result.outcome,evidenceLevel:result.evidenceLevel,authenticatesRoute:false}));process.exit(1);}
// An ephemeral reference key only: never read or persist any operator/wallet secret.
const pair=generateKeyPairSync('ed25519');
const publicKey='ed25519:0x'+pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
const signer={publicKey,sign:bytes=>sign(null,bytes,pair.privateKey)};
const statement={domain:OPERATOR_DOMAIN,chainId:EXPECTED_CHAIN_ID,taskId:assignment.taskId,attemptId:assignment.attemptId,nodeId:assignment.nodeId,assignmentStatementDigest:messageDigest(taskMessage(assignment)),statementVersion:OPERATOR_MESSAGE_VERSION,nodeClaim:`HTTPS response body digest ${result.bodyDigest}`,evidenceReferences:[result.bodyDigest],transactionHashes:[],observedAt:result.observedAt,intentId:null,registeredTargetId:target.id};
const submission={statement,signature:'0x'+Buffer.from(signBoundedOperatorMessage(signer,receiptMessage(statement))).toString('hex')};
const context={assignment,assignmentIssuedAt:new Date(started).toISOString(),assignmentStatus:'accepted',operator:{nodeId:assignment.nodeId,capability:assignment.capability,publicKey,approved:true},receivedAtMs:Date.now()};
const verifier=createReceiptVerifier();const verification=verifier.accept(submission,context);const replay=verifier.accept(submission,context);
console.log(JSON.stringify({mode,registry:'local reference only, not production enrollment',probe:result,verification,replay},null,2));
if(!verification.accepted||replay.accepted||replay.code!=='ATTEMPT_ALREADY_USED')process.exitCode=1;
