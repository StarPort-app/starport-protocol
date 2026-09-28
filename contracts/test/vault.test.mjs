import assert from 'node:assert/strict';
import { before,after,test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createPublicClient,createWalletClient,defineChain,http } from 'viem';
import { planCollection } from '../keeper/collection-plan.mjs';
let child,client,wallet,accounts;
const artifacts={};
before(async()=>{
  for(const name of ['StarportFeeVault','FixtureAsset','FixtureEscrow','FixtureFactory','FixtureTransferTaxAsset'])artifacts[name]=JSON.parse(await readFile(new URL(`../out/${name}.json`,import.meta.url),'utf8'));
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  child=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','4663','--accounts','4','--silent'],{stdio:'ignore'});
  const url=`http://127.0.0.1:${port}`,chain=defineChain({id:4663,name:'Starport isolated local EVM',nativeCurrency:{name:'Local ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[url]}}});
  client=createPublicClient({chain,transport:http(url,{retryCount:0}),pollingInterval:20});wallet=createWalletClient({chain,transport:http(url,{retryCount:0})});
  for(let attempt=0;attempt<40;attempt++){try{if(await client.getChainId()===4663){accounts=await wallet.getAddresses();return;}}catch{}await new Promise(r=>setTimeout(r,50));}
  throw new Error('Isolated EVM did not start');
});
after(()=>{child?.kill('SIGTERM');});
async function deploy(name,args=[]){const a=artifacts[name],tx=await wallet.deployContract({account:accounts[0],abi:a.abi,bytecode:a.bytecode,args});return (await client.waitForTransactionReceipt({hash:tx})).contractAddress;}
async function write(name,address,functionName,args=[],account=accounts[0],gas){const tx=await wallet.writeContract({address,abi:artifacts[name].abi,functionName,args,account,...(gas?{gas}:{})});return client.waitForTransactionReceipt({hash:tx});}
const read=(name,address,functionName,args=[])=>client.readContract({address,abi:artifacts[name].abi,functionName,args});
async function setup(){const asset=await deploy('FixtureAsset'),escrow=await deploy('FixtureEscrow'),factory=await deploy('FixtureFactory');
  const vault=await deploy('StarportFeeVault',[asset,escrow,factory,accounts[0],accounts[1]]);return {asset,escrow,factory,vault};}

test('keeper can collect only to vault; repeat collection does not duplicate receipts; spending stays controller-only',async()=>{
  const {asset,escrow,vault}=await setup();await write('FixtureEscrow',escrow,'credit',[vault,asset,100n]);
  assert.equal((await write('StarportFeeVault',vault,'collectFees',[],accounts[2])).status,'success');
  assert.equal(await read('FixtureAsset',asset,'balanceOf',[vault]),100n);assert.equal(await read('FixtureAsset',asset,'balanceOf',[accounts[2]]),0n);
  await write('StarportFeeVault',vault,'collectFees',[],accounts[2]);assert.equal(await read('StarportFeeVault',vault,'totalCollected'),100n);
  assert.equal((await write('StarportFeeVault',vault,'payOperatingFunds',[10n],accounts[2],500000n)).status,'reverted');
  await write('StarportFeeVault',vault,'payOperatingFunds',[25n]);assert.equal(await read('FixtureAsset',asset,'balanceOf',[accounts[1]]),25n);
});
test('failed token delivery reverts the local claim transaction and leaves fee credit available',async()=>{
  const {asset,escrow,vault}=await setup();await write('FixtureEscrow',escrow,'credit',[vault,asset,100n]);await write('FixtureAsset',asset,'setFailure',[true]);
  assert.equal((await write('StarportFeeVault',vault,'collectFees',[],accounts[2],500000n)).status,'reverted');
  assert.equal(await read('FixtureEscrow',escrow,'balanceOfToken',[vault,asset]),100n);assert.equal(await read('StarportFeeVault',vault,'totalCollected'),0n);
});
test('controller handover requires acceptance; a future beneficiary change is delayed and does not move old funds',async()=>{
  const {asset,escrow,factory,vault}=await setup();await write('FixtureFactory',factory,'set',[asset,vault]);
  await write('FixtureEscrow',escrow,'credit',[vault,asset,100n]);await write('StarportFeeVault',vault,'collectFees');
  await write('FixtureEscrow',escrow,'credit',[vault,asset,25n]);
  await write('StarportFeeVault',vault,'proposeController',[accounts[3]]);assert.equal((await read('StarportFeeVault',vault,'controller')).toLowerCase(),accounts[0].toLowerCase());
  await write('StarportFeeVault',vault,'acceptController',[],accounts[3]);
  await write('StarportFeeVault',vault,'proposeFutureRecipient',[asset,accounts[1]],accounts[3]);
  assert.equal((await write('StarportFeeVault',vault,'executeFutureRecipient',[],accounts[3],500000n)).status,'reverted');
  await client.request({method:'evm_increaseTime',params:[172801]});await client.request({method:'evm_mine',params:[]});
  await write('StarportFeeVault',vault,'executeFutureRecipient',[],accounts[3]);assert.equal((await read('FixtureFactory',factory,'recipients',[asset])).toLowerCase(),accounts[1].toLowerCase());
  assert.equal(await read('FixtureEscrow',escrow,'balanceOfToken',[vault,asset]),25n);
  assert.equal(await read('FixtureAsset',asset,'balanceOf',[vault]),100n);
});
test('keeper planner needs binding, ETH and no pending submission; it never broadcasts or changes recipient',()=>{
  const config={vaultAddress:accounts[0],escrowAddress:accounts[1],vaultCodeHash:`0x${'ab'.repeat(32)}`,minimumClaimRaw:'0'};
  const snapshot={chainId:4663,vaultAddress:accounts[0],feeEscrow:accounts[1],feeAsset:'0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea',creatorFeeRecipient:accounts[0],vaultCodeHash:config.vaultCodeHash,blockHash:`0x${'cd'.repeat(32)}`,observedAt:new Date().toISOString(),claimableRaw:'1',keeperEthWei:'100',estimatedGasWei:'50',collectionPaused:false,emergencyMode:false,pendingSubmission:false};
  assert.equal(planCollection(config,snapshot).action,'prepare');assert.equal(planCollection(config,{...snapshot,keeperEthWei:'0'}).action,'wait');
  assert.equal(planCollection(config,{...snapshot,pendingSubmission:true}).action,'reconcile');assert.equal(planCollection(config,{...snapshot,feeAsset:accounts[2]}).action,'disabled');
  assert.equal(planCollection(config,{...snapshot,emergencyMode:true}).reason,'emergency_mode');
});

test('ETH and another ERC-20 are accepted without creating fee income; only controller may recover to fixed payout',async()=>{
  const {vault}=await setup(),other=await deploy('FixtureAsset');
  await write('FixtureAsset',other,'mint',[vault,70n]);
  await client.waitForTransactionReceipt({hash:await wallet.sendTransaction({account:accounts[2],to:vault,value:1000n})});
  assert.equal(await client.getBalance({address:vault}),1000n);
  assert.equal(await read('StarportFeeVault',vault,'totalCollected'),0n);
  assert.equal((await write('StarportFeeVault',vault,'emergencyRecoverToken',[other,20n],accounts[0],500000n)).status,'reverted');
  assert.equal((await write('StarportFeeVault',vault,'setEmergencyMode',[true],accounts[2],500000n)).status,'reverted');
  await write('StarportFeeVault',vault,'setEmergencyMode',[true]);
  for(const [method,args] of [['emergencyRecoverToken',[other,20n]],['emergencyRecoverNative',[200n]]])assert.equal((await write('StarportFeeVault',vault,method,args,accounts[2],500000n)).status,'reverted');
  await write('StarportFeeVault',vault,'emergencyRecoverToken',[other,20n]);
  assert.equal(await read('FixtureAsset',other,'balanceOf',[accounts[1]]),20n);assert.equal(await read('FixtureAsset',other,'balanceOf',[vault]),50n);
  const before=await client.getBalance({address:accounts[1]});await write('StarportFeeVault',vault,'emergencyRecoverNative',[200n]);
  assert.equal(await client.getBalance({address:accounts[1]}),before+200n);assert.equal(await read('StarportFeeVault',vault,'totalCollected'),0n);
});

test('emergency mode cancels pending changes and needs explicit collection resume after exit',async()=>{
  const {asset,vault}=await setup();
  await write('StarportFeeVault',vault,'proposeController',[accounts[3]]);await write('StarportFeeVault',vault,'proposeFutureRecipient',[asset,accounts[1]]);
  await write('StarportFeeVault',vault,'setEmergencyMode',[true]);
  assert.equal(await read('StarportFeeVault',vault,'pendingController'),'0x0000000000000000000000000000000000000000');
  assert.equal((await read('StarportFeeVault',vault,'pendingRecipientChange'))[2],0n);
  assert.equal((await write('StarportFeeVault',vault,'collectFees',[],accounts[2],500000n)).status,'reverted');
  assert.equal((await write('StarportFeeVault',vault,'setCollectionPaused',[false],accounts[0],500000n)).status,'reverted');
  assert.equal((await write('StarportFeeVault',vault,'executeFutureRecipient',[],accounts[0],500000n)).status,'reverted');
  assert.equal((await write('StarportFeeVault',vault,'acceptController',[],accounts[3],500000n)).status,'reverted');
  await write('StarportFeeVault',vault,'proposeController',[accounts[3]]);await write('StarportFeeVault',vault,'acceptController',[],accounts[3]);
  await write('StarportFeeVault',vault,'setEmergencyMode',[false],accounts[3]);
  assert.equal(await read('StarportFeeVault',vault,'collectionPaused'),true);
  await write('StarportFeeVault',vault,'setCollectionPaused',[false],accounts[3]);
  assert.equal((await write('StarportFeeVault',vault,'collectFees',[],accounts[2])).status,'success');
});

test('emergency asset failure leaves funds in place; transfer-tax recovery records vault debit rather than promised net credit',async()=>{
  const {vault}=await setup(),other=await deploy('FixtureAsset'),taxed=await deploy('FixtureTransferTaxAsset');
  await write('FixtureAsset',other,'mint',[vault,20n]);await write('FixtureAsset',other,'setFailure',[true]);await write('StarportFeeVault',vault,'setEmergencyMode',[true]);
  assert.equal((await write('StarportFeeVault',vault,'emergencyRecoverToken',[other,10n],accounts[0],500000n)).status,'reverted');
  assert.equal(await read('FixtureAsset',other,'balanceOf',[vault]),20n);
  await write('FixtureTransferTaxAsset',taxed,'mint',[vault,20n]);await write('StarportFeeVault',vault,'emergencyRecoverToken',[taxed,10n]);
  assert.equal(await read('FixtureTransferTaxAsset',taxed,'balanceOf',[vault]),10n);assert.equal(await read('FixtureTransferTaxAsset',taxed,'balanceOf',[accounts[1]]),9n);
  assert.equal(await read('StarportFeeVault',vault,'totalCollected'),0n);
});
