import { Router, type Request, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { authenticate } from "../../middleware/authenticate.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { absolutePath } from "./files.storage.js";
import { deleteOwnUnattached, readableFile, uploadFile } from "./files.service.js";

const details = (req: Request) => ({ requestId: String(req.id), ipAddress: req.ip });
const idOf = (req: Request) => {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Resource not found.");
  return parsed.data;
};
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 8 * 1024 * 1024 },
});
const receive: RequestHandler = (req, res, next) => {
  parser.single("file")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError)
      return next(
        error.code === "LIMIT_FILE_SIZE"
          ? new AppError(413, "FILE_TOO_LARGE", "The file is too large.")
          : new AppError(422, "VALIDATION_ERROR", "Upload one file in the 'file' field.", [
              { field: "file", message: "Upload one file in the 'file' field." },
            ]),
      );
    next(error);
  });
};
const purposeSchema = z.enum(["DOCUMENT", "EQUIPMENT_PHOTO"]);

export const filesRoutes = Router();
filesRoutes.post(
  "/",
  protectCookieOperation,
  authenticate,
  rateLimit("upload", 60),
  receive,
  async (req, res) => {
    const purpose = purposeSchema.safeParse(req.body?.purpose);
    if (!purpose.success)
      throw new AppError(422, "VALIDATION_ERROR", "Validation failed.", [
        { field: "purpose", message: "Use DOCUMENT or EQUIPMENT_PHOTO." },
      ]);
    if (!req.file)
      throw new AppError(422, "VALIDATION_ERROR", "Validation failed.", [
        { field: "file", message: "A file is required." },
      ]);
    const file = await uploadFile(req.auth!, {
      buffer: req.file.buffer,
      // multer decodes multipart filenames as latin1; recover the UTF-8 original.
      originalName: Buffer.from(req.file.originalname, "latin1").toString("utf8"),
      purpose: purpose.data,
    });
    success(res, "File uploaded.", file, 201);
  },
);
filesRoutes.get("/:id", authenticate, async (req, res) => {
  const file = await readableFile(req.auth!, idOf(req), details(req));
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader(
    "Content-Disposition",
    "inline; filename*=UTF-8''" + encodeURIComponent(file.originalName),
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(absolutePath(file.relPath), { headers: {}, dotfiles: "allow" }, (error) => {
    if (error && !res.headersSent)
      res.status(404).json({
        success: false,
        message: "Resource not found.",
        code: "NOT_FOUND",
        errors: [],
        requestId: req.id,
      });
  });
});
filesRoutes.delete("/:id", protectCookieOperation, authenticate, async (req, res) => {
  await deleteOwnUnattached(req.auth!, idOf(req));
  success(res, "File deleted.");
});
