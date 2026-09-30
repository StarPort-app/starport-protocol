import { PUBLIC_PATHS, READ_API_VERSION, ReadOnlyClientError,
  type AnyReadResult, type PublicReadError, type ReadResource, type ReadResults, type SourceMeta } from "./types.js";

const SOURCES = ["onchain","issuer_api","orbital_catalog","node_statement","design_fixture","application_db","indexer","mixed"];
const CONFIRMATIONS = ["not_applicable","pending","included","confirmed","finalized","reorged","unknown"];
const CAPABILITIES = ["trade","delegation","exit_request","withdrawal","reward_claim","payment","node_enrollment","mission_participation","developer_access"];
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISSUER = "https://api.robinhood.com/rhj/assets";
function fail(): never { throw new ReadOnlyClientError("INVALID_RESPONSE", "The service returned incomplete or inconsistent public data."); }
export function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== keys.sort().join(",")) fail();
  return value;
}
function text(value: unknown, max = 512, min = 1): value is string { return typeof value === "string" && value.length >= min && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); }
function oneOf(value: unknown, values: readonly unknown[]): boolean { return values.includes(value); }
function integer(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function address(value: unknown): value is string { return typeof value === "string" && ADDRESS.test(value) && !/^0x0+$/.test(value); }
function uint(value: unknown): value is string { return typeof value === "string" && /^[1-9][0-9]{0,77}$/.test(value) && BigInt(value) < (1n << 256n); }
function nullableUInt(value: unknown): boolean { return value === null || uint(value); }
function nullableText(value: unknown, max: number): boolean { return value === null || text(value, max); }
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value); return Number.isFinite(time) && new Date(time).toISOString() === value;
}
export function isCursor(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(value); }
const nullableTime = (value: unknown): boolean => value === null || isTimestamp(value);
function sourceTime(value: unknown, now: number): value is string { return isTimestamp(value) && Date.parse(value) <= now + 60_000; }

function metadata(value: unknown, now: number): SourceMeta {
  const m = object(value, ["environment","schemaVersion","source","observedAt","observedBlock","confirmationState","freshness","checkpoint","requestId"]);
  if (!oneOf(m.environment, ["preview","testnet","mainnet"]) || m.schemaVersion !== READ_API_VERSION || !oneOf(m.source, SOURCES)
    || !(m.observedAt === null || sourceTime(m.observedAt, now)) || !(m.observedBlock === null || typeof m.observedBlock === "string" && /^\d{1,78}$/.test(m.observedBlock))
    || !oneOf(m.confirmationState, CONFIRMATIONS) || !oneOf(m.freshness, ["fresh","stale","unknown"])
    || !nullableText(m.checkpoint,128) || !text(m.requestId,128)) fail();
  return m as unknown as SourceMeta;
}

function catalogAsset(value: unknown): void {
  const r = object(value, ["asset","kind","issuerMetadataUri","multiplierRaw","multiplierDecimals","marketStatus","marketContext","issuer"]);
  const a = object(r.asset, ["chainId","address","symbol","decimals","decimalsVerified"]);
  const i = object(r.issuer, ["id","name","status","isin","pendingMultiplierRaw","pendingMultiplierEffectiveAt"]);
  if (a.chainId !== 4663 || !address(a.address) || a.address !== a.address.toLowerCase() || !text(a.symbol,32) || !integer(a.decimals,0,255) || a.decimalsVerified !== false
    || r.kind !== "stock_token" || r.issuerMetadataUri !== ISSUER || !nullableUInt(r.multiplierRaw) || r.multiplierDecimals !== 18 || r.marketStatus !== "unknown" || r.marketContext !== null
    || !hash(i.id) || !text(i.name,256) || !oneOf(i.status,["active","inactive","unknown"]) || !(i.isin === null || typeof i.isin === "string" && /^[A-Za-z0-9]{1,32}$/.test(i.isin))
    || !nullableUInt(i.pendingMultiplierRaw) || !nullableTime(i.pendingMultiplierEffectiveAt) || (i.pendingMultiplierRaw === null) !== (i.pendingMultiplierEffectiveAt === null)) fail();
}
function publicNode(value: unknown): void {
  const n = object(value, ["id","operatorId","capability","enrollmentStatus","serviceState","evidenceReferences","lastProbeAt","policyVersion","operatorIndependence","registrationSource","approximateRegion"]);
  if (!text(n.id,128) || !ID.test(n.id) || !text(n.operatorId,128) || !oneOf(n.capability,["starlink_gateway","rf_observer","evidence_reviewer"])
    || n.enrollmentStatus !== "approved" || !oneOf(n.serviceState,["unknown","available","degraded","offline"])
    || !Array.isArray(n.evidenceReferences) || n.evidenceReferences.length !== 0 || !nullableTime(n.lastProbeAt)
    || !text(n.policyVersion,128) || !oneOf(n.operatorIndependence,["unverified","reviewed"]) || !text(n.registrationSource,255)
    || n.approximateRegion !== null) fail();
}
function publicReceipt(value: unknown): void {
  const r = object(value, ["id","nodeId","statementDigest","statementScope","evidenceLevel","observedAt","chainResult"]);
  if (!text(r.id,128) || !ID.test(r.id) || !text(r.nodeId,128) || !ID.test(r.nodeId) || !hash(r.statementDigest) || !text(r.statementScope,500)
    || !oneOf(r.evidenceLevel,["self_reported","independently_observed","chain_confirmed"]) || !isTimestamp(r.observedAt)
    || !oneOf(r.chainResult,["unknown","not_submitted","included","confirmed","finalized","reverted","reorged"])) fail();
}
function decimal(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,35})(?:\.[0-9]{1,18})?$/.test(value)) fail();
  const [whole, fraction=""] = value.split("."); return BigInt(whole!) * 10n ** 18n + BigInt(fraction.padEnd(18,"0"));
}
function corporateActions(value: unknown, meta: SourceMeta, now: number): void {
  const data=object(value,["sourceUrl","fetchedAt","sourceCount","supportedCount","actions"]);
  if(data.sourceUrl!=="https://api.robinhood.com/rhj/corporate-actions"||!sourceTime(data.fetchedAt,now)
    ||meta.source!=="issuer_api"||meta.observedAt!==data.fetchedAt||meta.freshness!=="fresh"||meta.checkpoint!==null
    ||!integer(data.sourceCount,0,2000)||!integer(data.supportedCount,0,data.sourceCount)
    ||!Array.isArray(data.actions)||data.actions.length>20||data.actions.length>data.supportedCount)fail();
  const seen=new Set<string>();
  for(const row of data.actions){
    const a=object(row,["id","tokenSymbol","kind","status","processDate","underlyingSymbol","rate","oldRate","newRate"]);
    if(!hash(a.id)||seen.has(a.id)||typeof a.tokenSymbol!=="string"||!/^[A-Z][A-Z0-9]{0,22}(?:[.-][A-Z0-9]{1,8})?$/.test(a.tokenSymbol)
      ||typeof a.underlyingSymbol!=="string"||!/^[A-Z][A-Z0-9]{0,22}(?:[.-][A-Z0-9]{1,8})?$/.test(a.underlyingSymbol)
      ||!oneOf(a.kind,["cash_dividend","stock_dividend","forward_split","reverse_split"])
      ||!oneOf(a.status,["in_progress","completed"])
      ||!(a.processDate===null||typeof a.processDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(a.processDate)
        &&Number.isFinite(Date.parse(`${a.processDate}T00:00:00.000Z`))
        &&new Date(`${a.processDate}T00:00:00.000Z`).toISOString().slice(0,10)===a.processDate))fail();
    const split=a.kind==="forward_split"||a.kind==="reverse_split";
    if(split?a.rate!==null||decimal(a.oldRate)<=0n||decimal(a.newRate)<=0n
      :decimal(a.rate)<0n||a.oldRate!==null||a.newRate!==null)fail();
    seen.add(a.id);
  }
}
function starlinkOrbit(value: unknown, meta: SourceMeta, now: number): void {
  const d=object(value,["sourceUrl","sourceFetchedAt","sourceEpochStart","sourceEpochEnd","elementCount","catalogSha256","sampledCount","site","siteLabel","computedAt","model","evidenceLevel","refreshPaused","passes"]);
  const labels={london:"London · reference location",singapore:"Singapore · reference location",newyork:"New York · reference location"};
  if(d.sourceUrl!=="https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON"
    ||!sourceTime(d.sourceFetchedAt,now)||meta.source!=="orbital_catalog"||meta.observedAt!==d.sourceFetchedAt
    ||!oneOf(meta.freshness,["fresh","stale"])||!hash(d.catalogSha256)||meta.checkpoint!==d.catalogSha256
    ||!isTimestamp(d.sourceEpochStart)||!isTimestamp(d.sourceEpochEnd)||d.sourceEpochStart>d.sourceEpochEnd
    ||!integer(d.elementCount,1,20000)||!integer(d.sampledCount,1,Math.min(256,d.elementCount))
    ||!oneOf(d.site,Object.keys(labels))||d.siteLabel!==labels[d.site as keyof typeof labels]
    ||!sourceTime(d.computedAt,now)||d.model!=="SGP4"||d.evidenceLevel!=="predicted_from_public_gp"
    ||typeof d.refreshPaused!=="boolean"||!Array.isArray(d.passes)||d.passes.length>3)fail();
  const seen=new Set<string>();
  for(const entry of d.passes){
    const pass=object(entry,["noradId","name","windowStart","peakAt","maxElevationDeg"]);
    if(!integer(pass.noradId,1,999999999)||!text(pass.name,80)||!/^STARLINK-[A-Z0-9-]+$/i.test(pass.name)
      ||!isTimestamp(pass.windowStart)||!isTimestamp(pass.peakAt)||pass.windowStart>pass.peakAt
      ||typeof pass.maxElevationDeg!=="number"||!Number.isFinite(pass.maxElevationDeg)||pass.maxElevationDeg<10||pass.maxElevationDeg>90
      ||seen.has(`${pass.noradId}:${pass.peakAt}`))fail();
    seen.add(`${pass.noradId}:${pass.peakAt}`);
  }
}
function orbitStatus(value: unknown, meta: SourceMeta, now: number): void {
  const d=object(value,["sourceUrl","checkedAt","cacheState","refreshState","nextEligibleAt","lastFetchedAt"]);
  if(d.sourceUrl!=="https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON"
    ||!sourceTime(d.checkedAt,now)||meta.source!=="application_db"||meta.observedAt!==d.checkedAt
    ||meta.freshness!=="fresh"||meta.checkpoint!==null
    ||!oneOf(d.cacheState,["none","usable","stale"])
    ||!oneOf(d.refreshState,["eligible","lease_active","manual_review"])
    ||!(d.nextEligibleAt===null||isTimestamp(d.nextEligibleAt))
    ||!(d.lastFetchedAt===null||isTimestamp(d.lastFetchedAt))
    ||(d.refreshState==="lease_active")!==(d.nextEligibleAt!==null)
    ||d.nextEligibleAt!==null&&d.nextEligibleAt<=d.checkedAt
    ||d.lastFetchedAt!==null&&d.lastFetchedAt>d.checkedAt
    ||(d.cacheState==="none")!==(d.lastFetchedAt===null))fail();
}
function chainHead(value: unknown, meta: SourceMeta, now: number): void {
  const data=object(value,["chainId","blockNumber","blockHash","blockTimestamp","fetchedAt","provider"]);
  if(data.chainId!==4663||data.provider!=="alchemy"||!uint(data.blockNumber)||!hash(data.blockHash)
    ||!isTimestamp(data.blockTimestamp)||!sourceTime(data.fetchedAt,now)
    ||Date.parse(data.blockTimestamp)>Date.parse(data.fetchedAt)+60000||Date.parse(data.blockTimestamp)<Date.parse(data.fetchedAt)-120000
    ||meta.source!=="onchain"||meta.observedBlock!==data.blockNumber||meta.observedAt!==data.fetchedAt
    ||meta.confirmationState!=="included"||meta.freshness!=="fresh"||meta.checkpoint!==null)fail();
}
/** Strict public projection. Unknown/private extra fields are rejected, not displayed. */
export function validateReadEnvelope<R extends ReadResource>(resource: R, value: unknown, now = Date.now()): ReadResults[R] {
  if (!Object.hasOwn(PUBLIC_PATHS,resource) || !Number.isFinite(now)) fail();
  const paged = resource === "assets" || resource === "nodes" || resource === "receipts";
  const e = object(value,paged ? resource === "assets" ? ["data","meta","nextCursor","total"] : ["data","meta","nextCursor"] : ["data","meta"]);
  const meta = metadata(e.meta,now);
  if (meta.environment !== "preview" || resource!=="chainHead" && (meta.observedBlock !== null || meta.confirmationState !== "not_applicable")) fail();
  if (paged) {
    if (!Array.isArray(e.data) || e.data.length > 100 || !(e.nextCursor === null || isCursor(e.nextCursor)) || e.data.length === 0 && e.nextCursor !== null) fail();
    const seen = new Set<string>(); let last = "";
    for (const entry of e.data) {
      if (resource === "assets") catalogAsset(entry); else if (resource === "nodes") publicNode(entry); else publicReceipt(entry);
      const row = entry as Record<string,unknown>;
      const id = resource === "assets" ? String((row.asset as Record<string,unknown>).address) : String(row.id);
      if (seen.has(id) || resource !== "assets" && last !== "" && id <= last) fail(); seen.add(id); last = id;
    }
    if (resource === "assets") {
      if (meta.source !== "issuer_api" || !meta.observedAt || !oneOf(meta.freshness,["fresh","stale"]) || !/^issuer-assets:[0-9a-f]{64}$/.test(meta.checkpoint ?? "")
        || !integer(e.total,0,5000) || e.total < e.data.length) fail();
    } else if (meta.source !== "application_db" || !meta.observedAt || meta.freshness !== "unknown" || meta.checkpoint !== null) fail();
  } else if (resource === "capabilities") {
    const d=object(e.data,["environment","chainId","capabilities","schemaVersion","financialExecutionEnabled"]);
    if (d.environment !== meta.environment || d.chainId !== 4663 || d.schemaVersion !== READ_API_VERSION || d.financialExecutionEnabled !== false
      || !Array.isArray(d.capabilities) || d.capabilities.length !== CAPABILITIES.length || !oneOf(meta.source,["design_fixture","application_db"])) fail();
    const names=new Set();
    for (const value of d.capabilities) { const c=object(value,["name","state","reasonCode"]);
      if (!oneOf(c.name,CAPABILITIES) || names.has(c.name) || !oneOf(c.state,["unconfigured","disabled","read_only","enabled","paused"]) || !nullableText(c.reasonCode,128)
        || c.name !== "node_enrollment" && c.state === "enabled") fail(); names.add(c.name); }
    if (meta.source === "design_fixture" ? meta.observedAt !== null || meta.freshness !== "unknown" : !meta.observedAt || meta.freshness !== "fresh") fail();
  } else if (resource === "launchTarget") {
    const d=object(e.data,["chainId","quoteAsset","creatorTaxBps","creatorTaxRule","projectTokenAddress","projectTokenTicker","evidenceDocument","launchEnabled","treasuryRecipientTarget","actualCreatorFeeRecipient","creatorRecipientBindingStatus"]);
    const a=object(d.quoteAsset,["chainId","address","kind","symbol","decimals","decimalsVerified"]);
    if (meta.source !== "design_fixture" || meta.observedAt !== null || meta.freshness !== "unknown" || meta.checkpoint !== null
      || d.chainId !== 4663 || d.creatorTaxBps !== 50 || d.creatorTaxRule !== "source_confirmed" || d.projectTokenAddress !== null || d.projectTokenTicker !== "SPORT"
      || d.evidenceDocument !== "docs/pons-eth.md" || d.launchEnabled !== false || d.treasuryRecipientTarget !== null || d.actualCreatorFeeRecipient !== null
      || d.creatorRecipientBindingStatus !== "pending_vault_deployment_and_PONS_binding" || a.chainId !== 4663 || a.address !== null || a.kind !== "native" || a.symbol !== "ETH" || a.decimals !== 18 || a.decimalsVerified !== true) fail();
  } else if (resource === "referencePrice") {
    const d=object(e.data,["chainId","assetAddress","symbol","bid","ask","currency","isTradingHalt","generatedAt","fetchedAt","expiresAt","sourceUrl","priceBasis","multiplierAdjusted","executable"]);
    if (d.chainId !== 4663 || !address(d.assetAddress) || !text(d.symbol,32) || !/^[A-Z][A-Z0-9]{0,22}(?:[.-][A-Z0-9]{1,8})?$/.test(d.symbol)
      || d.currency !== "USD" || typeof d.isTradingHalt !== "boolean" || !sourceTime(d.generatedAt,now) || !sourceTime(d.fetchedAt,now) || !isTimestamp(d.expiresAt)
      || Date.parse(d.generatedAt) > Date.parse(d.fetchedAt)+5000 || Date.parse(d.expiresAt) <= Date.parse(d.fetchedAt)
      || Date.parse(d.expiresAt) > Math.min(Date.parse(d.fetchedAt)+15000,Date.parse(d.generatedAt)+60000)
      || d.sourceUrl !== `https://api.robinhood.com/rhj/prices/${encodeURIComponent(d.symbol)}` || d.priceBasis !== "underlying_equity" || d.multiplierAdjusted !== false || d.executable !== false
      || meta.source !== "issuer_api" || meta.observedAt !== d.generatedAt || meta.freshness !== "fresh" || meta.checkpoint !== null) fail();
    const bid=decimal(d.bid); if (bid <= 0n || decimal(d.ask) < bid) fail();
  } else if (resource === "corporateActions") {
    corporateActions(e.data,meta,now);
  } else if (resource === "chainHead") {
    chainHead(e.data,meta,now);
  } else if (resource === "starlinkOrbit") {
    starlinkOrbit(e.data,meta,now);
  } else if (resource === "orbitStatus") {
    orbitStatus(e.data,meta,now);
  }
  return structuredClone(e) as unknown as ReadResults[R];
}

const READ_ERRORS=["UNCONFIGURED","UNAUTHORIZED","FORBIDDEN","NOT_FOUND","VALIDATION_ERROR","STALE_DATA","UPSTREAM_UNAVAILABLE","RATE_LIMITED","CAPABILITY_DISABLED","WRONG_CHAIN"];
export function validateReadError(value: unknown): PublicReadError {
  const e=object(value,["code","message","requestId","retryable","retryAfterSeconds","resourceId","recoveryAction"]);
  if (!oneOf(e.code,READ_ERRORS) || !text(e.message,2000) || !text(e.requestId,128) || typeof e.retryable !== "boolean"
    || !(e.retryAfterSeconds === null || integer(e.retryAfterSeconds,0,3600)) || !nullableText(e.resourceId,128)
    || !oneOf(e.recoveryAction,["correct_input","authenticate","switch_chain","refresh","wait","reconcile_existing","review_terms","manual_review","none"])
    || e.retryable === true && !oneOf(e.code,["UPSTREAM_UNAVAILABLE","RATE_LIMITED"])) fail();
  return e as unknown as PublicReadError;
}

/** Local age classification never rewrites source timestamps or enables a quote. */
export function readFreshness(resource: ReadResource, envelope: AnyReadResult, now=Date.now()): "fresh" | "stale" | "unknown" {
  if (resource === "referencePrice") {
    const expiry=(envelope.data as {expiresAt?:string}).expiresAt;
    return expiry && Date.parse(expiry)>now && envelope.meta.freshness === "fresh" ? "fresh" : "stale";
  }
  if (envelope.meta.freshness !== "fresh") return envelope.meta.freshness;
  const observed=envelope.meta.observedAt === null ? NaN : Date.parse(envelope.meta.observedAt);
  const maxAge=resource==="chainHead"?30000:resource==="corporateActions"?3600000:resource==="starlinkOrbit"?7200000:300000;
  return Number.isFinite(observed) && now-observed<maxAge ? "fresh" : "stale";
}
