import type { RoleCode } from "@/types/auth";

/** Mirrors backend rbac/roles.ts. Used only to limit choices in the UI; the API is authoritative. */
export const roleLevel: Record<RoleCode, number> = {
  SUPER_ADMIN: 100,
  STATE_ADMIN: 80,
  DISTRICT_OFFICER: 60,
  MANDAL_OFFICER: 40,
  FIELD_AGENT: 20,
  HELPDESK: 20,
  PROVIDER: 0,
  OPERATOR: 0,
  FARMER: 0,
};
export const departmentRoles: RoleCode[] = [
  "SUPER_ADMIN",
  "STATE_ADMIN",
  "DISTRICT_OFFICER",
  "MANDAL_OFFICER",
  "FIELD_AGENT",
  "HELPDESK",
];
export const permissions = {
  usersManage: "users.manage",
  providerView: "provider.view",
  providerVerify: "provider.verify",
  providerSuspend: "provider.suspend",
  farmerView: "farmer.view",
  farmerRegisterAssisted: "farmer.register_assisted",
  settingsManage: "settings.manage",
} as const;
