import {getAddress,isAddress,hashTypedData,keccak256,stringToHex} from 'viem';
export const INVOICE_TYPES={InvoiceTerms:[
  {name:'invoiceId',type:'bytes32'},{name:'version',type:'uint64'},{name:'issuer',type:'address'},
  {name:'payee',type:'address'},{name:'asset',type:'address'},{name:'amountRaw',type:'uint256'},
  {name:'authorizedPayer',type:'address'},{name:'expiresAt',type:'uint256'},{name:'termsHash',type:'bytes32'},
]};
const zero='0x'+'0'.repeat(40);
function uint(value,bits){if(typeof value!=='string'||value.length>78||!/^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>=2n**BigInt(bits))throw Error('Invalid raw integer');return BigInt(value);}
function address(value,allowZero=false){if(typeof value!=='string'||!isAddress(value)||(!allowZero&&value.toLowerCase()===zero))throw Error('Invalid address');return getAddress(value);}
function digest(value){if(typeof value!=='string'||!/^0x[0-9a-f]{64}$/.test(value)||value==='0x'+'0'.repeat(64))throw Error('Invalid commitment');return value;}
export function invoiceIdFor(id){if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id))throw Error('Invalid invoice id');return keccak256(stringToHex('StarportInvoice:'+id));}
/** Builds issuer request terms only. Never signs, approves funds, reads a wallet or broadcasts. */
export function invoiceTypedData({chainId,router,terms}){
  if(chainId!==4663||!terms||Object.keys(terms).sort().join(',')!==INVOICE_TYPES.InvoiceTerms.map(x=>x.name).sort().join(','))throw Error('Invalid invoice configuration');
  const message={invoiceId:digest(terms.invoiceId),version:uint(terms.version,64),issuer:address(terms.issuer),payee:address(terms.payee),asset:address(terms.asset),amountRaw:uint(terms.amountRaw,256),authorizedPayer:address(terms.authorizedPayer,true),expiresAt:uint(terms.expiresAt,256),termsHash:digest(terms.termsHash)};
  if(message.version===0n||message.amountRaw===0n||message.expiresAt===0n)throw Error('Invalid invoice amount, version or expiry');
  return {domain:{name:'Starport Pay',version:'1',chainId,verifyingContract:address(router)},types:INVOICE_TYPES,primaryType:'InvoiceTerms',message};
}
export const hashInvoiceTerms=config=>hashTypedData(invoiceTypedData(config));
