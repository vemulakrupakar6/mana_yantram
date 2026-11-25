import { createHash, randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { FileBucket, Prisma, StoredFile } from "@prisma/client";
import { database } from "../../config/database.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";
import { audit } from "../auth/auth.repository.js";
import { jurisdictionWhere } from "../rbac/jurisdiction.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";
import { removeStored, writeStored } from "./files.storage.js";

const allowed: Record<FileBucket, Record<string, string>> = {
  DOCUMENT: { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" },
  EQUIPMENT_PHOTO: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
};
const folders: Record<FileBucket, string> = {
  DOCUMENT: "documents",
  EQUIPMENT_PHOTO: "equipment-photos",
};
const maxBytes = (bucket: FileBucket) =>
  (bucket === "DOCUMENT" ? env.UPLOAD_MAX_DOCUMENT_MB : env.UPLOAD_MAX_PHOTO_MB) * 1024 * 1024;

export const fileUrl = (id: string) => "/api/v1/files/" + id;
export const present = (
  file: Pick<StoredFile, "id" | "originalName" | "mimeType" | "sizeBytes" | "bucket">,
) => ({
  id: file.id,
  url: fileUrl(file.id),
  originalName: file.originalName,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  bucket: file.bucket,
});
const notFound = () => new AppError(404, "NOT_FOUND", "Resource not found.");

/** Strip path separators and control characters; cap at 255 characters. */
export function cleanFileName(name: string) {
  const cleaned = [...name]
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      return ch !== "/" && ch !== "\\" && code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim()
    .slice(0, 255);
  return cleaned || "file";
}

export async function uploadFile(
  user: UserSummary,
  input: { buffer: Buffer; originalName: string; purpose: FileBucket },
) {
  const { buffer, purpose } = input;
  if (!buffer.length)
    throw new AppError(422, "VALIDATION_ERROR", "The file is empty.", [
      { field: "file", message: "The file is empty." },
    ]);
  if (buffer.length > maxBytes(purpose))
    throw new AppError(413, "FILE_TOO_LARGE", "The file is too large.");
  // Trust the bytes, never the declared MIME type or the extension.
  const detected = await fileTypeFromBuffer(buffer);
  const ext = detected ? allowed[purpose][detected.mime] : undefined;
  if (!detected || !ext)
    throw new AppError(415, "FILE_TYPE_NOT_ALLOWED", "That file type is not allowed.");
  const id = randomUUID();
  const now = new Date();
  const relPath = `private/${folders[purpose]}/${now.getUTCFullYear()}/${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}/${id}.${ext}`;
  await writeStored(relPath, buffer);
  try {
    const row = await database.storedFile.create({
      data: {
        id,
        bucket: purpose,
        relPath,
        originalName: cleanFileName(input.originalName),
        mimeType: detected.mime,
        sizeBytes: buffer.length,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        ownerUserId: user.id,
      },
    });
    return present(row);
  } catch (error) {
    await removeStored(relPath);
    throw error;
  }
}

/**
 * Who may read a file. Owners always can. Provider/equipment/operator files will also be readable
 * by the provider and by officers within jurisdiction once the provider tables exist (Phase 4);
 * until then `resolveProviderId` finds nothing and only the owner has access.
 */
async function resolveProviderId(file: StoredFile): Promise<string | null> {
  if (!file.entityId) return null;
  if (file.entityType === "provider") return file.entityId;
  if (file.entityType === "equipment")
    return (
      (
        await database.equipment.findUnique({
          where: { id: file.entityId },
          select: { providerId: true },
        })
      )?.providerId ?? null
    );
  if (file.entityType === "operator")
    return (
      (
        await database.operator.findUnique({
          where: { id: file.entityId },
          select: { providerId: true },
        })
      )?.providerId ?? null
    );
  return null;
}
/** The provider's own account, or an officer with provider.view whose jurisdiction covers the provider. */
async function mayReadProviderFile(user: UserSummary, providerId: string) {
  const owned = await database.provider.findFirst({
    where: { id: providerId, userId: user.id },
    select: { id: true },
  });
  if (owned) return { allowed: true, officer: false };
  if (!user.permissions.includes("provider.view")) return { allowed: false, officer: false };
  const inScope = await database.provider.findFirst({
    where: { AND: [{ id: providerId }, jurisdictionWhere(user)] },
    select: { id: true },
  });
  return { allowed: Boolean(inScope), officer: true };
}
export async function readableFile(user: UserSummary, id: string, details: RequestDetails) {
  const file = await database.storedFile.findUnique({ where: { id } });
  if (!file) throw notFound();
  const providerId = file.entityType ? await resolveProviderId(file) : null;
  const owner = file.ownerUserId === user.id;
  const viaProvider = providerId ? await mayReadProviderFile(user, providerId) : null;
  if (!owner && !viaProvider?.allowed) throw notFound();
  // Deleted files (kept for audit history) are only visible to officers, never to owners.
  if (file.deletedAt && !(viaProvider?.officer && viaProvider.allowed)) throw notFound();
  if (!owner && viaProvider?.officer)
    await audit(database, details, "FILE_VIEW", user.id, {
      entityType: "file",
      entityId: file.id,
      metadata: { providerId },
    });
  return file;
}

export async function deleteOwnUnattached(user: UserSummary, id: string) {
  const file = await database.storedFile.findFirst({
    where: { id, ownerUserId: user.id, attachedAt: null, deletedAt: null },
  });
  if (!file) throw notFound();
  await database.storedFile.delete({ where: { id } });
  await removeStored(file.relPath);
}

export interface AttachInput {
  fileId: string;
  userId: string;
  bucket: FileBucket;
  entityType: string;
  entityId: string;
}
/** Atomically claim an uploaded file: yours, right bucket, not attached, not deleted. */
export async function attachFile(tx: Prisma.TransactionClient, input: AttachInput) {
  const result = await tx.storedFile.updateMany({
    where: {
      id: input.fileId,
      ownerUserId: input.userId,
      bucket: input.bucket,
      attachedAt: null,
      deletedAt: null,
    },
    data: { entityType: input.entityType, entityId: input.entityId, attachedAt: new Date() },
  });
  if (result.count !== 1)
    throw new AppError(422, "FILE_NOT_AVAILABLE", "That file cannot be used.", [
      { field: "fileId", message: "That file cannot be used." },
    ]);
}
/** Soft delete: the physical file is kept for audit history. */
export function detachAndDelete(tx: Prisma.TransactionClient, fileId: string) {
  return tx.storedFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
}

/** Remove files uploaded but never attached within 24 hours (row and physical file). */
export async function cleanupUnattachedFiles(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stale = await database.storedFile.findMany({
    where: { attachedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, relPath: true },
    take: 500,
  });
  for (const file of stale) {
    await removeStored(file.relPath);
    await database.storedFile.deleteMany({ where: { id: file.id, attachedAt: null } });
  }
  return stale.length;
}
