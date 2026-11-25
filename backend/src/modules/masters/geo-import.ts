import { readFile } from "node:fs/promises";
import { database } from "../../config/database.js";
import { parseCsv } from "../../utils/csv.js";

const columns = [
  "district_lgd",
  "district_en",
  "district_te",
  "mandal_lgd",
  "mandal_en",
  "mandal_te",
  "village_lgd",
  "village_en",
  "village_te",
] as const;
export interface GeoImportCounts {
  districts: number;
  mandals: number;
  villages: number;
}
const BATCH = 500;

/** Upsert by lgd_code, one transaction per district. Never deletes. Idempotent. */
export async function importGeoCsv(path: string): Promise<GeoImportCounts> {
  const rows = parseCsv(await readFile(path, "utf8"));
  if (!rows.length) throw new Error("The CSV file has no data rows.");
  for (const column of columns)
    if (!(column in rows[0])) throw new Error("Missing CSV column: " + column);
  rows.forEach((row, index) => {
    for (const column of columns)
      if (!row[column]) throw new Error("Row " + (index + 2) + ": " + column + " is empty.");
  });
  const byDistrict = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const group = byDistrict.get(row.district_lgd) ?? [];
    group.push(row);
    byDistrict.set(row.district_lgd, group);
  }
  const counts: GeoImportCounts = { districts: 0, mandals: 0, villages: 0 };
  for (const [lgd, districtRows] of byDistrict) {
    await database.$transaction(
      async (tx) => {
        const first = districtRows[0];
        const district = await tx.district.upsert({
          where: { lgdCode: lgd },
          create: { lgdCode: lgd, nameEn: first.district_en, nameTe: first.district_te },
          update: { nameEn: first.district_en, nameTe: first.district_te },
        });
        counts.districts++;
        const mandalIds = new Map<string, string>();
        for (const row of districtRows) {
          if (mandalIds.has(row.mandal_lgd)) continue;
          const mandal = await tx.mandal.upsert({
            where: { lgdCode: row.mandal_lgd },
            create: {
              lgdCode: row.mandal_lgd,
              districtId: district.id,
              nameEn: row.mandal_en,
              nameTe: row.mandal_te,
            },
            update: { districtId: district.id, nameEn: row.mandal_en, nameTe: row.mandal_te },
          });
          mandalIds.set(row.mandal_lgd, mandal.id);
          counts.mandals++;
        }
        const villages = new Map(
          districtRows.map((row) => [
            row.village_lgd,
            {
              lgdCode: row.village_lgd,
              mandalId: mandalIds.get(row.mandal_lgd)!,
              nameEn: row.village_en,
              nameTe: row.village_te,
            },
          ]),
        );
        for (let i = 0; i < villages.size; i += BATCH) {
          for (const village of [...villages.values()].slice(i, i + BATCH)) {
            await tx.village.upsert({
              where: { lgdCode: village.lgdCode },
              create: village,
              update: village,
            });
            counts.villages++;
          }
        }
      },
      { timeout: 120_000 },
    );
  }
  return counts;
}
