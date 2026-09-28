import { createPrivateKey, createPublicKey, sign, timingSafeEqual, verify } from "node:crypto";
import { LIMITS } from "./constants.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function encodeHex(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export function parseOperatorPublicKey(value: string): Uint8Array | null {
  if (!/^ed25519:0x[0-9a-f]{64}$/.test(value)) return null;
  return new Uint8Array(Buffer.from(value.slice("ed25519:".length + 2), "hex"));
}

export function parseOperatorSignature(value: string): Uint8Array | null {
  if (!/^0x[0-9a-f]{128}$/.test(value)) return null;
  return new Uint8Array(Buffer.from(value.slice(2), "hex"));
}

export function safeEqualText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export function signOperatorBytes(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  if (privateKey.byteLength !== LIMITS.ed25519PublicKeyBytes) {
    throw new Error("Operator signing key must be a raw 32-byte Ed25519 seed.");
  }
  const key = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(privateKey)]),
    format: "der",
    type: "pkcs8",
  });
  return new Uint8Array(sign(null, Buffer.from(message), key));
}

export function verifyOperatorSignature(publicKeyText: string, message: Uint8Array, signatureHex: string): boolean {
  const rawPublic = parseOperatorPublicKey(publicKeyText);
  const signature = parseOperatorSignature(signatureHex);
  if (!rawPublic || !signature || rawPublic.byteLength !== LIMITS.ed25519PublicKeyBytes) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rawPublic)]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  }
}
