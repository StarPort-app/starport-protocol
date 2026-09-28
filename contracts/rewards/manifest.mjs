import { encodeAbiParameters, getAddress, isAddress, keccak256, stringToHex } from 'viem';
const uint = x => typeof x === 'string' && x.length <= 78 && /^(0|[1-9][0-9]*)$/.test(x) && BigInt(x) < 2n**256n;
const hash = x => typeof x === 'string' && /^0x[0-9a-f]{64}$/.test(x);
const address = x => typeof x === 'string' && isAddress(x) && !/^0x0{40}$/i.test(x);
const pair = (a,b) => keccak256(a.toLowerCase()<b.toLowerCase()?a+b.slice(2):b+a.slice(2));

/** Deterministic allocation commitment. Never decides work quality, identity or Stock Token eligibility. */
export function buildRewardManifest({chainId,distributor,epochId,asset,policyHash,fundedRaw,entries}) {
  if(chainId!==4663||!address(distributor)||!address(asset)||!hash(policyHash)||!uint(epochId)||!uint(fundedRaw)
    ||!Array.isArray(entries)||entries.length<1||entries.length>10000)throw new Error('Invalid manifest configuration');
  const indexes=new Set(),participants=new Set();let allocated=0n;
  const allocations=entries.map(e=>{
    if(!e||Object.keys(e).sort().join(',')!=='amountRaw,index,participant'||!uint(e.index)||!uint(e.amountRaw)
      ||BigInt(e.amountRaw)===0n||!address(e.participant)||indexes.has(e.index)||participants.has(e.participant.toLowerCase()))throw new Error('Invalid or duplicate allocation');
    indexes.add(e.index);participants.add(e.participant.toLowerCase());allocated+=BigInt(e.amountRaw);
    return {index:e.index,participant:getAddress(e.participant),amountRaw:e.amountRaw};
  }).sort((a,b)=>BigInt(a.index)<BigInt(b.index)?-1:1);
  if(allocated>BigInt(fundedRaw))throw new Error('Allocations exceed declared funding');
  const manifest={version:'starport-rewards/v1',chainId,distributor:getAddress(distributor),epochId,asset:getAddress(asset),policyHash,fundedRaw,allocatedRaw:String(allocated),entries:allocations};
  const leaves=allocations.map(e=>keccak256(keccak256(encodeAbiParameters(
    [{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'},{type:'address'},{type:'address'},{type:'uint256'},{type:'bytes32'}],
    [BigInt(chainId),distributor,BigInt(epochId),BigInt(e.index),e.participant,asset,BigInt(e.amountRaw),policyHash]
  ))));
  const levels=[leaves];
  while(levels.at(-1).length>1){const level=levels.at(-1),next=[];for(let i=0;i<level.length;i+=2)next.push(i+1<level.length?pair(level[i],level[i+1]):level[i]);levels.push(next);}
  const proofs=leaves.map((leaf,i)=>{const proof=[];let index=i;for(let l=0;l<levels.length-1;l++){const sibling=index^1;if(sibling<levels[l].length)proof.push(levels[l][sibling]);index=Math.floor(index/2);}return {index:allocations[i].index,leaf,proof};});
  return {manifest,manifestHash:keccak256(stringToHex(JSON.stringify(manifest))),root:levels.at(-1)[0],proofs};
}
export function verifyRewardProof(leaf,proof,root){
  if(!hash(leaf)||!hash(root)||!Array.isArray(proof)||proof.length>32||proof.some(x=>!hash(x)))return false;
  return proof.reduce(pair,leaf)===root;
}
