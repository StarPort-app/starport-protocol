import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {keccak256} from 'viem';
import {observeCollection,preparationBlocker,createObserverClient} from '../keeper/monitor.mjs';
const design=JSON.parse(await readFile(new URL('../deployment.design.json',import.meta.url),'utf8'));
const code='0x60006000',hash=keccak256(code),blockHash=`0x${'ab'.repeat(32)}`,now=Date.parse('2026-09-28T12:00:00.000Z');
const config={...design,deploymentPaused:false,emergencyPermissionsReviewed:true,vaultAddress:`0x${'33'.repeat(20)}`,projectTokenAddress:`0x${'44'.repeat(20)}`,deployedStackCompatibilityVerified:true,vaultCodeHash:hash,feeEscrowCodeHash:hash,ponsFactoryCodeHash:hash};
function fixture(){let calls=0,changed=false;return {count:()=>calls,reorg:()=>{changed=true;},client:{
  async getChainId(){calls++;return 4663;},async getBlock(q){calls++;return {number:10n,timestamp:BigInt(now/1000-1),hash:q.blockNumber&&changed?`0x${'cd'.repeat(32)}`:blockHash};},
  async getBytecode(){calls++;return code;},async getBalance(){calls++;return 1000n;},async estimateContractGas(){calls++;return 100n;},async getGasPrice(){calls++;return 2n;},
  async readContract(q){calls++;const values={feeAsset:config.feeAsset,feeEscrow:config.feeEscrowReference,ponsFactory:config.ponsFactoryReference,controller:config.controller,payoutRecipient:config.payoutRecipient,collectionPaused:false,emergencyMode:false,claimable:5n,balanceOf:5n,
    getLaunchedToken:{exists:true,token:config.projectTokenAddress,creatorFeeRecipient:config.vaultAddress,pairToken:config.feeAsset,creatorTaxBps:50}};if(!(q.functionName in values))throw Error('Unexpected method');return values[q.functionName];},
}};}
test('deployment pause and unresolved submissions make no network request',async()=>{
  const f=fixture();assert.equal(preparationBlocker(design),'deployment_paused');assert.equal((await observeCollection(design,f.client)).action,'disabled');
  assert.equal((await observeCollection(config,f.client,{pendingSubmission:true})).action,'reconcile');assert.equal(f.count(),0);
});
test('observer binds reviewed code, roles, token, quote and a coherent block without a sender',async()=>{
  const f=fixture(),plan=await observeCollection(config,f.client,{now:()=>now});assert.equal(plan.action,'prepare');assert.equal(plan.transaction.to,config.vaultAddress);assert.equal(plan.transaction.value,'0');
  assert.equal(plan.snapshot.estimatedGasWei,'200');assert.equal(plan.unsweptFeeAssessment,'not_included');
  const g=fixture();g.reorg();await assert.rejects(observeCollection(config,g.client,{now:()=>now}));
});
test('invalid asset/role configuration and foreign RPC hosts are refused',()=>{
  assert.equal(preparationBlocker({...config,feeAsset:'0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa'}),'role_or_asset_mismatch');
  assert.equal(preparationBlocker({...config,keeperAddress:config.controller}),'role_or_asset_mismatch');
  for(const url of ['http://robinhood-mainnet.g.alchemy.com/v2/x','https://evil.invalid/v2/x','https://robinhood-mainnet.g.alchemy.com/v2/x?token=y'])assert.throws(()=>createObserverClient(url));
});
test('emergency mode stops the observer before gas estimation or unsigned collection preparation',async()=>{
  const f=fixture(),original=f.client.readContract;let estimates=0;
  f.client.readContract=async q=>q.functionName==='emergencyMode'?true:original(q);
  f.client.estimateContractGas=async()=>{estimates++;throw Error('must not estimate');};
  const result=await observeCollection(config,f.client,{now:()=>now});assert.equal(result.action,'wait');assert.equal(result.reason,'emergency_mode');assert.equal(estimates,0);
});
