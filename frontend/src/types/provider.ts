import type { GeoItem } from "@/types/admin";
import type { FileRef } from "@/api/files.api";
import type { CoverageArea } from "@/types/operations";

export type ProviderType = "INDIVIDUAL" | "FPO" | "CHC" | "AGENCY";
export type ProviderStatus =
  "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "REJECTED" | "SUSPENDED" | "BLACKLISTED";
export type ReviewStatus = "PENDING" | "ACCEPTED" | "RETURNED";
export const providerTypes: ProviderType[] = ["INDIVIDUAL", "FPO", "CHC", "AGENCY"];

/** Keys officers can attach remarks to (plan section 7.10). */
export type FieldRemarks = Partial<
  Record<
    | "type"
    | "name"
    | "contactPerson"
    | "mobile"
    | "email"
    | "addressLine"
    | "pincode"
    | "location"
    | "baseLocation"
    | "registrationNo"
    | "gstin"
    | "coverage"
    | "workingHours",
    string
  >
> & { equipment?: Record<string, string> };

export interface BankAccount {
  holderName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string | null;
  branchName: string | null;
  status: ReviewStatus;
  remarks: string | null;
}
export interface Provider {
  id: string;
  providerNo: string;
  type: ProviderType;
  name: string;
  contactPerson: string;
  mobile: string;
  email: string | null;
  addressLine: string;
  pincode: string | null;
  baseLatitude: string;
  baseLongitude: string;
  registrationNo: string | null;
  gstin: string | null;
  status: ProviderStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  district: GeoItem;
  mandal: GeoItem;
  village: GeoItem;
  bankAccount: BankAccount | null;
  coverage: { mode: "RADIUS" | "AREAS" | null; radiusKm: number | null; areas: CoverageArea[] };
  workingHours: { weekday: number; start: string; end: string }[];
  latestReturn: {
    remarks: string | null;
    fieldRemarks: FieldRemarks | null;
    createdAt: string;
  } | null;
  counts: { equipment: number; units: number; operators: number };
  editable: { profile: boolean; equipment: boolean; coverage: boolean; operators: boolean };
}
export interface ProviderProfilePayload {
  type: ProviderType;
  name: string;
  contactPerson: string;
  mobile: string;
  email?: string | null;
  addressLine: string;
  pincode?: string | null;
  districtId: string;
  mandalId: string;
  villageId: string;
  baseLatitude: number;
  baseLongitude: number;
  registrationNo?: string | null;
  gstin?: string | null;
}
export interface ProviderDocumentRow {
  documentTypeCode: string;
  nameEn: string;
  nameTe: string;
  scope: "PROVIDER" | "EQUIPMENT";
  equipmentId: string | null;
  equipmentLabel: string | null;
  required: boolean;
  document?: {
    id: string;
    status: ReviewStatus;
    remarks: string | null;
    updatedAt: string;
    file: FileRef;
  };
}
export interface ChecklistItem {
  key: "profile" | "bankAccount" | "documents" | "equipment" | "coverage" | "workingHours";
  done: boolean;
  detail?: Record<string, number | string[]>;
}
export interface Checklist {
  items: ChecklistItem[];
  canSubmit: boolean;
}
export interface BankPayload {
  holderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
}
