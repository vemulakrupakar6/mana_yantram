import { cleanExpiredRateLimits } from "./middleware/rate-limit.js";
import { cleanupUnattachedFiles } from "./modules/files/files.service.js";
import { app } from "./app.js";
import { database } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const server = app.listen(env.PORT, (error?: Error) => {
  if (error) {
    logger.error({ port: env.PORT, errorType: error.name }, "Mana Yantram API failed to bind");
    process.exitCode = 1;
    return;
  }
  logger.info({ port: env.PORT }, "Mana Yantram API listening");
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
function cleanRateLimits() {
  void cleanExpiredRateLimits().catch(() => logger.warn("Rate-limit cleanup will retry"));
}
const cleanup = setInterval(cleanRateLimits, 60_000).unref();
cleanRateLimits();
function cleanFiles() {
  void cleanupUnattachedFiles().catch(() => logger.warn("File cleanup will retry"));
}
const fileCleanup = setInterval(cleanFiles, 60 * 60_000).unref();
cleanFiles();
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(cleanup);
  clearInterval(fileCleanup);
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10_000).unref();
  server.close(() => {
    void database.$disconnect().finally(() => clearTimeout(deadline));
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
