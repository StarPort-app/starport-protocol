import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,defineChain,http,ContractFunctionRevertedError} from 'viem';

let child,client,wallet,accounts;
const artifacts={};
const H=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');

before(async()=>{
  for(const n of ['FixtureAsset','FixtureExecutionPolicy','FixturePonsRouter','FixturePonsBondingCurve','FixtureUniversalRouter','PonsV1TradeAdapter','BoundedTradeRouter']){
    artifacts[n]=JSON.parse(await readFile(new URL(`../out/${n}.json`,import.meta.url),'utf8'));
  }
  const server=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;
  await new Promise(r=>server.close(r));
  child=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','4663','--accounts','5','--silent'],{stdio:'ignore'});
  const chain=defineChain({id:4663,name:'Isolated adapter verification',nativeCurrency:{name:'Test ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[`http://127.0.0.1:${port}`]}}});
  client=createPublicClient({chain,transport:http(chain.rpcUrls.default.http[0],{retryCount:0}),pollingInterval:10});
  wallet=createWalletClient({chain,transport:http(chain.rpcUrls.default.http[0],{retryCount:0})});
  for(let i=0;i<40;i++){
    try{accounts=await wallet.getAddresses();return;}catch{}
    await new Promise(r=>setTimeout(r,50));
  }
  throw Error('Anvil unavailable');
});

after(()=>child?.kill('SIGTERM'));

const read=(n,address,functionName,args=[])=>client.readContract({address,abi:artifacts[n].abi,functionName,args});
async function write(n,address,functionName,args=[],account=accounts[0],gas){
  const h=await wallet.writeContract({address,abi:artifacts[n].abi,functionName,args,account,...(gas?{gas}:{})});
  return client.waitForTransactionReceipt({hash:h});
}
async function deploy(n,args=[]){
  const a=artifacts[n],h=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode,args,account:accounts[0]});
  const r=await client.waitForTransactionReceipt({hash:h});
  assert.equal(r.status,'success');
  return r.contractAddress;
}
async function exactRevert(n,address,functionName,args,account,name){
  await assert.rejects(
    ()=>client.simulateContract({address,abi:artifacts[n].abi,functionName,args,account}),
    e=>e.walk?.(c=>c instanceof ContractFunctionRevertedError)?.data?.errorName===name
  );
}
const now=async()=>(await client.getBlock()).timestamp;

async function setupTrade(venueKind = 2){
  const assetIn=await deploy('FixtureAsset');
  const assetOut=await deploy('FixtureAsset');
  let ponsRouter;
  if(venueKind === 1){
    ponsRouter=await deploy('FixturePonsBondingCurve',[assetIn,assetOut]);
  } else if(venueKind === 0){
    ponsRouter=await deploy('FixtureUniversalRouter');
  } else {
    ponsRouter=await deploy('FixturePonsRouter');
  }
  const adapter=await deploy('PonsV1TradeAdapter',[ponsRouter, venueKind]);
  const policy=await deploy('FixtureExecutionPolicy');
  const router=await deploy('BoundedTradeRouter',[assetIn,assetOut,adapter,policy,accounts[0],1000n]);
  await write('FixtureAsset',assetIn,'mint',[accounts[2],500n]);
  await write('FixtureAsset',assetIn,'approve',[router,500n],accounts[2]);
  return {assetIn,assetOut,ponsRouter,adapter,policy,router};
}

test('PonsV1TradeAdapter routes exact-input swap from BoundedTradeRouter and enforces zero residual allowance',async()=>{
  const s=await setupTrade();
  const routeId=await read('BoundedTradeRouter',s.router,'routeId');
  const deadline=await now()+600n;
  const terms={
    user:accounts[2],
    assetIn:s.assetIn,
    assetOut:s.assetOut,
    recipient:accounts[1],
    amountIn:100n,
    minAmountOut:190n,
    deadline,
    quoteId:H(101),
    marketContextHash:H(202)
  };

  const beforeUserIn=await read('FixtureAsset',s.assetIn,'balanceOf',[accounts[2]]);
  const beforeRecipientOut=await read('FixtureAsset',s.assetOut,'balanceOf',[accounts[1]]);

  // Execute trade: FixturePonsRouter multiplies by 2 (100 -> 200 out)
  const res=await write('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),0n,routeId,terms],accounts[2]);
  assert.equal(res.status,'success');

  // Verify balance updates
  assert.equal(await read('FixtureAsset',s.assetIn,'balanceOf',[accounts[2]]),beforeUserIn-100n);
  assert.equal(await read('FixtureAsset',s.assetOut,'balanceOf',[accounts[1]]),beforeRecipientOut+200n);
  assert.equal(await read('FixtureAsset',s.assetIn,'balanceOf',[s.router]),0n);
  assert.equal(await read('FixtureAsset',s.assetOut,'balanceOf',[s.router]),0n);
  assert.equal(await read('FixtureAsset',s.assetIn,'balanceOf',[s.adapter]),0n);
  assert.equal(await read('FixtureAsset',s.assetOut,'balanceOf',[s.adapter]),0n);

  // Verify zero residual allowances
  assert.equal(await read('FixtureAsset',s.assetIn,'allowance',[s.adapter,s.ponsRouter]),0n);
  assert.equal(await read('FixtureAsset',s.assetIn,'allowance',[s.router,s.adapter]),0n);
});

test('PonsV1TradeAdapter reverts when slippage tolerance is violated',async()=>{
  const s=await setupTrade();
  const routeId=await read('BoundedTradeRouter',s.router,'routeId');
  const deadline=await now()+600n;
  const terms={
    user:accounts[2],
    assetIn:s.assetIn,
    assetOut:s.assetOut,
    recipient:accounts[1],
    amountIn:100n,
    minAmountOut:250n, // Rate is 2x so output is 200; 250 > 200 violates minAmountOut
    deadline,
    quoteId:H(102),
    marketContextHash:H(203)
  };

  // The call reverts inside adapter with SlippageExceeded / UnexpectedSettlement
  await assert.rejects(
    ()=>client.simulateContract({
      address:s.router,
      abi:artifacts.BoundedTradeRouter.abi,
      functionName:'tradeExactInput',
      args:[H(2),1n,routeId,terms],
      account:accounts[2]
    })
  );
});

test('PonsV1TradeAdapter refuses expired trades',async()=>{
  const s=await setupTrade();
  const routeId=await read('BoundedTradeRouter',s.router,'routeId');
  const pastDeadline=await now()-10n;
  const terms={
    user:accounts[2],
    assetIn:s.assetIn,
    assetOut:s.assetOut,
    recipient:accounts[1],
    amountIn:50n,
    minAmountOut:50n,
    deadline:pastDeadline,
    quoteId:H(103),
    marketContextHash:H(204)
  };

  await exactRevert('BoundedTradeRouter',s.router,'tradeExactInput',[H(3),2n,routeId,terms],accounts[2],'InvalidTrade');
});

test('PonsV1TradeAdapter fails closed if router bytecode changes',async()=>{
  const s=await setupTrade();
  const routeId=await read('BoundedTradeRouter',s.router,'routeId');
  const deadline=await now()+600n;
  const terms={
    user:accounts[2],
    assetIn:s.assetIn,
    assetOut:s.assetOut,
    recipient:accounts[1],
    amountIn:50n,
    minAmountOut:50n,
    deadline,
    quoteId:H(104),
    marketContextHash:H(205)
  };

  // Alter bytecode of the underlying ponsRouter to simulate an unreviewed upgrade
  await client.request({method:'anvil_setCode',params:[s.ponsRouter,'0x600160005260206000f3']});

  await assert.rejects(
    ()=>client.simulateContract({
      address:s.router,
      abi:artifacts.BoundedTradeRouter.abi,
      functionName:'tradeExactInput',
      args:[H(4),3n,routeId,terms],
      account:accounts[2]
    })
  );
});

test('PonsV1TradeAdapter executes pre-graduation trade via IPonsBondingCurve',async()=>{
  // venueKind 1 = BondingCurve
  const s=await setupTrade(1);
  const routeId=await read('BoundedTradeRouter',s.router,'routeId');
  const deadline=await now()+600n;
  const terms={
    user:accounts[2],
    assetIn:s.assetIn,
    assetOut:s.assetOut,
    recipient:accounts[1],
    amountIn:100n,
    minAmountOut:190n,
    deadline,
    quoteId:H(105),
    marketContextHash:H(206)
  };

  const beforeUserIn=await read('FixtureAsset',s.assetIn,'balanceOf',[accounts[2]]);
  const beforeRecipientOut=await read('FixtureAsset',s.assetOut,'balanceOf',[accounts[1]]);

  // Execute trade on curve
  const res=await write('BoundedTradeRouter',s.router,'tradeExactInput',[H(5),0n,routeId,terms],accounts[2]);
  assert.equal(res.status,'success');

  assert.equal(await read('FixtureAsset',s.assetIn,'balanceOf',[accounts[2]]),beforeUserIn-100n);
  assert.equal(await read('FixtureAsset',s.assetOut,'balanceOf',[accounts[1]]),beforeRecipientOut+200n);
  assert.equal(await read('FixtureAsset',s.assetIn,'allowance',[s.adapter,s.ponsRouter]),0n);
});

test('PonsV1TradeAdapter executes post-graduation trade via IUniversalRouter',async()=>{
  // venueKind 0 = UniversalRouter
  const s=await setupTrade(0);
  const routeId=await read('BoundedTradeRouter',s.router,'routeId');
  const deadline=await now()+600n;
  const terms={
    user:accounts[2],
    assetIn:s.assetIn,
    assetOut:s.assetOut,
    recipient:accounts[1],
    amountIn:100n,
    minAmountOut:190n,
    deadline,
    quoteId:H(106),
    marketContextHash:H(207)
  };

  const beforeUserIn=await read('FixtureAsset',s.assetIn,'balanceOf',[accounts[2]]);
  const beforeRecipientOut=await read('FixtureAsset',s.assetOut,'balanceOf',[accounts[1]]);

  // Execute trade on Universal Router
  const res=await write('BoundedTradeRouter',s.router,'tradeExactInput',[H(6),0n,routeId,terms],accounts[2]);
  assert.equal(res.status,'success');

  assert.equal(await read('FixtureAsset',s.assetIn,'balanceOf',[accounts[2]]),beforeUserIn-100n);
  assert.equal(await read('FixtureAsset',s.assetOut,'balanceOf',[accounts[1]]),beforeRecipientOut+200n);
  assert.equal(await read('FixtureAsset',s.assetIn,'allowance',[s.adapter,s.ponsRouter]),0n);
});

