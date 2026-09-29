import { APPROVED_STARPORT_ORIGIN, STARPORT_CUSTOM_ORIGIN, PUBLIC_PATHS, ReadOnlyClientError,
  type AnyReadResult, type ReadQueries, type ReadResource, type ReadResults } from "./types.js";
import { isCursor, isRecord, validateReadEnvelope, validateReadError } from "./validation.js";

export const READ_MAX_BYTES = 1_048_576;
export const READ_TIMEOUT_MS = 12_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SYMBOL = /^[A-Z][A-Z0-9]{0,22}(?:[.-][A-Z0-9]{1,8})?$/;
const inputError = () => new ReadOnlyClientError("INVALID_REQUEST", "Choose a supported public endpoint and bounded parameters.");
export type ReadFetch = (url: string, init: RequestInit) => Promise<Response>;
export interface ReadClientOptions {
  origin?: "same-origin" | typeof APPROVED_STARPORT_ORIGIN | typeof STARPORT_CUSTOM_ORIGIN;
  fetcher?: ReadFetch;
  timeoutMs?: number;
  now?: () => number;
}
export interface ReadOptions { signal?: AbortSignal }

/** Builds only a fixed public GET path. User values never become hosts or paths. */
export function publicReadPath<R extends ReadResource>(resource: R, query?: ReadQueries[R]): string {
  if (!Object.hasOwn(PUBLIC_PATHS,resource)) throw inputError();
  if (["capabilities","launchTarget","corporateActions","chainHead","orbitStatus"].includes(resource)) {
    if (query !== undefined) throw inputError();
    return PUBLIC_PATHS[resource];
  }
  if(resource==="starlinkOrbit"){
    const q=query??{};
    if(!isRecord(q)||Object.keys(q).some(key=>key!=="site")||q.site!==undefined&&!['london','singapore','newyork'].includes(String(q.site)))throw inputError();
    return `${PUBLIC_PATHS.starlinkOrbit}?site=${q.site??'london'}`;
  }
  const q = query ?? {};
  if (!isRecord(q)) throw inputError();
  const allowed = resource === "referencePrice" ? ["address","symbol"] : resource === "assets" ? ["limit","cursor","q"] : resource === "receipts" ? ["limit","cursor","nodeId"] : ["limit","cursor"];
  if (Object.keys(q).some(key => !allowed.includes(key))) throw inputError();
  const params = new URLSearchParams();
  if (resource === "referencePrice") {
    if (typeof q.address !== "string" || !ADDRESS.test(q.address) || /^0x0+$/.test(q.address)
      || typeof q.symbol !== "string" || q.symbol.length > 32 || !SYMBOL.test(q.symbol)) throw inputError();
    params.set("address",q.address.toLowerCase()); params.set("symbol",q.symbol);
  } else {
    const limit=q.limit ?? 20;
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit<1 || limit>100) throw inputError();
    params.set("limit",String(limit));
    if (q.cursor !== undefined) { if (!isCursor(q.cursor)) throw inputError(); params.set("cursor",q.cursor); }
    if (q.q !== undefined) {
      if (typeof q.q !== "string" || q.q.length>80 || q.q.trim().toLowerCase().length>80 || /[\u0000-\u001f\u007f]/.test(q.q)) throw inputError();
      if (q.q.trim()) params.set("q",q.q.trim());
    }
    if (q.nodeId !== undefined) { if (typeof q.nodeId !== "string" || !ID.test(q.nodeId)) throw inputError(); params.set("nodeId",q.nodeId); }
  }
  return `${PUBLIC_PATHS[resource]}?${params.toString()}`;
}

async function responseBody(response: Response, signal: AbortSignal): Promise<unknown> {
  const size=response.headers.get("content-length");
  if (size !== null && (!/^\d+$/.test(size) || Number(size)>READ_MAX_BYTES) || !response.body) throw new ReadOnlyClientError("INVALID_RESPONSE","The public response exceeds the supported size or has no body.");
  const reader=response.body.getReader();
  const chunks: Uint8Array[]=[]; let count=0, done=false;
  const cancel=() => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort",cancel,{once:true});
  try {
    if(signal.aborted) throw new ReadOnlyClientError("ABORTED","The read was cancelled.");
    while(true){const part=await reader.read(); if(part.done){done=true;break;} count+=part.value.byteLength;
      if(count>READ_MAX_BYTES) throw new ReadOnlyClientError("INVALID_RESPONSE","The public response exceeds the supported size."); chunks.push(part.value);}
    const bytes=new Uint8Array(count); let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
    catch{throw new ReadOnlyClientError("INVALID_RESPONSE","The service returned unreadable JSON.");}
  } finally {signal.removeEventListener("abort",cancel);if(!done)cancel();reader.releaseLock();}
}

function matchingResponseUrl(response: Response, path: string, origin: ReadClientOptions["origin"]): boolean {
  if(response.redirected) return false;
  if(!response.url) return true; // Injected offline Response objects have no URL.
  const expected=origin === "same-origin" ? globalThis.location?.origin : origin;
  if(!expected) return false;
  try{return response.url === new URL(path,expected).href;}catch{return false;}
}

export interface StarportReadClient {
  read<R extends ReadResource>(resource:R,query?:ReadQueries[R],options?:ReadOptions):Promise<ReadResults[R]>;
  getCapabilities(options?:ReadOptions):Promise<ReadResults["capabilities"]>;
  getLaunchTarget(options?:ReadOptions):Promise<ReadResults["launchTarget"]>;
  getAssets(query?:ReadQueries["assets"],options?:ReadOptions):Promise<ReadResults["assets"]>;
  getReferencePrice(query:ReadQueries["referencePrice"],options?:ReadOptions):Promise<ReadResults["referencePrice"]>;
  getCorporateActions(options?:ReadOptions):Promise<ReadResults["corporateActions"]>;
  getChainHead(options?:ReadOptions):Promise<ReadResults["chainHead"]>;
  getStarlinkOrbit(query?:ReadQueries["starlinkOrbit"],options?:ReadOptions):Promise<ReadResults["starlinkOrbit"]>;
  getOrbitStatus(options?:ReadOptions):Promise<ReadResults["orbitStatus"]>;
  getNodes(query?:ReadQueries["nodes"],options?:ReadOptions):Promise<ReadResults["nodes"]>;
  getReceipts(query?:ReadQueries["receipts"],options?:ReadOptions):Promise<ReadResults["receipts"]>;
}

/** No key, header, method, arbitrary host, proxy, retry, polling or write API. */
export function createStarportReadClient(options:ReadClientOptions={}):StarportReadClient {
  if(Object.keys(options).some(key=>!["origin","fetcher","timeoutMs","now"].includes(key)))throw inputError();
  const origin=options.origin ?? "same-origin";
  if(origin!=="same-origin" && origin!==APPROVED_STARPORT_ORIGIN && origin!==STARPORT_CUSTOM_ORIGIN)throw inputError();
  const timeoutMs=options.timeoutMs ?? READ_TIMEOUT_MS;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>READ_TIMEOUT_MS)throw inputError();
  const fetcher=options.fetcher ?? ((url,init)=>fetch(url,init));
  const now=options.now ?? Date.now;
  let active=0;
  const read=async <R extends ReadResource>(resource:R,query?:ReadQueries[R],readOptions:ReadOptions={}):Promise<ReadResults[R]>=>{
    const snapshot=query===undefined?undefined:{...query};
    const path=publicReadPath(resource,snapshot as ReadQueries[R]);
    if(Object.keys(readOptions).some(key=>key!=="signal"))throw inputError();
    if(readOptions.signal?.aborted)throw new ReadOnlyClientError("ABORTED","The read was cancelled.");
    if(active>=2)throw new ReadOnlyClientError("CLIENT_BUSY","Wait for an existing public read to finish.");
    const controller=new AbortController();let timedOut=false;
    const parentAbort=()=>controller.abort();readOptions.signal?.addEventListener("abort",parentAbort,{once:true});
    let rejectAbort:()=>void=()=>{};
    const cancelled=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(new ReadOnlyClientError(timedOut?"TIMEOUT":"ABORTED",timedOut?"The public read timed out. No automatic retry was made.":"The read was cancelled."));controller.signal.addEventListener("abort",rejectAbort,{once:true});});
    let timer:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new ReadOnlyClientError("TIMEOUT","The public read timed out. No automatic retry was made."));},timeoutMs);});
    active++;
    const work=Promise.resolve().then(async()=>{
      if(controller.signal.aborted)throw new ReadOnlyClientError("ABORTED","The read was cancelled.");
      const response=await fetcher(origin==="same-origin"?path:`${origin}${path}`,{method:"GET",headers:{Accept:"application/json"},credentials:"omit",redirect:"error",cache:"no-store",signal:controller.signal});
      if(!matchingResponseUrl(response,path,origin)||!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type")??"")) {
        void response.body?.cancel().catch(()=>undefined);throw new ReadOnlyClientError("INVALID_RESPONSE","The public response has an unexpected destination or format.");
      }
      const payload=await responseBody(response,controller.signal);
      if(!response.ok){const detail=validateReadError(payload);throw new ReadOnlyClientError(detail.code,detail.message,response.status,detail);}
      if(response.status!==200)throw new ReadOnlyClientError("INVALID_RESPONSE","The service returned an unexpected success status.");
      const value=validateReadEnvelope(resource,payload,now());
      if(resource==="referencePrice"){
        const price=value as ReadResults["referencePrice"];const identity=snapshot as ReadQueries["referencePrice"];
        if(price.data.assetAddress.toLowerCase()!==identity.address.toLowerCase()||price.data.symbol!==identity.symbol)throw new ReadOnlyClientError("INVALID_RESPONSE","The reference price does not match the requested asset.");
      } else if(resource==="starlinkOrbit"){
        const orbit=value as ReadResults["starlinkOrbit"];
        const expected=(snapshot as ReadQueries["starlinkOrbit"]|undefined)?.site??'london';
        if(orbit.data.site!==expected)throw new ReadOnlyClientError("INVALID_RESPONSE","The orbital reference location does not match the request.");
      } else if(resource==="assets"||resource==="nodes"||resource==="receipts"){
        const page=value as ReadResults["assets"|"nodes"|"receipts"];const q=snapshot as {cursor?:string;limit?:number;nodeId?:string}|undefined;
        if(page.data.length>(q?.limit??20)||q?.cursor!==undefined&&page.nextCursor===q.cursor)throw new ReadOnlyClientError("INVALID_RESPONSE","The page or cursor is inconsistent with the request.");
        if(resource==="assets"&&!q?.cursor&&page.nextCursor===null&&page.data.length!==(page as ReadResults["assets"]).total)throw new ReadOnlyClientError("INVALID_RESPONSE","The first asset page is incomplete.");
        if(resource==="receipts"&&q?.nodeId&&(page as ReadResults["receipts"]).data.some(item=>item.nodeId!==q.nodeId))throw new ReadOnlyClientError("INVALID_RESPONSE","The receipt page does not match the selected node.");
      }
      return value;
    }).finally(()=>{active--;});
    try{return await Promise.race([work,deadline,cancelled]);}
    catch(error){if(timedOut)throw new ReadOnlyClientError("TIMEOUT","The public read timed out. No automatic retry was made.");if(controller.signal.aborted)throw new ReadOnlyClientError("ABORTED","The read was cancelled.");if(error instanceof ReadOnlyClientError)throw error;throw new ReadOnlyClientError("NETWORK_UNAVAILABLE","The public service could not be reached.");}
    finally{clearTimeout(timer);controller.signal.removeEventListener("abort",rejectAbort);readOptions.signal?.removeEventListener("abort",parentAbort);}
  };
  return Object.freeze({read,getCapabilities:(o?:ReadOptions)=>read("capabilities",undefined,o),getLaunchTarget:(o?:ReadOptions)=>read("launchTarget",undefined,o),
    getAssets:(q?:ReadQueries["assets"],o?:ReadOptions)=>read("assets",q,o),getReferencePrice:(q:ReadQueries["referencePrice"],o?:ReadOptions)=>read("referencePrice",q,o),
    getCorporateActions:(o?:ReadOptions)=>read("corporateActions",undefined,o),getChainHead:(o?:ReadOptions)=>read("chainHead",undefined,o),getStarlinkOrbit:(q?:ReadQueries["starlinkOrbit"],o?:ReadOptions)=>read("starlinkOrbit",q,o),getOrbitStatus:(o?:ReadOptions)=>read("orbitStatus",undefined,o),
    getNodes:(q?:ReadQueries["nodes"],o?:ReadOptions)=>read("nodes",q,o),getReceipts:(q?:ReadQueries["receipts"],o?:ReadOptions)=>read("receipts",q,o)});
}

/** Optional manual-pagination guard. Never merges changing snapshots silently. */
export function assertPageContinuation(resource:"assets"|"nodes"|"receipts",previous:AnyReadResult,incoming:AnyReadResult,cursor:string):void{
  if(!isCursor(cursor)||!("nextCursor" in previous)||!("nextCursor" in incoming)||previous.nextCursor!==cursor||incoming.nextCursor===cursor
    ||!Array.isArray(previous.data)||!Array.isArray(incoming.data))throw new ReadOnlyClientError("CURSOR_CHANGED","The page sequence changed. Start a new first-page read.");
  if(resource==="assets"&&(previous.meta.checkpoint!==incoming.meta.checkpoint||previous.meta.observedAt!==incoming.meta.observedAt
    ||(previous as ReadResults["assets"]).total!==(incoming as ReadResults["assets"]).total))throw new ReadOnlyClientError("CURSOR_CHANGED","The asset snapshot changed. Start a new first-page read.");
  const identity=(value:unknown)=>{if(!isRecord(value))return "";return resource==="assets"&&isRecord(value.asset)?String(value.asset.address):String(value.id);};
  const ids=new Set(previous.data.map(identity));
  if(incoming.data.some(row=>ids.has(identity(row))))throw new ReadOnlyClientError("CURSOR_CHANGED","The next page repeats an already displayed identity.");
}
