import { database } from "../src/config/database.js";
import { importGeoCsv } from "../src/modules/masters/geo-import.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run db:import-geo -w backend -- <path.csv>");
  process.exit(1);
}
try {
  const counts = await importGeoCsv(file);
  console.log(
    `Imported ${counts.districts} districts, ${counts.mandals} mandals, ${counts.villages} villages.`,
  );
} catch (error) {
  console.error("Import failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
