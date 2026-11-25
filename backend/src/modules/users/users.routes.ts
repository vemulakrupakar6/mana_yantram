import { Router } from "express";
import { z } from "zod";
import { database } from "../../config/database.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { success } from "../../common/responses/success.js";
import { language } from "../auth/auth.schema.js";
import { getSummary, lockUser } from "../auth/auth.repository.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

const profileFields = {
  id: true,
  username: true,
  displayName: true,
  mobile: true,
  mobileVerified: true,
  email: true,
  emailVerified: true,
  preferredLanguage: true,
  createdAt: true,
} as const;
const profileSchema = z
  .strictObject({
    displayName: z.string().trim().max(150).nullable().optional(),
    mobile: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number.")
      .nullable()
      .optional(),
    email: z.string().trim().max(254).pipe(z.email()).nullable().optional(),
    preferredLanguage: language.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Provide at least one profile field.",
    when: ({ issues }) => issues.length === 0,
  });
type ProfileInput = z.infer<typeof profileSchema>;

export const usersRoutes = Router();
usersRoutes.get("/profile", authenticate, async (req, res) => {
  const user = await database.user.findUniqueOrThrow({
    where: { id: req.auth!.id },
    select: profileFields,
  });
  success(res, "Account profile.", { ...user, roles: req.auth!.roles });
});
const mobileTaken = () =>
  new AppError(409, "MOBILE_TAKEN", "That mobile number is already in use.", [
    { field: "mobile", message: "That mobile number is already in use." },
  ]);
usersRoutes.patch("/profile", authenticate, validate(profileSchema), async (req, res) => {
  const userId = req.auth!.id;
  const { displayName, mobile, email, preferredLanguage } = req.body as ProfileInput;
  const profile = await database
    .$transaction(async (tx) => {
      const account = await lockUser(tx, userId);
      if (!account || account.status !== "ACTIVE")
        throw new AppError(401, "INVALID_SESSION", "Sign in to continue.");
      const old = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { mobile: true, email: true },
      });
      const user = await tx.user.update({
        where: { id: userId },
        select: profileFields,
        data: {
          displayName: displayName === "" ? null : displayName,
          mobile,
          email,
          preferredLanguage,
          mobileVerified: mobile !== undefined && mobile !== old.mobile ? false : undefined,
          emailVerified: email !== undefined && email !== old.email ? false : undefined,
        },
      });
      return { ...user, roles: (await getSummary(userId, tx)).roles };
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw mobileTaken();
      throw error;
    });
  success(res, "Account profile updated.", profile);
});
