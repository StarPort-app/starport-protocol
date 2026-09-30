import { encodeFunctionData, isAddress } from 'viem';
const NATIVE_ETH='0x0000000000000000000000000000000000000000';
const abi=[{type:'function',name:'collectFees',inputs:[],outputs:[{type:'uint256'}],stateMutability:'nonpayable'}];
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const uint=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v)&&BigInt(v)<2n**256n;

/** Inert decision module. A trusted adapter must obtain and verify the snapshot.
 * Does not sign, broadcast, retry a pending transaction, sweep, convert or spend. */
export function planCollection(config,snapshot,now=Date.now()){
  if(!config?.vaultAddress||!config?.escrowAddress)return {action:'disabled',reason:'vault_not_deployed'};
  if(!isAddress(config.vaultAddress)||!isAddress(config.escrowAddress)||!/^0x[0-9a-f]{64}$/.test(config.vaultCodeHash??'')
    ||snapshot?.chainId!==4663||!same(snapshot.vaultAddress,config.vaultAddress)||!same(snapshot.feeEscrow,config.escrowAddress)
    ||!same(snapshot.feeAsset,NATIVE_ETH)||!same(snapshot.creatorFeeRecipient,config.vaultAddress)
    ||snapshot.vaultCodeHash!==config.vaultCodeHash||!/^0x[0-9a-f]{64}$/.test(snapshot.blockHash??'')
    ||typeof snapshot.collectionPaused!=='boolean'||typeof snapshot.emergencyMode!=='boolean'||typeof snapshot.pendingSubmission!=='boolean'
    ||!Number.isFinite(Date.parse(snapshot.observedAt))||Date.parse(snapshot.observedAt)>now||now-Date.parse(snapshot.observedAt)>60000)return {action:'disabled',reason:'binding_unverified'};
  if(snapshot.pendingSubmission===true)return {action:'reconcile',reason:'existing_submission'};
  if(snapshot.emergencyMode===true)return {action:'wait',reason:'emergency_mode'};
  if(snapshot.collectionPaused===true)return {action:'wait',reason:'collection_paused'};
  if(![snapshot.claimableRaw,snapshot.keeperEthWei,snapshot.estimatedGasWei,config.minimumClaimRaw??'0'].every(uint))return {action:'disabled',reason:'invalid_amount'};
  if(BigInt(snapshot.claimableRaw)===0n)return {action:'wait',reason:'nothing_claimable_not_proof_of_zero_unswept_fees'};
  if(BigInt(snapshot.claimableRaw)<BigInt(config.minimumClaimRaw??'0'))return {action:'wait',reason:'configured_batch_threshold'};
  if(BigInt(snapshot.estimatedGasWei)===0n||BigInt(snapshot.keeperEthWei)<BigInt(snapshot.estimatedGasWei))return {action:'wait',reason:'keeper_eth_required'};
  return {action:'prepare',expectedClaimRaw:snapshot.claimableRaw,observedBlockHash:snapshot.blockHash,
    transaction:{chainId:4663,to:config.vaultAddress,data:encodeFunctionData({abi,functionName:'collectFees'}),value:'0'}};
}
