import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { Resolver } from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { createHttpsProbeTransport,createNodeAgent,assertRegisteredTargets } from '../dist/index.js';
import { isPublicIpv4 } from '../dist/public-ip.js';

const target={id:'status',kind:'https_get',method:'GET',url:'https://probe.example/status',timeoutMs:100,maxBytes:32};
const input={targetId:'status',url:target.url,method:'GET'};
const options=()=>({signal:new AbortController().signal,maxBytes:32});
function fakeIo(t,{addresses=['8.8.8.8'],status=200,chunks=['hello'],headers={},complete=true,stall=false}={}) {
  const calls=[];
  t.mock.method(Resolver.prototype,'resolve4',async()=>addresses);
  t.mock.method(https,'request',(opts,callback)=>{
    calls.push(opts);const req=new EventEmitter();
    req.end=()=>queueMicrotask(()=>{
      if(stall)return;
      const res=new EventEmitter();res.statusCode=status;res.headers=headers;res.complete=complete;let destroyed=false;
      res.destroy=()=>{destroyed=true;};callback(res);
      for(const s of chunks){if(destroyed)break;res.emit('data',Buffer.from(s));}
      if(!destroyed)res.emit('end');
    });
    opts.signal.addEventListener('abort',()=>req.emit('error',new Error('test abort')),{once:true});return req;
  });
  syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});return calls;
}
test('special, reserved and ambiguous IP destinations are refused',()=>{
  for(const host of ['0.1.2.3','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','192.0.0.1','192.0.2.1','192.88.99.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','240.0.0.1','255.255.255.255','::1','::ffff:127.0.0.1'])assert.equal(isPublicIpv4(host),false,host);
  for(const url of ['https://2130706433/','https://[::1]/','https://198.18.0.1/','https://224.0.0.1/'])assert.throws(()=>assertRegisteredTargets([{...target,url}]));
  assert.equal(isPublicIpv4('8.8.8.8'),true);
});
test('real adapter pins validated IP while preserving hostname TLS checks and does not inherit an agent',async t=>{
  const calls=fakeIo(t),transport=createHttpsProbeTransport([target]);
  const r=await transport.read(input,options());assert.equal(Buffer.from(r.body).toString(),'hello');assert.equal(r.truncated,false);
  assert.equal(calls.length,1);assert.equal(calls[0].hostname,'8.8.8.8');assert.equal(calls[0].servername,'probe.example');assert.equal(calls[0].headers.Host,'probe.example');assert.equal(calls[0].agent,false);assert.equal(calls[0].rejectUnauthorized,true);assert.equal(calls[0].port,443);assert.equal(calls[0].method,'GET');assert.equal(calls[0].checkServerIdentity('8.8.8.8',{subject:{CN:'wrong.example'}})?.code,'ERR_TLS_CERT_ALTNAME_INVALID');
});
test('private or mixed DNS answers are rejected before any connection; DNS is rechecked each time',async t=>{
  const calls=fakeIo(t,{addresses:['8.8.8.8','10.0.0.1']}),transport=createHttpsProbeTransport([target]);
  await assert.rejects(()=>transport.read(input,options()),/HTTPS probe failed/);assert.equal(calls.length,0);
});
test('rebinding cannot use a previous public DNS approval',async t=>{
  const calls=fakeIo(t),transport=createHttpsProbeTransport([target]);
  await transport.read(input,options());t.mock.method(Resolver.prototype,'resolve4',async()=>['127.0.0.1']);
  await assert.rejects(()=>transport.read(input,options()));assert.equal(calls.length,1);
});
test('redirects never follow Location or return a successful probe',async t=>{
  const calls=fakeIo(t,{status:302,headers:{location:'https://127.0.0.1/'}});
  const agent=createNodeAgent({targets:[target],transport:createHttpsProbeTransport([target]),clock:Date.now,runtimeEnabled:true});
  const r=await agent.probe({taskId:'t1',targetId:'status'});assert.equal(r.outcome,'failure');assert.equal(calls.length,1);assert.equal(r.bodyDigest,null);
});
test('chunked oversized responses stay bounded',async t=>{
  fakeIo(t,{chunks:['a'.repeat(20),'b'.repeat(20)]});
  const r=await createHttpsProbeTransport([target]).read(input,options());assert.equal(r.truncated,true);assert.equal(r.body.byteLength,0);
});
test('compression is refused',async t=>{
  fakeIo(t,{headers:{'content-encoding':'gzip'}});await assert.rejects(()=>createHttpsProbeTransport([target]).read(input,options()));
});
test('oversized declared length is rejected before body buffering',async t=>{
  fakeIo(t,{headers:{'content-length':'1000000'}});const r=await createHttpsProbeTransport([target]).read(input,options());assert.equal(r.truncated,true);assert.equal(r.body.byteLength,0);
});
test('incomplete responses never become successful receipts',async t=>{
  fakeIo(t,{complete:false});await assert.rejects(()=>createHttpsProbeTransport([target]).read(input,options()));
});
test('standalone adapter has a total deadline and concurrency cap',async t=>{
  const calls=fakeIo(t,{stall:true}),transport=createHttpsProbeTransport([target]);
  const a=assert.rejects(()=>transport.read(input,options()),{name:'AbortError'});
  const b=assert.rejects(()=>transport.read(input,options()),{name:'AbortError'});
  await assert.rejects(()=>transport.read(input,options()),/capacity/);await Promise.all([a,b]);assert.equal(calls.length,2);
});
test('caller abort, altered target, non-443 port and disabled agent never create a request',async t=>{
  const calls=fakeIo(t),transport=createHttpsProbeTransport([target]);const c=new AbortController();c.abort();
  await assert.rejects(()=>transport.read(input,{...options(),signal:c.signal}),{name:'AbortError'});
  await assert.rejects(()=>transport.read({...input,url:'https://other.example/'},options()));
  const alt={...target,url:'https://probe.example:8443/status'};await assert.rejects(()=>createHttpsProbeTransport([alt]).read({...input,url:alt.url},options()),/443/);
  const agent=createNodeAgent({targets:[target],transport,clock:Date.now});assert.equal((await agent.probe({taskId:'t1',targetId:'status'})).outcome,'disabled');assert.equal(calls.length,0);
});
