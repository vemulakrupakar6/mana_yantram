import type { JurisdictionLevel, OnboardingStatus, RoleCode } from "@prisma/client";

export interface UserSummary {
  id: string;
  username: string;
  displayName: string | null;
  roles: RoleCode[];
  permissions: string[];
  preferredLanguage: "en" | "te";
  onboarding: Partial<Record<RoleCode, OnboardingStatus>>;
  mustChangePassword: boolean;
  jurisdiction: {
    level: JurisdictionLevel;
    districtId: string | null;
    mandalId: string | null;
  } | null;
}
export interface RequestDetails {
  requestId: string;
  ipAddress?: string;
}
export interface Session {
  accessToken: string;
  user: UserSummary;
  refreshToken: string;
  expiresAt: Date;
}
