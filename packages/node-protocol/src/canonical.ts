import { createHash } from "node:crypto";
import { LIMITS, OPERATOR_MESSAGE_VERSION } from "./constants.js";

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

const FIELD_NAME = /^[a-z][A-Za-z0-9]{0,40}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Canonical operator bytes, version starport-operator-message/v1.
 * ASCII field names sort by UTF-16 code unit. Each value is one line `name=value`.
 * Values reject control characters, so the encoding is injective for accepted inputs.
 * The document is UTF-8 and ends with a single LF.
 */
export function encodeCanonical(fields: Readonly<Record<string, string>>): Uint8Array {
  const keys = Object.keys(fields).sort();
  const lines = [OPERATOR_MESSAGE_VERSION];
  for (const key of keys) {
    if (!FIELD_NAME.test(key)) throw new CanonicalError("Canonical field name is invalid.");
    const value = fields[key];
    if (typeof value !== "string") throw new CanonicalError("Canonical field value is invalid.");
    if (value.length > LIMITS.maxCanonicalValueChars || CONTROL.test(value) || [...value].some((character) => { const code = character.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff; })) {
      throw new CanonicalError("Canonical field value contains a control character or exceeds the size cap.");
    }
    lines.push(`${key}=${value}`);
  }
  const bytes = new TextEncoder().encode(`${lines.join("\n")}\n`);
  if (bytes.byteLength > 65_536) throw new CanonicalError("Canonical operator message exceeds the absolute size cap.");
  return bytes;
}

export function canonicalText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function digestCanonical(bytes: Uint8Array): string {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

export function canonicalList(values: readonly string[]): string {
  for (const value of values) {
    if (typeof value !== "string" || CONTROL.test(value)) throw new CanonicalError("Canonical list value is invalid.");
  }
  return JSON.stringify(values);
}

export function canonicalAddress(value: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new CanonicalError("Operator address is invalid.");
  }
  return `0x${value.slice(2).toLowerCase()}`;
}

export function addressesEqual(left: string, right: string): boolean {
  try {
    return canonicalAddress(left) === canonicalAddress(right);
  } catch (error) {
    if (error instanceof CanonicalError) return false;
    throw error;
  }
}

export function canonicalInteger(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new CanonicalError("Canonical integer is invalid.");
  return String(value);
}

export function presentFlag(value: string | null): { readonly text: string; readonly present: "0" | "1" } {
  if (value === null) return { text: "", present: "0" };
  if (value.length === 0 || CONTROL.test(value)) throw new CanonicalError("Canonical optional value is invalid.");
  return { text: value, present: "1" };
}
