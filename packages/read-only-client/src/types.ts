/** Version pin for the implemented public reads; not the full mutation design. */
export const READ_API_VERSION = "0.6.1-creator-tax-100" as const;
export const APPROVED_STARPORT_ORIGIN = "https://starport.nexus" as const;
/** Compatibility export; both names resolve to the public production origin. */
export const STARPORT_CUSTOM_ORIGIN = APPROVED_STARPORT_ORIGIN;
export const SPCX_ADDRESS = "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa" as const;
export const PUBLIC_PATHS = {
  capabilities: "/v1/capabilities", launchTarget: "/v1/launch/target", assets: "/v1/assets",
  referencePrice: "/v1/market/reference-price", corporateActions: "/v1/market/corporate-actions",
  chainHead: "/v1/network/chain-head", starlinkOrbit: "/v1/orbit/starlink", orbitStatus: "/v1/orbit/status", nodes: "/v1/nodes", receipts: "/v1/receipts",
} as const;
export type ReadResource = keyof typeof PUBLIC_PATHS;
export interface SourceMeta {
  environment: "preview" | "testnet" | "mainnet";
  schemaVersion: typeof READ_API_VERSION;
  source: "onchain" | "issuer_api" | "orbital_catalog" | "node_statement" | "design_fixture" | "application_db" | "indexer" | "mixed";
  observedAt: string | null;
  observedBlock: string | null;
  confirmationState: "not_applicable" | "pending" | "included" | "confirmed" | "finalized" | "reorged" | "unknown";
  freshness: "fresh" | "stale" | "unknown";
  checkpoint: string | null;
  requestId: string;
}
export interface ReadEnvelope<T> { data: T; meta: SourceMeta }
export interface ReadPage<T> extends ReadEnvelope<T[]> { nextCursor: string | null }
export type CapabilityName = "trade" | "delegation" | "exit_request" | "withdrawal" | "reward_claim" | "payment" | "node_enrollment" | "mission_participation" | "developer_access";
export interface Capabilities {
  environment: SourceMeta["environment"]; chainId: 4663; schemaVersion: typeof READ_API_VERSION; financialExecutionEnabled: false;
  capabilities: {name: CapabilityName; state: "unconfigured" | "disabled" | "read_only" | "enabled" | "paused"; reasonCode: string | null}[];
}
export interface AssetIdentity { chainId: 4663; address: string; symbol: string; decimals: number; decimalsVerified: boolean }
export interface LaunchTarget {
  chainId: 4663; quoteAsset: {chainId:4663;address:null;kind:"native";symbol:"ETH";decimals:18;decimalsVerified:true}; creatorTaxBps: 100; creatorTaxRule: "source_confirmed";
  projectTokenAddress: null; projectTokenTicker: "SPORT"; evidenceDocument: "docs/pons-eth.md"; launchEnabled: false;
  treasuryRecipientTarget: null; actualCreatorFeeRecipient: null; creatorRecipientBindingStatus: "pending_vault_deployment_and_PONS_binding";
}
export interface CatalogAsset {
  asset: AssetIdentity & {decimalsVerified: false}; kind: "stock_token"; issuerMetadataUri: string;
  multiplierRaw: string | null; multiplierDecimals: 18; marketStatus: "unknown"; marketContext: null;
  issuer: {id: string; name: string; status: "active" | "inactive" | "unknown"; isin: string | null;
    pendingMultiplierRaw: string | null; pendingMultiplierEffectiveAt: string | null};
}
export interface AssetPage extends ReadPage<CatalogAsset> { total: number }
export interface ReferencePrice {
  chainId: 4663; assetAddress: string; symbol: string; bid: string; ask: string; currency: "USD"; isTradingHalt: boolean;
  generatedAt: string; fetchedAt: string; expiresAt: string; sourceUrl: string;
  priceBasis: "underlying_equity"; multiplierAdjusted: false; executable: false;
}
export interface ChainHead {
  chainId: 4663; blockNumber: string; blockHash: string; blockTimestamp: string; fetchedAt: string; provider: "alchemy";
}
export interface CorporateAction {
  id: string; tokenSymbol: string; kind: "cash_dividend" | "stock_dividend" | "forward_split" | "reverse_split";
  status: "in_progress" | "completed"; processDate: string | null; underlyingSymbol: string;
  rate: string | null; oldRate: string | null; newRate: string | null;
}
export interface CorporateActions {
  sourceUrl: "https://api.robinhood.com/rhj/corporate-actions"; fetchedAt: string;
  sourceCount: number; supportedCount: number; actions: CorporateAction[];
}
export interface StarlinkOrbit {
  sourceUrl: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON";
  sourceFetchedAt: string; sourceEpochStart: string; sourceEpochEnd: string;
  elementCount: number; catalogSha256: string; sampledCount: number;
  site: "london" | "singapore" | "newyork"; siteLabel: string; computedAt: string;
  model: "SGP4"; evidenceLevel: "predicted_from_public_gp"; refreshPaused: boolean;
  passes: { noradId: number; name: string; windowStart: string; peakAt: string; maxElevationDeg: number }[];
}
export interface OrbitStatus {
  sourceUrl: StarlinkOrbit['sourceUrl']; checkedAt: string;
  cacheState: 'none' | 'usable' | 'stale';
  refreshState: 'eligible' | 'lease_active' | 'manual_review';
  nextEligibleAt: string | null; lastFetchedAt: string | null;
}
export interface PublicNode {
  id: string; operatorId: string; capability: "starlink_gateway" | "rf_observer" | "evidence_reviewer";
  enrollmentStatus: "proposed" | "reviewing" | "approved" | "suspended" | "retired";
  serviceState: "unknown" | "available" | "degraded" | "offline"; evidenceReferences: string[];
  lastProbeAt: string | null; policyVersion: string; operatorIndependence: "unverified" | "reviewed";
  registrationSource: string; approximateRegion: string | null;
}
export interface PublicReceipt {
  id: string; nodeId: string; statementDigest: string; statementScope: string;
  evidenceLevel: "self_reported" | "independently_observed" | "chain_confirmed";
  observedAt: string; chainResult: "unknown" | "not_submitted" | "included" | "confirmed" | "finalized" | "reverted" | "reorged";
}
export interface ReadResults {
  capabilities: ReadEnvelope<Capabilities>; launchTarget: ReadEnvelope<LaunchTarget>; assets: AssetPage;
  referencePrice: ReadEnvelope<ReferencePrice>; corporateActions: ReadEnvelope<CorporateActions>; chainHead: ReadEnvelope<ChainHead>; starlinkOrbit: ReadEnvelope<StarlinkOrbit>; orbitStatus: ReadEnvelope<OrbitStatus>;
  nodes: ReadPage<PublicNode>; receipts: ReadPage<PublicReceipt>;
}
export type AnyReadResult = ReadResults[ReadResource];
export interface PageQuery { limit?: number; cursor?: string }
export interface ReadQueries {
  capabilities: undefined; launchTarget: undefined; assets: PageQuery & {q?: string};
  referencePrice: {address: string; symbol: string}; corporateActions: undefined; chainHead: undefined;
  starlinkOrbit: {site?: StarlinkOrbit['site']}; orbitStatus: undefined;
  nodes: PageQuery; receipts: PageQuery & {nodeId?: string};
}
export type ReadQuery = Exclude<ReadQueries[ReadResource], undefined>;
export interface PublicReadError {
  code: string; message: string; requestId: string; retryable: boolean; retryAfterSeconds: number | null;
  resourceId: string | null; recoveryAction: "correct_input" | "authenticate" | "switch_chain" | "refresh" | "wait" | "reconcile_existing" | "review_terms" | "manual_review" | "none";
}
export class ReadOnlyClientError extends Error {
  readonly name = "ReadOnlyClientError";
  constructor(readonly code: string, message: string, readonly status: number | null = null, readonly detail: PublicReadError | null = null) { super(message); }
}
