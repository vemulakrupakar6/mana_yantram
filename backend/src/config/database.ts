import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

export const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 3000 }),
});
