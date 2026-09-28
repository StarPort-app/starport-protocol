import solc from 'solc';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('./',import.meta.url),sources={};
for(const file of ['src/StarportFeeVault.sol','test/Fixtures.sol'])sources[file]={content:await readFile(new URL(file,root),'utf8')};
if(!solc.version().startsWith('0.8.37+'))throw new Error('Unexpected compiler version');
const settings={optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}};
const compilerInput={language:'Solidity',sources,settings};
const output=JSON.parse(solc.compile(JSON.stringify(compilerInput)));
for(const error of output.errors??[]){if(error.severity==='error')throw new Error(error.formattedMessage);}
await mkdir(new URL('out/',root),{recursive:true});
// Preserve the exact compilation input for explorer verification, not a flattened rebuild.
await writeFile(new URL('out/standard-input.json',root),JSON.stringify(compilerInput,null,2)+'\n');
for(const [file,contracts] of Object.entries(output.contracts))for(const [name,c] of Object.entries(contracts)){
  if(!c.evm.bytecode.object)continue;
  await writeFile(new URL(`out/${name}.json`,root),JSON.stringify({contractName:name,source:file,compiler:solc.version(),evmVersion:'cancun',abi:c.abi,bytecode:`0x${c.evm.bytecode.object}`,deployedBytecode:`0x${c.evm.deployedBytecode.object}`,sourceSha256:createHash('sha256').update(sources[file].content).digest('hex')},null,2)+'\n');
}
console.log('Starport fee-vault artifacts built locally; no deployment or broadcast.');
