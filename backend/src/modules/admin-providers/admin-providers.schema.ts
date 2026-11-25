import { z } from "zod";

const uuid = z.uuid();
const remark = z.string().trim().min(3).max(500);
export const fieldRemarksSchema = z.strictObject({
  type: remark.optional(),
  name: remark.optional(),
  contactPerson: remark.optional(),
  mobile: remark.optional(),
  email: remark.optional(),
  addressLine: remark.optional(),
  pincode: remark.optional(),
  location: remark.optional(),
  baseLocation: remark.optional(),
  registrationNo: remark.optional(),
  gstin: remark.optional(),
  coverage: remark.optional(),
  workingHours: remark.optional(),
  equipment: z.record(uuid, remark).optional(),
});
export const verifySchema = z.strictObject({
  action: z.enum(["APPROVE", "RETURN", "REJECT"]),
  remarks: z.string().trim().min(3).max(1000).optional(),
  fieldRemarks: fieldRemarksSchema.optional(),
});
export const reviewSchema = z
  .strictObject({
    decision: z.enum(["ACCEPT", "RETURN"]),
    remarks: remark.optional(),
  })
  .refine((input) => input.decision !== "RETURN" || Boolean(input.remarks), {
    path: ["remarks"],
    message: "Remarks are required when returning.",
  });
export const suspendSchema = z.strictObject({ remarks: z.string().trim().min(3).max(1000) });
export const reinstateSchema = z.strictObject({
  remarks: z.string().trim().min(3).max(1000).optional(),
});
export const listQuerySchema = z.object({
  status: z
    .enum(["DRAFT", "SUBMITTED", "RETURNED", "APPROVED", "REJECTED", "SUSPENDED", "BLACKLISTED"])
    .optional(),
  districtId: uuid.optional(),
  mandalId: uuid.optional(),
  type: z.enum(["INDIVIDUAL", "FPO", "CHC", "AGENCY"]).optional(),
  search: z.string().trim().max(100).optional(),
  submittedFrom: z.iso.datetime({ offset: true }).optional(),
  submittedTo: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type VerifyInput = z.infer<typeof verifySchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
