import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,defineChain,http,ContractFunctionRevertedError,keccak256,stringToHex,zeroAddress} from 'viem';
import {invoiceIdFor,invoiceTypedData,hashInvoiceTerms} from '../pay/invoice.mjs';
let child,client,wallet,accounts;const artifacts={};const H=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
before(async()=>{
  for(const n of ['FixtureAsset','FixtureExecutionPolicy','FixtureTypedAdapter','FixtureContractIssuer','StarportPaymentRouter','BoundedTradeRouter'])artifacts[n]=JSON.parse(await readFile(new URL(`../out/${n}.json`,import.meta.url),'utf8'));
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  child=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','4663','--accounts','5','--silent'],{stdio:'ignore'});
  const chain=defineChain({id:4663,name:'Isolated execution verification',nativeCurrency:{name:'Test ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[`http://127.0.0.1:${port}`]}}});
  client=createPublicClient({chain,transport:http(chain.rpcUrls.default.http[0],{retryCount:0}),pollingInterval:10});wallet=createWalletClient({chain,transport:http(chain.rpcUrls.default.http[0],{retryCount:0})});
  for(let i=0;i<40;i++){try{accounts=await wallet.getAddresses();return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Anvil unavailable');
});
after(()=>child?.kill('SIGTERM'));
const read=(n,address,functionName,args=[])=>client.readContract({address,abi:artifacts[n].abi,functionName,args});
async function write(n,address,functionName,args=[],account=accounts[0],gas){const h=await wallet.writeContract({address,abi:artifacts[n].abi,functionName,args,account,...(gas?{gas}:{})});return client.waitForTransactionReceipt({hash:h});}
async function deploy(n,args=[]){const a=artifacts[n],h=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode,args,account:accounts[0]});const r=await client.waitForTransactionReceipt({hash:h});assert.equal(r.status,'success');return r.contractAddress;}
async function exactRevert(n,address,functionName,args,account,name){await assert.rejects(()=>client.simulateContract({address,abi:artifacts[n].abi,functionName,args,account}),e=>e.walk?.(c=>c instanceof ContractFunctionRevertedError)?.data?.errorName===name);}
const now=async()=>(await client.getBlock()).timestamp;
async function pay(){const asset=await deploy('FixtureAsset'),policy=await deploy('FixtureExecutionPolicy'),router=await deploy('StarportPaymentRouter',[asset,accounts[0],policy,1000n]);await write('FixtureAsset',asset,'mint',[accounts[2],1000n]);await write('FixtureAsset',asset,'approve',[router,1000n],accounts[2]);return {asset,policy,router};}
async function request(s,extra={}){return {preparationId:H(1),payer:accounts[2],recipient:accounts[1],asset:s.asset,amountRaw:50n,deadline:await now()+600n,nonce:0n,expectedTermsDigest:H(7),...extra};}
async function invoice(s,extra={}){const terms={invoiceId:invoiceIdFor('invoice-1'),version:'1',issuer:accounts[1],payee:accounts[1],asset:s.asset,amountRaw:'50',authorizedPayer:zeroAddress,expiresAt:String(await now()+3600n),termsHash:H(7),...extra};const typed=invoiceTypedData({chainId:4663,router:s.router,terms});const digest=hashInvoiceTerms({chainId:4663,router:s.router,terms});const sig=await wallet.signTypedData({...typed,account:accounts[1]});return {terms:typed.message,digest,sig};}

test('direct payment settles exact amount to recipient and consumes both wallet nonce and preparation identity',async()=>{
  const s=await pay(),r=await request(s);assert.equal((await write('StarportPaymentRouter',s.router,'payDirect',[r],accounts[2])).status,'success');assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[accounts[1]]),50n);assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[s.router]),0n);
  assert.equal(await read('StarportPaymentRouter',s.router,'isNonceUsed',[accounts[2],0n]),true);await exactRevert('StarportPaymentRouter',s.router,'payDirect',[{...r,nonce:1n}],accounts[2],'InvalidPayment');await exactRevert('StarportPaymentRouter',s.router,'payDirect',[{...r,preparationId:H(2)}],accounts[2],'NonceUsed');
});
test('caller, amount, recipient, deadline, pause and current eligibility are onchain payment constraints',async()=>{
  const s=await pay(),r=await request(s);
  for(const [patch,caller] of [[{},accounts[3]],[{amountRaw:1001n},accounts[2]],[{recipient:s.router},accounts[2]],[{deadline:1n},accounts[2]]])await exactRevert('StarportPaymentRouter',s.router,'payDirect',[{...r,...patch}],caller,'InvalidPayment');
  await write('FixtureExecutionPolicy',s.policy,'setAllowed',[false]);await exactRevert('StarportPaymentRouter',s.router,'payDirect',[r],accounts[2],'PaymentUnavailable');assert.equal(await read('StarportPaymentRouter',s.router,'isNonceUsed',[accounts[2],0n]),false);
  await write('FixtureExecutionPolicy',s.policy,'setAllowed',[true]);await write('StarportPaymentRouter',s.router,'setPaused',[true]);await exactRevert('StarportPaymentRouter',s.router,'payDirect',[r],accounts[2],'PaymentUnavailable');
});
test('invoice EIP-712 hash matches independent viem encoding; issuer signature is distinct from payer transaction',async()=>{
  const s=await pay(),i=await invoice(s);assert.equal(await read('StarportPaymentRouter',s.router,'invoiceDigest',[i.terms]),i.digest);
  const r=await request(s,{expectedTermsDigest:i.digest});await write('StarportPaymentRouter',s.router,'payInvoice',[r,i.terms,i.sig],accounts[2]);
  const state=await read('StarportPaymentRouter',s.router,'invoiceState',[accounts[1],i.terms.invoiceId]);assert.equal(state.settled,true);assert.equal(state.settlementDigest,i.digest);
  await exactRevert('StarportPaymentRouter',s.router,'payInvoice',[{...r,preparationId:H(2),nonce:1n},i.terms,i.sig],accounts[2],'InvoiceUnavailable');
});
test('invoice signatures cannot cross contract domains and changed terms cannot use the old signature',async()=>{
  const s=await pay(),i=await invoice(s),other=await deploy('StarportPaymentRouter',[s.asset,accounts[0],s.policy,1000n]);
  const digest=await read('StarportPaymentRouter',other,'invoiceDigest',[i.terms]);assert.notEqual(digest,i.digest);
  const r=await request(s,{expectedTermsDigest:digest});await exactRevert('StarportPaymentRouter',other,'payInvoice',[r,i.terms,i.sig],accounts[2],'InvalidIssuerSignature');
  const changed={...i.terms,amountRaw:51n};const changedDigest=await read('StarportPaymentRouter',s.router,'invoiceDigest',[changed]);await exactRevert('StarportPaymentRouter',s.router,'payInvoice',[{...r,amountRaw:51n,expectedTermsDigest:changedDigest},changed,i.sig],accounts[2],'InvalidIssuerSignature');
});
test('restricted payer, issuer cancellation and canonical version changes invalidate old invoice terms',async()=>{
  const s=await pay(),i=await invoice(s,{authorizedPayer:accounts[3]});await exactRevert('StarportPaymentRouter',s.router,'payInvoice',[await request(s,{expectedTermsDigest:i.digest}),i.terms,i.sig],accounts[2],'InvoiceUnavailable');
  const open=await invoice(s);await write('StarportPaymentRouter',s.router,'advanceInvoiceVersion',[open.terms.invoiceId,2n],accounts[1]);await exactRevert('StarportPaymentRouter',s.router,'payInvoice',[await request(s,{expectedTermsDigest:open.digest}),open.terms,open.sig],accounts[2],'InvoiceUnavailable');
  const next=await invoice(s,{version:'2'});await write('StarportPaymentRouter',s.router,'cancelInvoice',[next.terms.invoiceId],accounts[1]);await exactRevert('StarportPaymentRouter',s.router,'payInvoice',[await request(s,{expectedTermsDigest:next.digest}),next.terms,next.sig],accounts[2],'InvoiceUnavailable');
});
test('ERC-1271 contract issuer authorization is rechecked at settlement and revocation works',async()=>{
  const s=await pay(),issuer=await deploy('FixtureContractIssuer');const i=await invoice(s,{issuer});await write('FixtureContractIssuer',issuer,'configure',[i.digest,false]);const r=await request(s,{expectedTermsDigest:i.digest});
  await exactRevert('StarportPaymentRouter',s.router,'payInvoice',[r,i.terms,'0xaa'],accounts[2],'InvalidIssuerSignature');await write('FixtureContractIssuer',issuer,'configure',[i.digest,true]);await write('StarportPaymentRouter',s.router,'payInvoice',[r,i.terms,'0xaa'],accounts[2]);assert.equal((await read('StarportPaymentRouter',s.router,'invoiceState',[issuer,i.terms.invoiceId])).settled,true);
});
test('failed invoice transfer rolls back consumed invoice, nonce and preparation before a later explicit retry',async()=>{
  const s=await pay(),i=await invoice(s),r=await request(s,{expectedTermsDigest:i.digest});await write('FixtureAsset',s.asset,'setFailure',[true]);assert.equal((await write('StarportPaymentRouter',s.router,'payInvoice',[r,i.terms,i.sig],accounts[2],900000n)).status,'reverted');
  assert.equal((await read('StarportPaymentRouter',s.router,'invoiceState',[accounts[1],i.terms.invoiceId])).settled,false);assert.equal(await read('StarportPaymentRouter',s.router,'isNonceUsed',[accounts[2],0n]),false);assert.equal(await read('StarportPaymentRouter',s.router,'paidPreparations',[accounts[2],r.preparationId]),false);
  await write('FixtureAsset',s.asset,'setFailure',[false]);await write('StarportPaymentRouter',s.router,'payInvoice',[r,i.terms,i.sig],accounts[2]);assert.equal(await read('FixtureAsset',s.asset,'balanceOf',[accounts[1]]),50n);
});
test('wallet nonce invalidation is scoped to owner and rejects the exact invalidated action',async()=>{
  const s=await pay(),r=await request(s);await write('StarportPaymentRouter',s.router,'invalidateNonces',[0n,1n],accounts[3]);assert.equal(await read('StarportPaymentRouter',s.router,'isNonceUsed',[accounts[2],0n]),false);await write('StarportPaymentRouter',s.router,'invalidateNonces',[0n,1n],accounts[2]);await exactRevert('StarportPaymentRouter',s.router,'payDirect',[r],accounts[2],'NonceUsed');
});
async function trade(){const input=await deploy('FixtureAsset'),output=await deploy('FixtureAsset'),policy=await deploy('FixtureExecutionPolicy'),adapter=await deploy('FixtureTypedAdapter'),router=await deploy('BoundedTradeRouter',[input,output,adapter,policy,accounts[0],1000n]);await write('FixtureAsset',input,'mint',[accounts[2],1000n]);await write('FixtureAsset',input,'approve',[router,1000n],accounts[2]);await write('FixtureAsset',output,'mint',[adapter,1000n]);const route=await read('BoundedTradeRouter',router,'routeId');const terms={user:accounts[2],assetIn:input,assetOut:output,recipient:accounts[2],amountIn:100n,minAmountOut:70n,deadline:await now()+600n,quoteId:H(2),marketContextHash:H(3)};return {input,output,policy,adapter,router,route,terms};}
test('exact input trade measures output, clears adapter allowance and preserves donated balances',async()=>{
  const s=await trade();await write('FixtureAsset',s.input,'mint',[s.router,9n]);await write('FixtureAsset',s.output,'mint',[s.router,7n]);
  await write('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),0n,s.route,s.terms],accounts[2]);assert.equal(await read('FixtureAsset',s.input,'balanceOf',[s.router]),9n);assert.equal(await read('FixtureAsset',s.output,'balanceOf',[s.router]),7n);assert.equal(await read('FixtureAsset',s.output,'balanceOf',[accounts[2]]),80n);assert.equal(await read('FixtureAsset',s.input,'allowance',[s.router,s.adapter]),0n);
  await exactRevert('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),1n,s.route,s.terms],accounts[2],'InvalidTrade');
});
test('partial fills, understated output and false adapter returns revert all swap and nonce effects',async()=>{
  for(const setting of [[60n,0n,0n,false],[80n,50n,0n,false],[80n,0n,90n,false]]){
    const s=await trade();await write('FixtureTypedAdapter',s.adapter,'configure',setting);await exactRevert('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),0n,s.route,s.terms],accounts[2],'UnexpectedSettlement');
    assert.equal((await write('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),0n,s.route,s.terms],accounts[2],1000000n)).status,'reverted');assert.equal(await read('FixtureAsset',s.input,'balanceOf',[accounts[2]]),1000n);assert.equal(await read('FixtureAsset',s.output,'balanceOf',[s.adapter]),1000n);assert.equal(await read('FixtureAsset',s.input,'allowance',[s.router,s.adapter]),0n);assert.equal(await read('BoundedTradeRouter',s.router,'isNonceUsed',[accounts[2],0n]),false);
  }
});
test('trade refuses wrong route, caller, expiry, asset and stale/rejected policy context',async()=>{
  const s=await trade();await exactRevert('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),0n,H(99),s.terms],accounts[2],'RouteUnavailable');
  for(const [patch,caller] of [[{},accounts[3]],[{deadline:1n},accounts[2]],[{assetIn:s.output},accounts[2]]])await exactRevert('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),0n,s.route,{...s.terms,...patch}],caller,'InvalidTrade');
  await write('FixtureExecutionPolicy',s.policy,'setExpectedContext',[H(999)]);await exactRevert('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),0n,s.route,s.terms],accounts[2],'RouteUnavailable');
});
test('callback reaches and is refused by the reentrancy guard rather than an earlier incidental condition',async()=>{
  const s=await trade();await write('FixtureTypedAdapter',s.adapter,'configure',[80n,0n,0n,true]);await write('BoundedTradeRouter',s.router,'tradeExactInput',[H(1),0n,s.route,s.terms],accounts[2]);assert.equal(await read('FixtureTypedAdapter',s.adapter,'reentryError'),keccak256(stringToHex('ReentrantCall()')).slice(0,10));
});
