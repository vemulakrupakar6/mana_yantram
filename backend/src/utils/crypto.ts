import { createHash, randomBytes } from "node:crypto";

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function createRefreshToken() {
  return randomBytes(32).toString("base64url");
}
