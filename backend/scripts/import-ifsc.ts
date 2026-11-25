// npm run db:import-ifsc -w backend -- <path.csv>   (columns: ifsc,bank,branch,district)
import { readFile } from "node:fs/promises";
import { database } from "../src/config/database.js";
import { parseCsv } from "../src/utils/csv.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run db:import-ifsc -w backend -- <path.csv>");
  process.exit(1);
}
try {
  const rows = parseCsv(await readFile(file, "utf8"));
  let count = 0;
  for (let i = 0; i < rows.length; i += 500) {
    await database.$transaction(async (tx) => {
      for (const row of rows.slice(i, i + 500)) {
        const ifsc = (row.ifsc ?? "").toUpperCase();
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) || !row.bank || !row.branch)
          throw new Error("Invalid row for IFSC '" + ifsc + "'.");
        const data = { bank: row.bank, branch: row.branch, district: row.district || null };
        await tx.ifscCode.upsert({ where: { ifsc }, create: { ifsc, ...data }, update: data });
        count++;
      }
    });
  }
  console.log("Imported " + count + " IFSC codes.");
} catch (error) {
  console.error("Import failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
