import { Prisma } from "@prisma/client";

/**
 * Returns the unique-constraint name text for a P2002 error, or null for any other error.
 * With the pg driver adapter the constraint is reported inside `meta.driverAdapterError`
 * (e.g. "users_mobile_key"), not in `meta.target`, so the whole meta object is searched.
 */
export function uniqueConstraint(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
    return null;
  return JSON.stringify(error.meta ?? {});
}
