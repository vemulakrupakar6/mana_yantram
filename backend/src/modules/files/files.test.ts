import { existsSync } from "node:fs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { database } from "../../config/database.js";
import {
  as,
  cleanupFactories,
  clearLoginLimits,
  provisionFarmer,
  signIn,
} from "../../../tests/factories.js";
import { absolutePath } from "./files.storage.js";
import { attachFile, cleanupUnattachedFiles, detachAndDelete } from "./files.service.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 1)]);

beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

async function actor() {
  const user = await provisionFarmer();
  const { token } = await signIn(user.username);
  return { user, token };
}
const upload = (token: string, buffer: Buffer, name: string, purpose = "DOCUMENT") =>
  as(token).post("/files").field("purpose", purpose).attach("file", buffer, name);

describe("file upload", () => {
  it("stores a PDF and a PNG by UUID, detecting type from the bytes", async () => {
    const { token } = await actor();
    const a = await upload(token, pdf, "../../evil name.pdf").expect(201);
    expect(a.body.data).toMatchObject({ mimeType: "application/pdf", bucket: "DOCUMENT" });
    expect(a.body.data.url).toBe("/api/v1/files/" + a.body.data.id);
    expect(a.body.data).not.toHaveProperty("relPath");
    const row = await database.storedFile.findUniqueOrThrow({ where: { id: a.body.data.id } });
    expect(row.relPath).toMatch(/^private\/documents\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(row.originalName).not.toMatch(/[\\/]/);
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(absolutePath(row.relPath))).toBe(true);
    const b = await upload(token, png, "photo.png", "EQUIPMENT_PHOTO").expect(201);
    expect(b.body.data.mimeType).toBe("image/png");
  });
  it("rejects a renamed executable and a PDF in the photo bucket", async () => {
    const { token } = await actor();
    expect((await upload(token, exe, "invoice.pdf").expect(415)).body.code).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    await upload(token, pdf, "x.jpg", "EQUIPMENT_PHOTO").expect(415);
  });
  it("rejects oversize files with 413", async () => {
    const { token } = await actor();
    const big = Buffer.concat([pdf, Buffer.alloc(6 * 1024 * 1024)]);
    expect((await upload(token, big, "big.pdf").expect(413)).body.code).toBe("FILE_TOO_LARGE");
    const huge = Buffer.concat([pdf, Buffer.alloc(9 * 1024 * 1024)]);
    expect((await upload(token, huge, "huge.pdf").expect(413)).body.code).toBe("FILE_TOO_LARGE");
  });
  it("validates purpose and presence of the file; needs sign-in", async () => {
    const { token } = await actor();
    await upload(token, pdf, "a.pdf", "BOGUS").expect(422);
    await as(token).post("/files").field("purpose", "DOCUMENT").expect(422);
    await request(app)
      .post("/api/v1/files")
      .set("X-CSRF-Protection", "1")
      .field("purpose", "DOCUMENT")
      .attach("file", pdf, "a.pdf")
      .expect(401);
  });
});

describe("file download and delete", () => {
  it("streams to the owner with safe headers and hides it from others", async () => {
    const owner = await actor();
    const other = await actor();
    const { id } = (await upload(owner.token, pdf, "résumé.pdf").expect(201)).body.data;
    const ok = await as(owner.token)
      .get("/files/" + id)
      .expect(200);
    expect(ok.headers["content-type"]).toContain("application/pdf");
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    expect(ok.headers["cache-control"]).toBe("private, no-store");
    expect(ok.headers["content-disposition"]).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
    await as(other.token)
      .get("/files/" + id)
      .expect(404);
    await request(app)
      .get("/api/v1/files/" + id)
      .expect(401);
    await as(owner.token).get("/files/not-a-uuid").expect(404);
  });
  it("lets only the owner delete an unattached file", async () => {
    const owner = await actor();
    const other = await actor();
    const { id } = (await upload(owner.token, png, "a.png", "EQUIPMENT_PHOTO")).body.data;
    const row = await database.storedFile.findUniqueOrThrow({ where: { id } });
    await as(other.token)
      .delete("/files/" + id)
      .expect(404);
    await as(owner.token)
      .delete("/files/" + id)
      .expect(200);
    expect(await database.storedFile.findUnique({ where: { id } })).toBeNull();
    expect(existsSync(absolutePath(row.relPath))).toBe(false);
  });
});

describe("attach, soft-delete and cleanup", () => {
  const entity = { entityType: "provider", entityId: "11111111-1111-4111-8111-111111111111" };
  it("attaches once, only for the owner and the right bucket", async () => {
    const owner = await actor();
    const other = await actor();
    const { id } = (await upload(owner.token, pdf, "a.pdf")).body.data;
    const attach = (userId: string, bucket: "DOCUMENT" | "EQUIPMENT_PHOTO" = "DOCUMENT") =>
      database.$transaction((tx) => attachFile(tx, { fileId: id, userId, bucket, ...entity }));
    await expect(attach(other.user.id)).rejects.toMatchObject({
      code: "FILE_NOT_AVAILABLE",
      status: 422,
    });
    await expect(attach(owner.user.id, "EQUIPMENT_PHOTO")).rejects.toMatchObject({
      code: "FILE_NOT_AVAILABLE",
    });
    await attach(owner.user.id);
    await expect(attach(owner.user.id)).rejects.toMatchObject({ code: "FILE_NOT_AVAILABLE" });
    // attached files can no longer be deleted by the user
    await as(owner.token)
      .delete("/files/" + id)
      .expect(404);
    // soft delete keeps the row and the physical file, but the owner can no longer read it
    await database.$transaction((tx) => detachAndDelete(tx, id));
    const row = await database.storedFile.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
    expect(existsSync(absolutePath(row.relPath))).toBe(true);
    await as(owner.token)
      .get("/files/" + id)
      .expect(404);
    await expect(attach(owner.user.id)).rejects.toMatchObject({ code: "FILE_NOT_AVAILABLE" });
  });
  it("cleans up only unattached files older than 24 hours", async () => {
    const owner = await actor();
    const old = (await upload(owner.token, pdf, "old.pdf")).body.data.id;
    const fresh = (await upload(owner.token, pdf, "fresh.pdf")).body.data.id;
    const kept = (await upload(owner.token, pdf, "kept.pdf")).body.data.id;
    const longAgo = new Date(Date.now() - 25 * 3600_000);
    await database.storedFile.update({ where: { id: old }, data: { createdAt: longAgo } });
    await database.storedFile.update({
      where: { id: kept },
      data: { createdAt: longAgo, attachedAt: new Date(), ...entity },
    });
    const oldRow = await database.storedFile.findUniqueOrThrow({ where: { id: old } });
    await cleanupUnattachedFiles();
    expect(await database.storedFile.findUnique({ where: { id: old } })).toBeNull();
    expect(existsSync(absolutePath(oldRow.relPath))).toBe(false);
    expect(await database.storedFile.findUnique({ where: { id: fresh } })).not.toBeNull();
    expect(await database.storedFile.findUnique({ where: { id: kept } })).not.toBeNull();
  });
});
