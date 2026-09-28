import type { PublicReceiptWire } from "./wire.js";

const PUBLIC_KEYS = ["chainResult", "evidenceLevel", "id", "nodeId", "observedAt", "statementDigest", "statementScope"] as const;

export function projectPublicReceipt(input: {
  readonly publicationAuthorized: boolean;
  readonly id: string;
  readonly nodeId: string;
  readonly statementDigest: string;
  readonly statementScope: string;
  readonly evidenceLevel: PublicReceiptWire["evidenceLevel"];
  readonly observedAt: string;
  readonly chainResult: PublicReceiptWire["chainResult"];
}): PublicReceiptWire | null {
  if (!input.publicationAuthorized) return null;
  const projected: PublicReceiptWire = {
    id: input.id,
    nodeId: input.nodeId,
    statementDigest: input.statementDigest,
    statementScope: input.statementScope,
    evidenceLevel: input.evidenceLevel,
    observedAt: input.observedAt,
    chainResult: input.chainResult,
  };
  const keys = Object.keys(projected).sort();
  if (keys.length !== PUBLIC_KEYS.length || keys.some((key, index) => key !== PUBLIC_KEYS[index])) return null;
  return projected;
}
