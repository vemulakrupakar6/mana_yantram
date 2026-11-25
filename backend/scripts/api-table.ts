// Prints the endpoint tables for docs/api.md from the OpenAPI document:  npx tsx scripts/api-table.ts
import { openApi } from "../src/config/swagger.js";

type Op = {
  tags: string[];
  summary: string;
  description?: string;
  security?: unknown;
  parameters?: unknown[];
};
const paths = openApi.paths as Record<string, Record<string, Op>>;
const byTag = new Map<string, string[]>();
const esc = (text: string) => text.split("|").join("\\|");
for (const [path, item] of Object.entries(paths))
  for (const [method, op] of Object.entries(item)) {
    const permission = /Requires permission `([^`]+)`/.exec(op.description ?? "")?.[1];
    const csrfOnly = JSON.stringify(op.parameters ?? []).includes("CsrfProtection");
    const access = !op.security
      ? csrfOnly
        ? "CSRF header (cookie or credentials)"
        : "Public"
      : permission
        ? "Bearer, permission `" + permission + "`"
        : method === "get"
          ? "Bearer"
          : "Bearer and CSRF header";
    const rows = byTag.get(op.tags[0]) ?? [];
    rows.push(`| ${method.toUpperCase()} ${path} | ${access} | ${esc(op.summary)} |`);
    byTag.set(op.tags[0], rows);
  }
for (const [tag, rows] of byTag)
  console.log(
    `### ${tag}\n\n| Method and path | Access | Purpose |\n| --- | --- | --- |\n${rows.join("\n")}\n`,
  );
