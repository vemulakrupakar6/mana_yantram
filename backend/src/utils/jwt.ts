import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";

const issuer = "mana-yantram";
const audience = "mana-yantram-api";
const claimsSchema = z.object({ sub: z.uuid(), sid: z.uuid(), exp: z.number() });

export function signAccessToken(userId: string, familyId: string) {
  return jwt.sign({ sid: familyId }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    subject: userId,
    issuer,
    audience,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}
export function verifyAccessToken(token: string) {
  return claimsSchema.parse(
    jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"], issuer, audience }),
  );
}
