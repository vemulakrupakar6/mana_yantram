import type { FileRef } from "@/api/files.api";
import type { GeoItem } from "@/types/admin";

export interface CoverageArea {
  mandalId: string | null;
  villageId: string | null;
  mandal: GeoItem | null;
  village: (GeoItem & { mandal: GeoItem }) | null;
}
export type CoveragePayload =
  | { mode: "RADIUS"; radiusKm: number }
  | { mode: "AREAS"; areas: ({ mandalId: string } | { villageId: string })[] };
export interface WorkingDay {
  weekday: number;
  start: string;
  end: string;
}
export interface Operator {
  id: string;
  fullName: string;
  licenceNo: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  username: string;
  mobile: string | null;
  mustChangePassword: boolean;
  licenceFile: FileRef | null;
  equipment: { id: string; make: string; model: string; year: number }[];
}
export interface CreateOperatorPayload {
  fullName: string;
  mobile: string;
  username: string;
  temporaryPassword: string;
  licenceNo?: string;
  licenceFileId?: string;
  equipmentIds?: string[];
}
export interface AvailabilityBlock {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  createdAt: string;
  unitId: string;
  unitLabel: string;
  equipment: { id: string; make: string; model: string };
}
export interface OperatorSelf {
  fullName: string;
  licenceNo: string | null;
  provider: { name: string; providerNo: string; status: string };
  equipment: {
    id: string;
    make: string;
    model: string;
    year: number;
    status: "ACTIVE" | "INACTIVE";
    category: { id: string; code: string; nameEn: string; nameTe: string };
    units: { id: string; unitLabel: string; registrationNo: string | null; status: string }[];
  }[];
}
