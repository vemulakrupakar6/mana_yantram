import { describe, expect, it } from "vitest";
import { decryptField, encryptField } from "./field-crypto.js";
import { verhoeffCheckDigit, verhoeffValid } from "./verhoeff.js";
import { aadhaarTokens, isValidAadhaar, maskAadhaar } from "./aadhaar.js";

const withCheck = (base: string) => base + verhoeffCheckDigit(base);

describe("field crypto", () => {
  it("round-trips and never repeats ciphertext", () => {
    const a = encryptField("123456789012");
    expect(decryptField(a)).toBe("123456789012");
    expect(encryptField("123456789012")).not.toBe(a);
    expect(a).not.toContain("123456789012");
  });
  it("rejects tampered or malformed values", () => {
    const [iv, tag, data] = encryptField("secret").split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptField([iv, tag, flipped.toString("base64")].join("."))).toThrow();
    expect(() => decryptField("nope")).toThrow();
  });
});
describe("verhoeff", () => {
  it("accepts known-valid numbers and rejects changed digits", () => {
    expect(verhoeffValid("2363")).toBe(true); // wikipedia example: 236 + check 3
    expect(verhoeffValid("2364")).toBe(false);
    expect(verhoeffValid("")).toBe(false);
    expect(verhoeffValid("12a4")).toBe(false);
  });
  it("detects every single-digit substitution", () => {
    const valid = withCheck("23456789012");
    for (let i = 0; i < valid.length; i++)
      for (let digit = 0; digit < 10; digit++) {
        if (String(digit) === valid[i]) continue;
        expect(verhoeffValid(valid.slice(0, i) + digit + valid.slice(i + 1))).toBe(false);
      }
  });
});
describe("aadhaar", () => {
  const valid = withCheck("23456789012");
  it("validates format and checksum, allowing spaces", () => {
    expect(isValidAadhaar(valid)).toBe(true);
    expect(isValidAadhaar(valid.replace(/(\d{4})(\d{4})/, "$1 $2 "))).toBe(true);
    expect(isValidAadhaar(withCheck("12345678901"))).toBe(false); // starts with 1
    expect(isValidAadhaar(valid.slice(0, 11))).toBe(false);
    expect(isValidAadhaar(valid.slice(0, 11) + ((Number(valid[11]) + 1) % 10))).toBe(false);
  });
  it("stores only last4 and a keyed hash", () => {
    const tokens = aadhaarTokens(valid);
    expect(tokens.last4).toBe(valid.slice(-4));
    expect(tokens.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash).not.toContain(valid);
    expect(maskAadhaar(tokens.last4)).toBe("XXXX XXXX " + valid.slice(-4));
  });
});
