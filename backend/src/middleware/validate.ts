import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "../common/errors/app-error.js";

export function validate(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Validation failed.",
          result.error.issues.flatMap((issue) => {
            if (issue.code === "unrecognized_keys")
              return issue.keys.map((field) => ({ field, message: "Unexpected field." }));
            return [{ field: issue.path.join(".") || "body", message: issue.message }];
          }),
        ),
      );
    }
    req.body = result.data;
    next();
  };
}
