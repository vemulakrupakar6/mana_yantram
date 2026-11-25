import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const key = () => Buffer.from(env.FIELD_ENCRYPTION_KEY, "base64");

/** AES-256-GCM. Stored as base64(iv).base64(tag).base64(ciphertext). */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}
export function decryptField(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted field.");
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
