import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,defineChain,http,ContractFunctionRevertedError} from 'viem';
import {buildRewardManifest,verifyRewardProof} from '../rewards/manifest.mjs';
let child,client,wallet,accounts;const artifacts={};const DAY=86400n,POLICY='0x'+'ab'.repeat(32),NODE='0x'+'cd'.repeat(32);
before(async()=>{
  for(const n of ['FixtureAsset','FixtureEligibility','SportDelegationVault','FundedMerkleRewards'])artifacts[n]=JSON.parse(await readFile(new URL(`../out/${n}.json`,import.meta.url),'utf8'));
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  child=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','4663','--accounts','5','--silent'],{stdio:'ignore'});
  const chain=defineChain({id:4663,name:'Isolated Earn verification',nativeCurrency:{name:'Test ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[`http://127.0.0.1:${port}`]}}});
  client=createPublicClient({chain,transport:http(chain.rpcUrls.default.http[0],{retryCount:0}),pollingInterval:10});wallet=createWalletClient({chain,transport:http(chain.rpcUrls.default.http[0],{retryCount:0})});
  for(let i=0;i<40;i++){try{accounts=await wallet.getAddresses();return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Anvil unavailable');
});
after(()=>child?.kill('SIGTERM'));
const read=(name,address,functionName,args=[])=>client.readContract({address,abi:artifacts[name].abi,functionName,args});
async function write(name,address,functionName,args=[],account=accounts[0],gas){const h=await wallet.writeContract({address,abi:artifacts[name].abi,functionName,args,account,...(gas?{gas}:{})});return client.waitForTransactionReceipt({hash:h});}
async function deploy(name,args=[]){const a=artifacts[name],h=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode,args,account:accounts[0]});const r=await client.waitForTransactionReceipt({hash:h});assert.equal(r.status,'success');return r.contractAddress;}
async function exactRevert(name,address,functionName,args,account,errorName){await assert.rejects(()=>client.simulateContract({address,abi:artifacts[name].abi,functionName,args,account}),e=>e.walk?.(c=>c instanceof ContractFunctionRevertedError)?.data?.errorName===errorName);}
async function at(timestamp){await client.request({method:'evm_setNextBlockTimestamp',params:[Number(timestamp)]});await client.request({method:'evm_mine',params:[]});}
const now=async()=>(await client.getBlock()).timestamp;
async function base(){const asset=await deploy('FixtureAsset'),gate=await deploy('FixtureEligibility');return {asset,gate};}
async function rewards(bond=25n){const b=await base(),start=await now()+1000n;const vault=await deploy('FundedMerkleRewards',[b.asset,accounts[0],accounts[1],b.gate,start,accounts[0],1000n,bond]);await write('FixtureAsset',b.asset,'mint',[accounts[0],1000n]);await write('FixtureAsset',b.asset,'approve',[vault,1000n]);return {...b,start,vault};}
function tree(s,entries=[{index:'0',participant:accounts[2],amountRaw:'40'},{index:'1',participant:accounts[3],amountRaw:'30'}],id='0'){return buildRewardManifest({chainId:4663,distributor:s.vault,epochId:id,asset:s.asset,policyHash:POLICY,fundedRaw:'100',entries});}
async function finalize(s,t){await at(s.start+3n*DAY);await write('FundedMerkleRewards',s.vault,'proposeRoot',[0n,t.root,t.manifestHash,BigInt(t.manifest.allocatedRaw)]);await write('FundedMerkleRewards',s.vault,'reviewRoot',[0n,t.root,t.manifestHash,BigInt(t.manifest.allocatedRaw),true],accounts[1]);const e=await read('FundedMerkleRewards',s.vault,'epochs',[0n]);await at(e[7]+3n*DAY);await write('FundedMerkleRewards',s.vault,'finalize',[0n],accounts[4]);}

test('delegation tranches keep independent finite exits; admission failure and pause cannot confiscate principal',async()=>{
  const {asset,gate}=await base(),vault=await deploy('SportDelegationVault',[asset,accounts[0],gate,100n,200n]);
  await write('FixtureAsset',asset,'mint',[accounts[2],150n]);await write('FixtureAsset',asset,'approve',[vault,150n],accounts[2]);
  await write('SportDelegationVault',vault,'deposit',[NODE,100n],accounts[2]);await write('SportDelegationVault',vault,'requestExit',[1n],accounts[2]);
  const first=await read('SportDelegationVault',vault,'tranches',[1n]);await write('SportDelegationVault',vault,'deposit',[NODE,50n],accounts[2]);
  assert.equal((await read('SportDelegationVault',vault,'tranches',[1n]))[5],first[5]);
  await exactRevert('SportDelegationVault',vault,'withdraw',[1n],accounts[2],'NotUnlocked');
  await exactRevert('SportDelegationVault',vault,'withdraw',[1n],accounts[0],'Unauthorized');
  // Counterfactual: the helper must reject an incorrect expected error, not accept any revert.
  await assert.rejects(()=>exactRevert('SportDelegationVault',vault,'withdraw',[1n],accounts[0],'NotUnlocked'));
  await write('SportDelegationVault',vault,'setDepositsPaused',[true]);await write('FixtureEligibility',gate,'setAllowed',[false]);
  await at(first[5]);await write('SportDelegationVault',vault,'withdraw',[1n],accounts[2]);
  assert.equal(await read('FixtureAsset',asset,'balanceOf',[accounts[2]]),100n);assert.equal(await read('SportDelegationVault',vault,'totalPrincipal'),50n);
  await exactRevert('SportDelegationVault',vault,'withdraw',[1n],accounts[2],'InvalidTranche');
});
test('incident shortens but never extends exit; lifting incident cannot relock it',async()=>{
  const {asset,gate}=await base(),vault=await deploy('SportDelegationVault',[asset,accounts[0],gate,100n,200n]);
  await write('FixtureAsset',asset,'mint',[accounts[2],50n]);await write('FixtureAsset',asset,'approve',[vault,50n],accounts[2]);await write('SportDelegationVault',vault,'deposit',[NODE,50n],accounts[2]);
  await write('SportDelegationVault',vault,'setIncident',[true]);await write('SportDelegationVault',vault,'requestIncidentExit',[1n],accounts[2]);const t=await read('SportDelegationVault',vault,'tranches',[1n]);assert.equal(t[5]-t[4],2n*DAY);
  await write('SportDelegationVault',vault,'requestIncidentExit',[1n],accounts[2]);assert.equal((await read('SportDelegationVault',vault,'tranches',[1n]))[5],t[5]);await write('SportDelegationVault',vault,'setIncident',[false]);await at(t[5]);await write('SportDelegationVault',vault,'withdraw',[1n],accounts[2]);assert.equal(await read('SportDelegationVault',vault,'totalPrincipal'),0n);
});
test('funding is real, capped and restricted; cannot front-run somebody else into an epoch',async()=>{
  const s=await rewards();await exactRevert('FundedMerkleRewards',s.vault,'fundEpoch',[0n,1n,POLICY],accounts[2],'Unauthorized');await exactRevert('FundedMerkleRewards',s.vault,'fundEpoch',[0n,1001n,POLICY],accounts[0],'InvalidEpoch');
  await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);assert.equal(await read('FundedMerkleRewards',s.vault,'totalReserved'),100n);assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[s.vault]),100n);
  await exactRevert('FundedMerkleRewards',s.vault,'fundEpoch',[0n,1n,POLICY],accounts[0],'InvalidEpoch');
});
test('manifest proofs match Solidity leaf domain and valid claims cannot cross users or replay',async()=>{
  const s=await rewards(),t=tree(s);await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);
  assert.equal(await read('FundedMerkleRewards',s.vault,'leafHash',[0n,0n,accounts[2],40n]),t.proofs[0].leaf);assert.equal(verifyRewardProof(t.proofs[0].leaf,t.proofs[0].proof,t.root),true);
  await finalize(s,t);await exactRevert('FundedMerkleRewards',s.vault,'claim',[0n,0n,40n,t.proofs[0].proof],accounts[4],'InvalidProof');
  await write('FundedMerkleRewards',s.vault,'claim',[0n,0n,40n,t.proofs[0].proof],accounts[2]);
  await exactRevert('FundedMerkleRewards',s.vault,'claim',[0n,0n,1n,[]],accounts[2],'AlreadyClaimed');assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[accounts[2]]),40n);assert.equal(await read('FundedMerkleRewards',s.vault,'totalReserved'),60n);
});
test('three-day review, independent reviewer and root revisions bind the approved allocation',async()=>{
  const s=await rewards(),t=tree(s);await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);await at(s.start+3n*DAY);
  await write('FundedMerkleRewards',s.vault,'proposeRoot',[0n,t.root,t.manifestHash,70n]);await exactRevert('FundedMerkleRewards',s.vault,'reviewRoot',[0n,t.root,t.manifestHash,BigInt(t.manifest.allocatedRaw),true],accounts[0],'Unauthorized');await write('FundedMerkleRewards',s.vault,'reviewRoot',[0n,t.root,t.manifestHash,BigInt(t.manifest.allocatedRaw),true],accounts[1]);
  await exactRevert('FundedMerkleRewards',s.vault,'finalize',[0n],accounts[4],'OutsideWindow');await write('FundedMerkleRewards',s.vault,'proposeRoot',[0n,t.root,t.manifestHash,70n]);await exactRevert('FundedMerkleRewards',s.vault,'finalize',[0n],accounts[4],'InvalidEpoch');
});
test('claim eligibility and transfer failure preserve bitmap and allocation for a later valid retry',async()=>{
  const s=await rewards(),t=tree(s);await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);await finalize(s,t);
  await write('FixtureEligibility',s.gate,'setAllowed',[false]);await exactRevert('FundedMerkleRewards',s.vault,'claim',[0n,0n,40n,t.proofs[0].proof],accounts[2],'Ineligible');
  await write('FixtureEligibility',s.gate,'setAllowed',[true]);await write('FixtureAsset',s.asset,'setFailure',[true]);assert.equal((await write('FundedMerkleRewards',s.vault,'claim',[0n,0n,40n,t.proofs[0].proof],accounts[2],500000n)).status,'reverted');
  assert.equal(await read('FundedMerkleRewards',s.vault,'isClaimed',[0n,0n]),false);assert.equal(await read('FundedMerkleRewards',s.vault,'totalReserved'),100n);assert.equal((await read('FundedMerkleRewards',s.vault,'epochs',[0n]))[3],0n);
  await write('FixtureAsset',s.asset,'setFailure',[false]);await write('FundedMerkleRewards',s.vault,'claim',[0n,0n,40n,t.proofs[0].proof],accounts[2]);assert.equal(await read('FundedMerkleRewards',s.vault,'isClaimed',[0n,0n]),true);
});
test('pause auto-expires after seven aggregate days and deadline cannot exceed 97 days',async()=>{
  const s=await rewards(),t=tree(s);await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);await finalize(s,t);
  const e=await read('FundedMerkleRewards',s.vault,'epochs',[0n]);await write('FundedMerkleRewards',s.vault,'setClaimsPaused',[0n,true],accounts[1]);await exactRevert('FundedMerkleRewards',s.vault,'claim',[0n,0n,40n,t.proofs[0].proof],accounts[2],'OutsideWindow');
  await at(await now()+7n*DAY);assert.equal(await read('FundedMerkleRewards',s.vault,'claimsPaused',[0n]),false);assert.equal(await read('FundedMerkleRewards',s.vault,'claimDeadline',[0n]),e[8]+97n*DAY);
  await write('FundedMerkleRewards',s.vault,'setClaimsPaused',[0n,false],accounts[1]);await exactRevert('FundedMerkleRewards',s.vault,'setClaimsPaused',[0n,true],accounts[1],'InvalidEpoch');
});
test('unfinalized deadline refunds only its funder and leaves other epoch reserves untouched',async()=>{
  const s=await rewards();await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);await write('FundedMerkleRewards',s.vault,'fundEpoch',[1n,100n,POLICY]);
  await at(s.start+17n*DAY+1n);await write('FundedMerkleRewards',s.vault,'closeEpoch',[0n],accounts[4]);assert.equal(await read('FundedMerkleRewards',s.vault,'totalReserved'),100n);assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[accounts[4]]),0n);assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[s.vault]),100n);
  await exactRevert('FundedMerkleRewards',s.vault,'closeEpoch',[0n],accounts[4],'InvalidEpoch');
});
test('manifest builder rejects duplicate recipients, oversubscription, malformed raw amounts and cross-chain inputs',()=>{
  const config={chainId:4663,distributor:accounts[0],asset:accounts[1],epochId:'0',policyHash:POLICY,fundedRaw:'100',entries:[{index:'0',participant:accounts[2],amountRaw:'40'}]};
  for(const patch of [{chainId:1},{fundedRaw:'39'},{entries:[...config.entries,{index:'1',participant:accounts[2],amountRaw:'1'}]},{entries:[{...config.entries[0],amountRaw:'01'}]}])assert.throws(()=>buildRewardManifest({...config,...patch}));
});
test('finalized epoch expiry returns only its unclaimed remainder to the recorded funder',async()=>{
  const s=await rewards(),t=tree(s);await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);await finalize(s,t);
  await write('FundedMerkleRewards',s.vault,'claim',[0n,0n,40n,t.proofs[0].proof],accounts[2]);
  const deadline=await read('FundedMerkleRewards',s.vault,'claimDeadline',[0n]);await at(deadline+1n);
  await exactRevert('FundedMerkleRewards',s.vault,'claim',[0n,1n,30n,t.proofs[1].proof],accounts[3],'OutsideWindow');
  const before=await read('FixtureAsset',s.asset,'balanceOf',[accounts[0]]);await write('FundedMerkleRewards',s.vault,'closeEpoch',[0n],accounts[4]);
  assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[accounts[0]]),before+60n);assert.equal(await read('FundedMerkleRewards',s.vault,'totalReserved'),0n);
});
test('a three-leaf odd-width tree produces independently checkable proofs and stable ordering',()=>{
  const config={chainId:4663,distributor:accounts[0],asset:accounts[1],epochId:'0',policyHash:POLICY,fundedRaw:'100',entries:[{index:'2',participant:accounts[4],amountRaw:'20'},{index:'0',participant:accounts[2],amountRaw:'40'},{index:'1',participant:accounts[3],amountRaw:'30'}]};
  const t=buildRewardManifest(config);assert.equal(t.root,buildRewardManifest({...config,entries:[...config.entries].reverse()}).root);
  for(const p of t.proofs)assert.equal(verifyRewardProof(p.leaf,p.proof,t.root),true);
  assert.equal(t.manifest.allocatedRaw,'90');assert.equal(verifyRewardProof(POLICY,t.proofs[0].proof,t.root),false);
});
test('changed eligibility bytecode stops new deposits and claims without blocking an existing principal exit',async()=>{
  const {asset,gate}=await base(),vault=await deploy('SportDelegationVault',[asset,accounts[0],gate,100n,200n]);
  await write('FixtureAsset',asset,'mint',[accounts[2],100n]);await write('FixtureAsset',asset,'approve',[vault,100n],accounts[2]);await write('SportDelegationVault',vault,'deposit',[NODE,50n],accounts[2]);await write('SportDelegationVault',vault,'requestExit',[1n],accounts[2]);
  // Synthetic local bytecode change returning true: without pinning, this replacement would permit entry.
  await client.request({method:'anvil_setCode',params:[gate,'0x600160005260206000f3']});
  await exactRevert('SportDelegationVault',vault,'deposit',[NODE,1n],accounts[2],'Unavailable');
  const tranche=await read('SportDelegationVault',vault,'tranches',[1n]);await at(tranche[5]);await write('SportDelegationVault',vault,'withdraw',[1n],accounts[2]);
  assert.equal(await read('SportDelegationVault',vault,'totalPrincipal'),0n);
  const s=await rewards(),t=tree(s);await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);await finalize(s,t);
  await client.request({method:'anvil_setCode',params:[s.gate,'0x600160005260206000f3']});
  await exactRevert('FundedMerkleRewards',s.vault,'claim',[0n,0n,40n,t.proofs[0].proof],accounts[2],'Ineligible');
  assert.equal(await read('FundedMerkleRewards',s.vault,'isClaimed',[0n,0n]),false);
});
test('challengeRoot freezes finalization with bond; slashes bond on dismissal and refunds on upheld dispute',async()=>{
  const bond=25n;
  const s=await rewards(bond),t=tree(s);
  await write('FundedMerkleRewards',s.vault,'fundEpoch',[0n,100n,POLICY]);
  await write('FundedMerkleRewards',s.vault,'fundEpoch',[1n,100n,POLICY]);
  await at(s.start+3n*DAY);
  await write('FundedMerkleRewards',s.vault,'proposeRoot',[0n,t.root,t.manifestHash,70n]);
  await write('FundedMerkleRewards',s.vault,'reviewRoot',[0n,t.root,t.manifestHash,70n,true],accounts[1]);
  const evidence='0x'+'ee'.repeat(32);

  // Challenger (accounts[3]) needs bond tokens
  await write('FixtureAsset',s.asset,'mint',[accounts[3],bond*2n]);
  await write('FixtureAsset',s.asset,'approve',[s.vault,bond*2n],accounts[3]);

  // Challenge root posts the bond
  await write('FundedMerkleRewards',s.vault,'challengeRoot',[0n,evidence],accounts[3]);
  assert.equal(await read('FundedMerkleRewards',s.vault,'epochDisputed',[0n]),true);
  assert.equal(await read('FundedMerkleRewards',s.vault,'epochChallengeEvidence',[0n]),evidence);
  assert.equal(await read('FundedMerkleRewards',s.vault,'epochChallengeBond',[0n]),bond);
  assert.equal(await read('FundedMerkleRewards',s.vault,'epochChallenger',[0n]),accounts[3]);

  // Finalize is blocked while disputed
  const e=await read('FundedMerkleRewards',s.vault,'epochs',[0n]);
  await at(e[7]+3n*DAY);
  await exactRevert('FundedMerkleRewards',s.vault,'finalize',[0n],accounts[4],'Challenged');

  // Reviewer clears frivolous dispute: bond is slashed and given to epoch funder (accounts[0])
  const funderBefore=await read('FixtureAsset',s.asset,'balanceOf',[accounts[0]]);
  await write('FundedMerkleRewards',s.vault,'resolveChallenge',[0n,true],accounts[1]);
  assert.equal(await read('FundedMerkleRewards',s.vault,'epochDisputed',[0n]),false);
  assert.equal(await read('FundedMerkleRewards',s.vault,'epochChallengeBond',[0n]),0n);
  assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[accounts[0]]),funderBefore+bond);

  // Now finalization proceeds
  await write('FundedMerkleRewards',s.vault,'finalize',[0n],accounts[4]);
  assert.notEqual((await read('FundedMerkleRewards',s.vault,'epochs',[0n]))[8],0n);

  // Test upheld challenge on epoch 1: bond refunded to challenger
  await at(s.start+6n*DAY);
  await write('FundedMerkleRewards',s.vault,'proposeRoot',[1n,t.root,t.manifestHash,70n]);
  await write('FundedMerkleRewards',s.vault,'reviewRoot',[1n,t.root,t.manifestHash,70n,true],accounts[1]);
  await write('FundedMerkleRewards',s.vault,'challengeRoot',[1n,evidence],accounts[3]);

  const challengerBefore=await read('FixtureAsset',s.asset,'balanceOf',[accounts[3]]);
  // Reviewer upholds challenge (clearDispute = false): bond refunded in full to challenger
  await write('FundedMerkleRewards',s.vault,'resolveChallenge',[1n,false],accounts[1]);
  assert.equal(await read('FundedMerkleRewards',s.vault,'epochDisputed',[1n]),true);
  assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[accounts[3]]),challengerBefore+bond);
});

