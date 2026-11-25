import { createHmac } from "node:crypto";
import { env } from "../config/env.js";
import { verhoeffValid } from "./verhoeff.js";

export function normalizeAadhaar(input: string): string {
  return input.replace(/\s+/g, "");
}
/** 12 digits, first digit 2-9, valid Verhoeff checksum. */
export function isValidAadhaar(input: string): boolean {
  const digits = normalizeAadhaar(input);
  return /^[2-9]\d{11}$/.test(digits) && verhoeffValid(digits);
}
/** Only the keyed hash and last four digits are ever stored. */
export function aadhaarTokens(input: string) {
  const digits = normalizeAadhaar(input);
  return {
    last4: digits.slice(-4),
    hash: createHmac("sha256", env.AADHAAR_HASH_KEY).update(digits).digest("hex"),
  };
}
export const maskAadhaar = (last4: string | null) => (last4 ? "XXXX XXXX " + last4 : null);
