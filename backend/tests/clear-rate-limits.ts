// Part of `db:test:prepare`: the rate limits live in the (test) database and would otherwise
// carry over between runs, making repeated registrations in browser tests fail with 429.
import { database } from "../src/config/database.js";

await database.authRateLimit.deleteMany({});
await database.$disconnect();
