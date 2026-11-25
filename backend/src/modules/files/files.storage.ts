import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { env } from "../../config/env.js";

export const storageRoot = () => resolve(env.STORAGE_ROOT);

/** Absolute path for a stored relPath; refuses anything that escapes the storage root. */
export function absolutePath(relPath: string) {
  const root = storageRoot();
  const full = resolve(root, relPath);
  if (!full.startsWith(root + sep)) throw new Error("Path escapes storage root.");
  return full;
}
/** Write via a temp file then rename so a partial file is never visible. */
export async function writeStored(relPath: string, data: Buffer) {
  const full = absolutePath(relPath);
  await mkdir(dirname(full), { recursive: true });
  const temp = full + ".tmp";
  try {
    await writeFile(temp, data, { flag: "wx" });
    await rename(temp, full);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
export async function removeStored(relPath: string) {
  await rm(absolutePath(relPath), { force: true });
}
