import argon2 from "argon2";
import { randomBytes } from "node:crypto";

export function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}
export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}
let dummyHash: Promise<string> | undefined;
export function missingAccountHash() {
  return (dummyHash ??= hashPassword(randomBytes(32).toString("hex")));
}
