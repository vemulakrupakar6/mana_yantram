import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const modules = join(import.meta.dirname, "modules");
const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? routeFiles(path)
      : name.endsWith(".routes.ts")
        ? [path]
        : [];
  });

/** Returns each `router.<write method>(...)` call's full argument text, balancing parentheses. */
function writeCalls(source: string) {
  const calls: { head: string; text: string }[] = [];
  const pattern = /\b\w+\.(post|put|patch|delete)\(/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
    }
    calls.push({ head: match[0], text: source.slice(match.index, i) });
  }
  return calls;
}
// PATCH /users/profile predates the CSRF guard and is Bearer-only (no cookie is involved).
const bearerOnly = new Set(["users.routes.ts:patch"]);

describe("write routes", () => {
  it("are all behind the origin and CSRF-header guard", () => {
    const unguarded: string[] = [];
    let total = 0;
    for (const file of routeFiles(modules)) {
      const source = readFileSync(file, "utf8");
      for (const call of writeCalls(source)) {
        total++;
        const method = /\.(post|put|patch|delete)\(/.exec(call.head)![1];
        const key = file.split(/[\\/]/).pop() + ":" + method;
        const guarded = /protectCookieOperation|\bwrite\b/.test(call.text);
        if (!guarded && !bearerOnly.has(key))
          unguarded.push(
            file.split("modules")[1] + " " + call.text.slice(0, 70).replace(/\s+/g, " "),
          );
      }
    }
    // A floor that catches the parser silently finding nothing (there are 53 write routes today).
    expect(total).toBeGreaterThanOrEqual(50);
    expect(unguarded).toEqual([]);
  });
  it("never read a body without validation (strict schemas on every JSON write)", () => {
    // Routes that accept a JSON body must validate it. Body-less actions are exempt, and the multipart
    // upload validates its fields inside the handler.
    const unvalidated: string[] = [];
    for (const file of routeFiles(modules)) {
      for (const call of writeCalls(readFileSync(file, "utf8"))) {
        const readsBody = /req\.body/.test(call.text);
        if (readsBody && !/validate\(/.test(call.text) && !file.includes("files.routes"))
          unvalidated.push(file.split("modules")[1] + " " + call.text.slice(0, 60));
      }
    }
    expect(unvalidated).toEqual([]);
  });
});
