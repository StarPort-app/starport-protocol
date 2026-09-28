import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getAddress,isAddress,keccak256 } from 'viem';
const config=JSON.parse(await readFile(new URL('deployment.design.json',import.meta.url),'utf8'));
const artifact=JSON.parse(await readFile(new URL('out/StarportFeeVault.json',import.meta.url),'utf8'));
const source=await readFile(new URL('src/StarportFeeVault.sol',import.meta.url),'utf8');
if(config.chainId!==4663||config.deploymentPaused!==true||config.automaticBroadcastEnabled!==false||config.contractDeploymentAuthorizedByThisFile!==false)throw new Error('Preparation requires the deployment hold');
if(createHash('sha256').update(source).digest('hex')!==artifact.sourceSha256)throw new Error('Rebuild the contract artifact first');
const names=['feeAsset','feeEscrowReference','ponsFactoryReference','controller','payoutRecipient'];
if(![...names,'deployerAddress','keeperAddress'].every(k=>isAddress(config[k]??'')))throw new Error('Role address missing');
const plan={kind:'constructor_arguments_only',chainId:4663,deploymentPaused:true,readyToSign:false,
  deployerAddress:getAddress(config.deployerAddress),constructorArguments:names.map(k=>({name:k,address:getAddress(config[k])})),keeperAddress:getAddress(config.keeperAddress),
  compiler:artifact.compiler,sourceSha256:artifact.sourceSha256,creationCodeHash:keccak256(artifact.bytecode),
  acceptedAssetTypes:config.acceptedAssetTypes??[],emergencyRecovery:config.emergencyRecovery??null,
  unresolved:['revised emergency permissions confirmation','deployed PONS stack review','explicit deployment resume','wallet-controlled gas and deployment confirmation'],
  nonce:null,gas:null,signature:null,transactionDataNotExported:true};
await mkdir(new URL('out/',import.meta.url),{recursive:true});await writeFile(new URL('out/constructor-arguments.json',import.meta.url),JSON.stringify(plan,null,2)+'\n');
console.log('Constructor arguments prepared. Deployment stays paused; no transaction data, signing or RPC call.');
