import type { ErrorRequestHandler } from "express";
import { AppError } from "../common/errors/app-error.js";
import { logger } from "../config/logger.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const requestId = req.id;
  if (error instanceof AppError) {
    res.status(error.status).json({
      success: false,
      message: error.message,
      code: error.code,
      errors: error.errors,
      requestId,
    });
    return;
  }
  const status =
    typeof error === "object" && error !== null && "status" in error ? error.status : null;
  if (status === 400 || status === 413 || status === 415) {
    res.status(status).json({
      success: false,
      message: "Invalid request body.",
      code: "INVALID_REQUEST",
      errors: [],
      requestId,
    });
    return;
  }
  logger.error(
    { requestId, errorType: error instanceof Error ? error.name : typeof error },
    "Unhandled request error",
  );
  res.status(500).json({
    success: false,
    message: "Internal server error.",
    code: "INTERNAL_ERROR",
    errors: [],
    requestId,
  });
};
