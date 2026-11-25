import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app.js";
import { openApi } from "./swagger.js";

type Operation = { parameters?: { name?: string; in?: string }[]; security?: unknown };
const paths = openApi.paths as Record<string, Record<string, Operation>>;
const SOME_ID = "0b0c0d0e-0000-4000-8000-000000000000";

describe("OpenAPI document", () => {
  it("resolves every schema reference", () => {
    const schemas = (openApi.components.schemas ?? {}) as Record<string, unknown>;
    const refs = JSON.stringify(openApi).match(/#\/components\/schemas\/\w+/g) ?? [];
    expect(refs.length).toBeGreaterThan(50);
    for (const ref of refs) expect(schemas, ref).toHaveProperty(ref.split("/").pop()!);
  });
  it("covers each Milestone 3 area", () => {
    const documented = new Set<string>();
    for (const [path, item] of Object.entries(paths))
      for (const method of Object.keys(item)) documented.add(method.toUpperCase() + " " + path);
    for (const endpoint of [
      "POST /auth/roles",
      "POST /admin/users/{id}/deactivate",
      "GET /masters/districts",
      "POST /files",
      "POST /farmers/me",
      "POST /assisted/farmers",
      "PUT /providers/me/bank-account",
      "POST /providers/me/submit",
      "POST /providers/me/equipment",
      "POST /providers/me/units/{unitId}/blocks",
      "POST /providers/me/operators",
      "GET /operator/me",
      "POST /admin/providers/{id}/verify",
      "GET /admin/providers/{id}/bank-account/reveal",
    ])
      expect(documented, endpoint).toContain(endpoint);
  });
  it("describes the upload as multipart with a binary file field", () => {
    const upload = (paths["/files"] as unknown as { post: { requestBody: { content: object } } })
      .post;
    expect(Object.keys(upload.requestBody.content)).toEqual(["multipart/form-data"]);
    const schemas = openApi.components.schemas as unknown as Record<
      string,
      { properties: Record<string, { format?: string }> }
    >;
    expect(schemas.FileUpload.properties.file.format).toBe("binary");
  });
  it("declares a path parameter for every templated segment", () => {
    for (const [path, item] of Object.entries(paths)) {
      const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const [method, op] of Object.entries(item))
        for (const name of names)
          expect(
            op.parameters?.some((p) => p.in === "path" && p.name === name),
            `${method} ${path} {${name}}`,
          ).toBe(true);
    }
  });
  it("requires the CSRF header on every Milestone 3 write", () => {
    // PATCH /users/profile predates this milestone and is Bearer-only, so it needs no CSRF header.
    for (const [path, item] of Object.entries(paths).filter(([p]) => p !== "/users/profile"))
      for (const [method, op] of Object.entries(item)) {
        if (method === "get") continue;
        expect(JSON.stringify(op.parameters ?? []), `${method} ${path}`).toContain(
          "CsrfProtection",
        );
      }
  });
  it("keeps the Postman collection in step: every request maps to a documented operation", () => {
    const file = resolve(
      import.meta.dirname,
      "../../../docs/postman/Mana Yantram.postman_collection.json",
    );
    type Item = { item?: Item[]; request?: { method: string; url: string } };
    const collection = JSON.parse(readFileSync(file, "utf8")) as { item: Item[] };
    const operations = Object.entries(paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => ({
        method: method.toUpperCase(),
        pattern: new RegExp("^" + path.replace(/\{\w+\}/g, "[^/]+") + "$"),
      })),
    );
    const unknown: string[] = [];
    let checked = 0;
    const walk = (items: Item[]) => {
      for (const entry of items) {
        if (entry.item) walk(entry.item);
        else if (entry.request && !entry.request.url.startsWith("{{docsUrl}}")) {
          const path = entry.request.url
            .replace("{{baseUrl}}", "")
            .replace(/\?.*$/, "")
            .replace(/\{\{\w+\}\}/g, "x");
          checked++;
          if (!operations.some((o) => o.method === entry.request!.method && o.pattern.test(path)))
            unknown.push(entry.request.method + " " + entry.request.url);
        }
      }
    };
    walk(collection.item);
    expect(checked).toBeGreaterThan(80);
    expect(unknown).toEqual([]);
  });
  it("only documents endpoints that exist (none falls through to the 404 handler)", async () => {
    const missing: string[] = [];
    for (const [path, item] of Object.entries(paths))
      for (const method of Object.keys(item)) {
        const url = "/api/v1" + path.replace(/\{\w+\}/g, SOME_ID).replace(SOME_ID + "}", SOME_ID);
        const agent = request(app) as unknown as Record<string, (u: string) => request.Test>;
        const target = url.replace("/ifsc/" + SOME_ID, "/ifsc/SBIN0000001");
        const response = await agent[method](target).set("X-CSRF-Protection", "1");
        // A real route answers 200/401/403/422...; only the fallback produces this exact 404 for an anonymous caller.
        if (
          response.status === 404 &&
          response.body?.code === "NOT_FOUND" &&
          !isResourceLookup(path)
        )
          missing.push(method.toUpperCase() + " " + path);
      }
    expect(missing).toEqual([]);
  });
});
/** Public lookups legitimately return 404 for an unknown id; everything else is stopped by authentication first. */
const isResourceLookup = (path: string) => path.startsWith("/masters/");
