import type { Language } from "@/config/i18n";

export const roleLabels = {
  FARMER: "farmer",
  PROVIDER: "provider",
  OPERATOR: "operator",
  FIELD_AGENT: "fieldAgent",
  MANDAL_OFFICER: "mandalOfficer",
  DISTRICT_OFFICER: "districtOfficer",
  STATE_ADMIN: "stateAdmin",
  HELPDESK: "helpdesk",
  SUPER_ADMIN: "superAdmin",
} as const;
export type RoleCode = keyof typeof roleLabels;
export type PublicRole = "FARMER" | "PROVIDER";
export type Portal = "farmer" | "provider" | "operator" | "admin";
export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  roles: RoleCode[];
  permissions: string[];
  preferredLanguage: Language;
  onboarding: Partial<Record<RoleCode, OnboardingStatus>>;
  mustChangePassword: boolean;
  jurisdiction: Jurisdiction | null;
}
export type JurisdictionLevel = "STATE" | "DISTRICT" | "MANDAL";
export interface Jurisdiction {
  level: JurisdictionLevel;
  districtId: string | null;
  mandalId: string | null;
}
export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}
export interface AccountProfile {
  id: string;
  username: string;
  displayName: string | null;
  roles: RoleCode[];
  mobile: string | null;
  mobileVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  preferredLanguage: Language;
  createdAt: string;
}
export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
}
export interface ApiError {
  success: false;
  message: string;
  code: string;
  errors: { field: string; message: string }[];
  requestId: string;
}
