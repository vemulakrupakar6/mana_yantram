import type { FilePurpose } from "@/api/files.api";

export const fileRules: Record<FilePurpose, { maxMb: number; types: string[]; accept: string }> = {
  DOCUMENT: {
    maxMb: 5,
    types: ["application/pdf", "image/jpeg", "image/png"],
    accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png",
  },
  EQUIPMENT_PHOTO: {
    maxMb: 8,
    types: ["image/jpeg", "image/png", "image/webp"],
    accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp",
  },
};
/** Client-side pre-check only; the server re-checks size and the real file type. */
export function precheckFile(
  file: File,
  purpose: FilePurpose,
): "fileTooLarge" | "fileTypeNotAllowed" | null {
  const rule = fileRules[purpose];
  if (file.size > rule.maxMb * 1024 * 1024) return "fileTooLarge";
  if (!rule.types.includes(file.type)) return "fileTypeNotAllowed";
  return null;
}
