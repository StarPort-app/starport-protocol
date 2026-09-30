import assert from 'node:assert/strict';
import test from 'node:test';
import { APPROVED_STARPORT_ORIGIN, STARPORT_CUSTOM_ORIGIN, READ_API_VERSION, READ_MAX_BYTES, SPCX_ADDRESS, ReadOnlyClientError,
  createStarportReadClient, publicReadPath, validateReadEnvelope, validateReadError, readFreshness, assertPageContinuation } from '../dist/index.js';

const NOW=Date.parse('2026-09-26T12:00:00.000Z');const AT=new Date(NOW).toISOString();
const HASH=`0x${'ab'.repeat(32)}`;
function meta(source='design_fixture',extra={}){return {environment:'preview',schemaVersion:READ_API_VERSION,source,observedAt:source==='design_fixture'?null:AT,observedBlock:null,confirmationState:'not_applicable',freshness:source==='design_fixture'?'unknown':'fresh',checkpoint:null,requestId:'public-read-test',...extra};}
function capabilities(){return {data:{environment:'preview',chainId:4663,schemaVersion:READ_API_VERSION,financialExecutionEnabled:false,
  capabilities:['trade','delegation','exit_request','withdrawal','reward_claim','payment','node_enrollment','mission_participation','developer_access'].map(name=>({name,state:'disabled',reasonCode:'CAPABILITY_DISABLED'}))},meta:meta()};}
function target(){return {data:{chainId:4663,quoteAsset:{chainId:4663,address:null,kind:'native',symbol:'ETH',decimals:18,decimalsVerified:true},creatorTaxBps:50,creatorTaxRule:'source_confirmed',projectTokenAddress:null,projectTokenTicker:'SPORT',evidenceDocument:'docs/pons-eth.md',launchEnabled:false,treasuryRecipientTarget:null,actualCreatorFeeRecipient:null,creatorRecipientBindingStatus:'pending_vault_deployment_and_PONS_binding'},meta:meta()};}
test('native launch quote rejects stale SPCX and zero-address ERC20 lookalikes',async()=>{
  for(const quoteAsset of [{chainId:4663,address:SPCX_ADDRESS,symbol:'SPCX',decimals:18,decimalsVerified:true},{chainId:4663,address:'0x'+'0'.repeat(40),kind:'native',symbol:'ETH',decimals:18,decimalsVerified:true}]){
    await assert.rejects(createStarportReadClient({now:()=>NOW,fetcher:async()=>json({...target(),data:{...target().data,quoteAsset}})}).getLaunchTarget(),ReadOnlyClientError);
  }
});
function asset(id=1){return {asset:{chainId:4663,address:`0x${id.toString(16).padStart(40,'0')}`,symbol:'TEST',decimals:18,decimalsVerified:false},kind:'stock_token',issuerMetadataUri:'https://api.robinhood.com/rhj/assets',multiplierRaw:'1000000000000000000',multiplierDecimals:18,marketStatus:'unknown',marketContext:null,issuer:{id:`0x${id.toString(16).padStart(64,'0')}`,name:'Synthetic test metadata',status:'active',isin:null,pendingMultiplierRaw:null,pendingMultiplierEffectiveAt:null}};}
function assets(){return {data:[asset()],meta:meta('issuer_api',{checkpoint:`issuer-assets:${'ab'.repeat(32)}`}),nextCursor:null,total:1};}
function price(){return {data:{chainId:4663,assetAddress:SPCX_ADDRESS.toLowerCase(),symbol:'SPCX',bid:'123.123456789012345678',ask:'124.000000000000000001',currency:'USD',isTradingHalt:false,generatedAt:AT,fetchedAt:AT,expiresAt:new Date(NOW+15000).toISOString(),sourceUrl:'https://api.robinhood.com/rhj/prices/SPCX',priceBasis:'underlying_equity',multiplierAdjusted:false,executable:false},meta:meta('issuer_api')};}
function nodes(){return {data:[{id:'node-1',operatorId:'operator-1',capability:'starlink_gateway',enrollmentStatus:'approved',serviceState:'unknown',evidenceReferences:[],lastProbeAt:null,policyVersion:'r4',operatorIndependence:'unverified',registrationSource:'operator_proposal',approximateRegion:null}],meta:meta('application_db',{freshness:'unknown'}),nextCursor:null};}
function receipts(){return {data:[{id:'receipt-1',nodeId:'node-1',statementDigest:HASH,statementScope:'Synthetic self-reported statement',evidenceLevel:'self_reported',observedAt:AT,chainResult:'not_submitted'}],meta:meta('application_db',{freshness:'unknown'}),nextCursor:null};}
function chainHead(){return {data:{chainId:4663,blockNumber:'1234',blockHash:HASH,blockTimestamp:new Date(NOW-1000).toISOString(),fetchedAt:AT,provider:'alchemy'},meta:meta('onchain',{observedBlock:'1234',confirmationState:'included'})};}
function corporateActions(){return {data:{sourceUrl:'https://api.robinhood.com/rhj/corporate-actions',fetchedAt:AT,sourceCount:1,supportedCount:1,actions:[{id:HASH,tokenSymbol:'SPCX',kind:'cash_dividend',status:'in_progress',processDate:'2026-09-30',underlyingSymbol:'SPCX',rate:'0.125',oldRate:null,newRate:null}]},meta:meta('issuer_api')};}
function starlinkOrbit(){return {data:{sourceUrl:'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON',sourceFetchedAt:AT,sourceEpochStart:AT,sourceEpochEnd:AT,elementCount:1,catalogSha256:HASH,sampledCount:1,site:'london',siteLabel:'London · reference location',computedAt:AT,model:'SGP4',evidenceLevel:'predicted_from_public_gp',refreshPaused:false,passes:[]},meta:meta('orbital_catalog',{checkpoint:HASH})};}
function orbitStatus(){return {data:{sourceUrl:'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON',checkedAt:AT,cacheState:'none',refreshState:'manual_review',nextEligibleAt:null,lastFetchedAt:null},meta:meta('application_db')};}
const errorBody=(code='UNCONFIGURED')=>({code,message:'The source is unavailable.',requestId:'read-error',retryable:false,retryAfterSeconds:null,resourceId:null,recoveryAction:'none'});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

test('all ten current read envelopes validate without upgrading their provenance',()=>{
  for(const [resource,make]of Object.entries({capabilities,launchTarget:target,assets,referencePrice:price,corporateActions,chainHead,starlinkOrbit,orbitStatus,nodes,receipts}))assert.deepEqual(validateReadEnvelope(resource,make(),NOW),make());
  const p=validateReadEnvelope('referencePrice',price(),NOW);assert.equal(p.data.bid,'123.123456789012345678');assert.equal(p.data.executable,false);
  assert.equal(readFreshness('referencePrice',p,NOW+15000),'stale');assert.equal(readFreshness('assets',assets(),NOW+300000),'stale');
});

test('strict metadata and projections reject invented execution, hardware, chain, and private fields',()=>{
  for(const [resource,make,mutate]of [
    ['assets',assets,x=>x.data[0].asset.decimalsVerified=true],['assets',assets,x=>x.meta.source='design_fixture'],
    ['assets',assets,x=>x.meta.observedAt='2026-02-30T00:00:00.000Z'],['assets',assets,x=>x.meta.schemaVersion='future'],
    ['assets',assets,x=>x.meta.observedAt=new Date(NOW+61000).toISOString()],['assets',assets,x=>x.nextCursor='https://evil.invalid/'],
    ['nodes',nodes,x=>x.data[0].walletPrivateKey='do-not-display'],['nodes',nodes,x=>x.data[0].enrollmentStatus='proposed'],
    ['receipts',receipts,x=>x.data[0].transactionHashes=[HASH]],['referencePrice',price,x=>x.data.executable=true],
    ['referencePrice',price,x=>x.data.multiplierAdjusted=true],['referencePrice',price,x=>x.data.ask='1'],
    ['corporateActions',corporateActions,x=>x.data.actions[0].rate='NaN'],['chainHead',chainHead,x=>x.meta.confirmationState='finalized'],
    ['launchTarget',target,x=>x.data.launchEnabled=true],['starlinkOrbit',starlinkOrbit,x=>x.data.evidenceLevel='rf_measured'],
    ['starlinkOrbit',starlinkOrbit,x=>x.data.operatorSignature='fabricated'],['starlinkOrbit',starlinkOrbit,x=>x.data.siteLabel='Starport station'],
    ['orbitStatus',orbitStatus,x=>x.data.nextEligibleAt=AT],['orbitStatus',orbitStatus,x=>x.meta.source='orbital_catalog'],
  ]){const input=make();mutate(input);assert.throws(()=>validateReadEnvelope(resource,input,NOW),ReadOnlyClientError);}
});

test('only fixed paths and approved origins are accepted; no URL, method, header or credential input',async()=>{
  assert.equal(publicReadPath('assets',{q:'a & b',limit:20}),'/v1/assets?limit=20&q=a+%26+b');
  assert.equal(publicReadPath('referencePrice',{address:SPCX_ADDRESS,symbol:'SPCX'}),`/v1/market/reference-price?address=${SPCX_ADDRESS.toLowerCase()}&symbol=SPCX`);
  assert.equal(publicReadPath('corporateActions'),'/v1/market/corporate-actions');
  assert.equal(publicReadPath('chainHead'),'/v1/network/chain-head');
  assert.equal(publicReadPath('starlinkOrbit'),'/v1/orbit/starlink?site=london');
  assert.equal(publicReadPath('starlinkOrbit',{site:'singapore'}),'/v1/orbit/starlink?site=singapore');
  assert.equal(publicReadPath('orbitStatus'),'/v1/orbit/status');
  for(const [resource,query]of [['https://evil.invalid',undefined],['assets',{url:'https://evil.invalid'}],['assets',{limit:101}],['nodes',{cursor:'a/b'}],['receipts',{nodeId:'../../private'}],['referencePrice',{address:SPCX_ADDRESS,symbol:'../x'}],['starlinkOrbit',{site:'../other'}],['orbitStatus',{}],['capabilities',{}]])assert.throws(()=>publicReadPath(resource,query),ReadOnlyClientError);
  for(const options of [{origin:'https://evil.invalid'},{origin:`${APPROVED_STARPORT_ORIGIN}.evil.invalid`},{origin:`${APPROVED_STARPORT_ORIGIN}/path`},{origin:'http://localhost:1234'},{headers:{Authorization:'do-not-forward'}}])assert.throws(()=>createStarportReadClient(options),ReadOnlyClientError);
  const requests=[];const client=createStarportReadClient({origin:APPROVED_STARPORT_ORIGIN,now:()=>NOW,fetcher:async(url,init)=>{requests.push({url,init});return json(capabilities());}});
  assert.equal(requests.length,0);await client.getCapabilities();
  assert.equal(requests[0].url,`${APPROVED_STARPORT_ORIGIN}/v1/capabilities`);assert.equal(requests[0].init.method,'GET');
  assert.equal(requests[0].init.credentials,'omit');assert.equal(requests[0].init.redirect,'error');assert.equal(requests[0].init.body,undefined);
  assert.deepEqual(requests[0].init.headers,{Accept:'application/json'});
  const custom=createStarportReadClient({origin:STARPORT_CUSTOM_ORIGIN,now:()=>NOW,fetcher:async(url)=>{assert.equal(url,`${STARPORT_CUSTOM_ORIGIN}/v1/capabilities`);return json(capabilities());}});
  await custom.getCapabilities();
  assert.throws(()=>createStarportReadClient({origin:`${STARPORT_CUSTOM_ORIGIN}.evil.invalid`}),ReadOnlyClientError);
});

test('typed unavailable errors remain errors, preserve request IDs, and never automatically retry',async()=>{
  let calls=0;const client=createStarportReadClient({fetcher:async()=>{calls++;return json(errorBody(),503);}});
  await assert.rejects(client.getAssets(),error=>error.code==='UNCONFIGURED'&&error.status===503&&error.detail.requestId==='read-error');
  assert.equal(calls,1);
  assert.throws(()=>validateReadError({...errorBody(),raw:'private upstream details'}),ReadOnlyClientError);
  assert.throws(()=>validateReadError({...errorBody(),retryable:true}),ReadOnlyClientError);
  assert.throws(()=>validateReadError({...errorBody(),code:'UNKNOWN_SERVER_CODE'}),ReadOnlyClientError);
});

test('response body, redirects, media and JSON are bounded and validated',async()=>{
  for(const response of [()=>Response.redirect('https://evil.invalid',302),()=>new Response('bad',{headers:{'content-type':'text/html'}}),
    ()=>new Response('{}',{headers:{'content-type':'application/json','content-length':String(READ_MAX_BYTES+1)}}),
    ()=>new Response('x'.repeat(READ_MAX_BYTES+1),{headers:{'content-type':'application/json'}}),
    ()=>new Response('{bad',{headers:{'content-type':'application/json'}}),
    ()=>{const r=json(capabilities());Object.defineProperty(r,'url',{value:'https://evil.invalid/v1/capabilities'});return r;},
  ])await assert.rejects(createStarportReadClient({fetcher:async()=>response(),now:()=>NOW}).getCapabilities(),error=>error.code==='INVALID_RESPONSE');
});

test('timeout/abort are prompt and ignored cancellation cannot create unbounded transport calls',async()=>{
  let calls=0;const client=createStarportReadClient({timeoutMs:5,fetcher:async()=>{calls++;return new Promise(()=>{});}});
  await assert.rejects(client.getCapabilities(),error=>error.code==='TIMEOUT');
  await assert.rejects(client.getCapabilities(),error=>error.code==='TIMEOUT');
  await assert.rejects(client.getCapabilities(),error=>error.code==='CLIENT_BUSY');assert.equal(calls,2);
  const controller=new AbortController();let signal;
  const pending=createStarportReadClient({fetcher:async(_url,init)=>{signal=init.signal;return new Promise(()=>{});}}).getAssets(undefined,{signal:controller.signal});
  await new Promise(resolve=>setImmediate(resolve));controller.abort();
  await assert.rejects(pending,error=>error.code==='ABORTED');assert.equal(signal.aborted,true);
  let cancelled=false;const stream=new ReadableStream({cancel(){cancelled=true;}});
  await assert.rejects(createStarportReadClient({timeoutMs:5,fetcher:async()=>new Response(stream,{headers:{'content-type':'application/json'}})}).getCapabilities(),error=>error.code==='TIMEOUT');
  assert.equal(cancelled,true);
});

test('price identity, filtered receipts and page-size/cursor scope match their request',async()=>{
  await assert.rejects(createStarportReadClient({now:()=>NOW,fetcher:async()=>json(price())}).getReferencePrice({address:`0x${'11'.repeat(20)}`,symbol:'SPCX'}),ReadOnlyClientError);
  await assert.rejects(createStarportReadClient({now:()=>NOW,fetcher:async()=>json(receipts())}).getReceipts({nodeId:'another-node'}),ReadOnlyClientError);
  const repeated={...assets(),nextCursor:'abc',total:2};
  await assert.rejects(createStarportReadClient({now:()=>NOW,fetcher:async()=>json(repeated)}).getAssets({cursor:'abc'}),ReadOnlyClientError);
  const first={...assets(),nextCursor:'abc',total:2};const second={...assets(),data:[asset(2)],total:2};
  assert.doesNotThrow(()=>assertPageContinuation('assets',first,second,'abc'));
  assert.throws(()=>assertPageContinuation('assets',first,{...second,meta:{...second.meta,checkpoint:'changed'}},'abc'),ReadOnlyClientError);
  assert.throws(()=>assertPageContinuation('assets',first,{...second,data:[asset(1)]},'abc'),ReadOnlyClientError);
});

test('orbital model binds the requested reference location and never upgrades to RF evidence',async()=>{
  const client=createStarportReadClient({now:()=>NOW,fetcher:async()=>json(starlinkOrbit())});
  assert.equal((await client.getStarlinkOrbit()).data.evidenceLevel,'predicted_from_public_gp');
  await assert.rejects(client.getStarlinkOrbit({site:'singapore'}),error=>error.code==='INVALID_RESPONSE');
  assert.equal(readFreshness('starlinkOrbit',starlinkOrbit(),NOW+7200000),'stale');
});

test('orbital cache status is a separate fixed public read',async()=>{
  const client=createStarportReadClient({now:()=>NOW,fetcher:async()=>json(orbitStatus())});
  assert.equal((await client.getOrbitStatus()).data.refreshState,'manual_review');
});
