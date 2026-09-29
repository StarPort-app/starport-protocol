import { createPublicClient,http,parseAbi,keccak256,isAddress } from 'viem';
import { planCollection } from './collection-plan.mjs';
const NATIVE_ETH='0x0000000000000000000000000000000000000000';
const HASH=/^0x[0-9a-f]{64}$/;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const vaultAbi=parseAbi(['function feeAsset() view returns (address)','function feeEscrow() view returns (address)','function ponsFactory() view returns (address)',
  'function controller() view returns (address)','function payoutRecipient() view returns (address)','function collectionPaused() view returns (bool)','function emergencyMode() view returns (bool)','function claimable() view returns (uint256)',
  'function collectFees() returns (uint256)']);
const escrowAbi=parseAbi(['function balanceOf(address recipient) view returns (uint256)']);
const factoryAbi=parseAbi(['struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }',
  'function getLaunchedToken(address token) view returns (LaunchedToken)']);

export function preparationBlocker(config){
  if(config?.deploymentPaused!==false)return 'deployment_paused';
  if(config.emergencyPermissionsReviewed!==true)return 'emergency_permissions_review_required';
  if(config.chainId!==4663||config.keeperMode!=='observe-only'||config.automaticBroadcastEnabled!==false||config.automaticConversionEnabled!==false)return 'unsafe_mode';
  if(!config.vaultAddress)return 'vault_not_deployed';
  if(!config.projectTokenAddress)return 'SPORT_not_launched';
  if(![config.vaultAddress,config.projectTokenAddress,config.feeAsset,config.feeEscrowReference,config.ponsFactoryReference,config.controller,config.payoutRecipient,config.keeperAddress].every(a=>typeof a==='string'&&isAddress(a)))return 'invalid_address';
  if(!same(config.feeAsset,NATIVE_ETH)||same(config.keeperAddress,config.controller)||same(config.keeperAddress,config.payoutRecipient)||config.creatorTaxBps!==100)return 'role_or_asset_mismatch';
  if(![config.vaultCodeHash,config.feeEscrowCodeHash,config.ponsFactoryCodeHash].every(v=>typeof v==='string'&&HASH.test(v))||config.deployedStackCompatibilityVerified!==true)return 'stack_review_required';
  return null;
}

/** The only network adapter is an exact-host Alchemy public client: no wallet client or signer. */
export function createObserverClient(endpoint){
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.hostname!=='robinhood-mainnet.g.alchemy.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/v2\/[A-Za-z0-9_-]+$/.test(url.pathname))throw new Error('Observer RPC is not configured');
  return createPublicClient({transport:http(url.href,{retryCount:0,timeout:8000})});
}

/** Reads one coherent block, prepares an unsigned collect call and never broadcasts. */
export async function observeCollection(config,client,{pendingSubmission=false,now=Date.now}={}){
  const blocker=preparationBlocker(config);if(blocker)return {action:'disabled',reason:blocker};
  if(pendingSubmission)return {action:'reconcile',reason:'existing_submission'};
  if(!client)throw new Error('Observer unavailable');
  const chainId=await client.getChainId();if(chainId!==4663)throw new Error('Wrong chain');
  const block=await client.getBlock({blockTag:'latest'});
  if(!HASH.test(block.hash??'')||typeof block.number!=='bigint'||typeof block.timestamp!=='bigint'
    ||Number(block.timestamp)*1000>now()+30000||now()-Number(block.timestamp)*1000>120000)throw new Error('Stale chain observation');
  const blockNumber=block.number;
  const codeChecks=[[config.vaultAddress,config.vaultCodeHash],[config.feeEscrowReference,config.feeEscrowCodeHash],[config.ponsFactoryReference,config.ponsFactoryCodeHash]];
  for(const [address,expected] of codeChecks){const code=await client.getBytecode({address,blockNumber});if(!code||code==='0x'||keccak256(code)!==expected)throw new Error('Reviewed code changed');}
  const fields=['feeAsset','feeEscrow','ponsFactory','controller','payoutRecipient','collectionPaused','emergencyMode','claimable'];
  const [asset,escrow,factory,controller,payout,paused,emergency,claimable]=await Promise.all(fields.map(functionName=>client.readContract({address:config.vaultAddress,abi:vaultAbi,functionName,blockNumber})));
  if(!same(asset,config.feeAsset)||!same(escrow,config.feeEscrowReference)||!same(factory,config.ponsFactoryReference)||!same(controller,config.controller)||!same(payout,config.payoutRecipient)||typeof paused!=='boolean'||typeof emergency!=='boolean'||typeof claimable!=='bigint')throw new Error('Vault binding changed');
  const [launch,escrowOwed,keeperEth]=await Promise.all([
    client.readContract({address:factory,abi:factoryAbi,functionName:'getLaunchedToken',args:[config.projectTokenAddress],blockNumber}),
    client.readContract({address:escrow,abi:escrowAbi,functionName:'balanceOf',args:[config.vaultAddress],blockNumber}),
    client.getBalance({address:config.keeperAddress,blockNumber}),
  ]);
  if(!launch.exists||!same(launch.token,config.projectTokenAddress)||!same(launch.creatorFeeRecipient,config.vaultAddress)||!same(launch.pairToken,asset)||Number(launch.creatorTaxBps)!==100||escrowOwed!==claimable)throw new Error('PONS beneficiary binding changed');
  let estimatedGasWei=0n;
  if(!paused&&!emergency&&claimable>0n){const [gas,price]=await Promise.all([client.estimateContractGas({account:config.keeperAddress,address:config.vaultAddress,abi:vaultAbi,functionName:'collectFees'}),client.getGasPrice()]);estimatedGasWei=gas*price;}
  const recheck=await client.getBlock({blockNumber});if(recheck.hash!==block.hash)throw new Error('Observation reorganized');
  const snapshot={chainId,vaultAddress:config.vaultAddress,feeEscrow:escrow,feeAsset:asset,creatorFeeRecipient:launch.creatorFeeRecipient,vaultCodeHash:config.vaultCodeHash,
    blockHash:block.hash,blockNumber:blockNumber.toString(),observedAt:new Date(now()).toISOString(),claimableRaw:claimable.toString(),keeperEthWei:keeperEth.toString(),estimatedGasWei:estimatedGasWei.toString(),collectionPaused:paused||emergency,emergencyMode:emergency,pendingSubmission:false};
  const decision=planCollection({vaultAddress:config.vaultAddress,escrowAddress:escrow,vaultCodeHash:config.vaultCodeHash,minimumClaimRaw:config.minimumClaimRaw},snapshot,now());
  return {...decision,snapshot,gasEstimateIsReference:true,unsweptFeeAssessment:'not_included'};
}
