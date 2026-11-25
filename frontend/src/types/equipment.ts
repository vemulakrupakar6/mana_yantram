import type { FileRef } from "@/api/files.api";

export type PricingBasis = "ACRE" | "HOUR" | "DAY";
export type TravelMode = "NONE" | "FLAT" | "PER_KM";
export type CapacityUnit = "HP" | "LITRES" | "FEET" | "TONNES";
export const capacityUnits: CapacityUnit[] = ["HP", "LITRES", "FEET", "TONNES"];
export const pricingBases: PricingBasis[] = ["ACRE", "HOUR", "DAY"];
export const travelModes: TravelMode[] = ["NONE", "FLAT", "PER_KM"];

export interface Operation {
  id: string;
  code: string;
  nameEn: string;
  nameTe: string;
  defaultPricingBasis?: PricingBasis;
}
export interface Category {
  id: string;
  code: string;
  nameEn: string;
  nameTe: string;
  requiresPilotLicence: boolean;
  operations: Operation[];
  requiredDocumentTypes: { code: string; scope: "PROVIDER" | "EQUIPMENT" }[];
}
export interface EquipmentCategory {
  id: string;
  code: string;
  nameEn: string;
  nameTe: string;
  requiresPilotLicence: boolean;
}
export interface Unit {
  id: string;
  unitLabel: string;
  registrationNo: string | null;
  droneUin: string | null;
  status: "ACTIVE" | "INACTIVE";
}
export interface Service {
  id: string;
  operation: Operation;
  pricingBasis: PricingBasis;
  ratePaise: number;
  minChargePaise: number;
  travelMode: TravelMode;
  travelFlatPaise: number | null;
  travelPerKmPaise: number | null;
  freeRadiusKm: string | null;
  workRateAcresPerHour: string;
  isActive: boolean;
}
export interface EquipmentSummary {
  id: string;
  make: string;
  model: string;
  year: number;
  status: "ACTIVE" | "INACTIVE";
  category: EquipmentCategory;
  firstPhoto: FileRef | null;
  units: Unit[];
  unitCount: number;
  serviceCount: number;
}
export interface EquipmentDetail {
  id: string;
  make: string;
  model: string;
  year: number;
  capacityValue: string | null;
  capacityUnit: CapacityUnit | null;
  implements: string[];
  status: "ACTIVE" | "INACTIVE";
  category: EquipmentCategory;
  photos: (FileRef & { sortOrder: number })[];
  units: Unit[];
  services: Service[];
  createdAt: string;
}
export interface EquipmentPayload {
  categoryId: string;
  make: string;
  model: string;
  year: number;
  capacityValue?: number | null;
  capacityUnit?: CapacityUnit | null;
  implements?: string[];
}
export interface ServicePayload {
  operationId: string;
  pricingBasis: PricingBasis;
  ratePaise: number;
  minChargePaise: number;
  travelMode: TravelMode;
  travelFlatPaise?: number;
  travelPerKmPaise?: number;
  freeRadiusKm?: number;
  workRateAcresPerHour: number;
}
