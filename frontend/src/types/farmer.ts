import type { GeoItem } from "@/types/admin";
import type { Language } from "@/config/i18n";

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type RelationType = "FATHER" | "HUSBAND";
export type CropSeason = "KHARIF" | "RABI" | "SUMMER";
export interface Crop {
  id: string;
  code: string;
  nameEn: string;
  nameTe: string;
}
export interface Farmer {
  id: string;
  username: string;
  fullName: string;
  relationType: RelationType;
  relativeName: string;
  gender: Gender;
  mobile: string | null;
  preferredLanguage: Language;
  district: GeoItem;
  mandal: GeoItem;
  village: GeoItem;
  aadhaar: { masked: string | null; verified: boolean };
  notifications: { sms: boolean; inApp: boolean; push: boolean };
  assisted: boolean;
  status: "ACTIVE" | "INACTIVE";
  plotCount: number;
  createdAt: string;
}
export interface FarmerDetail extends Farmer {
  plots: Plot[];
}
export interface Plot {
  id: string;
  surveyNo: string;
  extentAcres: string;
  latitude: string;
  longitude: string;
  boundary: unknown;
  village: GeoItem & { mandalId: string; districtId: string };
  crops: { crop: Crop; season: CropSeason; year: number }[];
  createdAt: string;
}
export interface FarmerProfilePayload {
  fullName: string;
  relationType: RelationType;
  relativeName: string;
  gender: Gender;
  mobile: string;
  districtId: string;
  mandalId: string;
  villageId: string;
  aadhaarNumber?: string | null;
  preferredLanguage: Language;
  notifications: { sms: boolean; inApp: boolean; push: boolean };
}
export interface PlotPayload {
  surveyNo: string;
  extentAcres: number;
  villageId: string;
  latitude: number;
  longitude: number;
  crops: { cropId: string; season: CropSeason; year: number }[];
}
export interface AssistedPayload {
  account: { username: string; temporaryPassword: string };
  profile: FarmerProfilePayload;
  consent: { farmerConsented: true; acceptTerms: true; acceptPrivacyPolicy: true };
}
