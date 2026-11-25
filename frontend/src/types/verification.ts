import type { FileRef } from "@/api/files.api";
import type { GeoItem } from "@/types/admin";
import type { RoleCode } from "@/types/auth";
import type { Service, Unit } from "@/types/equipment";
import type { CoverageArea } from "@/types/operations";
import type {
  BankAccount,
  FieldRemarks,
  ProviderDocumentRow,
  ProviderStatus,
  ProviderType,
} from "@/types/provider";

export type VerificationAction =
  "SUBMIT" | "APPROVE" | "RETURN" | "REJECT" | "SUSPEND" | "BLACKLIST" | "REINSTATE";
export interface HistoryItem {
  id: string;
  action: VerificationAction;
  fromStatus: ProviderStatus;
  toStatus: ProviderStatus;
  remarks: string | null;
  fieldRemarks: FieldRemarks | null;
  createdAt: string;
  actorRole: RoleCode | null;
  actorRoleName: string | null;
}
export interface AdminProviderRow {
  id: string;
  providerNo: string;
  name: string;
  type: ProviderType;
  status: ProviderStatus;
  mobile: string;
  submittedAt: string | null;
  district: GeoItem;
  mandal: GeoItem;
  pendingDocs: number;
}
export interface ReviewEquipment {
  id: string;
  make: string;
  model: string;
  year: number;
  capacityValue: string | null;
  capacityUnit: string | null;
  implements: string[];
  status: "ACTIVE" | "INACTIVE";
  category: { id: string; code: string; nameEn: string; nameTe: string };
  units: Unit[];
  photos: FileRef[];
  services: Omit<Service, "isActive">[];
}
export interface AdminProviderDetail {
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
  bankAccount: (BankAccount & { reviewedAt: string | null }) | null;
  coverage: { mode: "RADIUS" | "AREAS" | null; radiusKm: number | null; areas: CoverageArea[] };
  workingHours: { weekday: number; start: string; end: string }[];
  equipment: ReviewEquipment[];
  operators: {
    id: string;
    fullName: string;
    licenceNo: string | null;
    status: string;
    licenceFile: { id: string } | null;
  }[];
  documents: ProviderDocumentRow[];
  history: HistoryItem[];
}
export interface VerifyPayload {
  action: "APPROVE" | "RETURN" | "REJECT";
  remarks?: string;
  fieldRemarks?: FieldRemarks;
}
