import { RoleCode } from "@prisma/client";

export const publicRoles = [RoleCode.FARMER, RoleCode.PROVIDER] as const;
export const departmentRoles: RoleCode[] = [
  RoleCode.FIELD_AGENT,
  RoleCode.MANDAL_OFFICER,
  RoleCode.DISTRICT_OFFICER,
  RoleCode.STATE_ADMIN,
  RoleCode.HELPDESK,
  RoleCode.SUPER_ADMIN,
];
export const roleNames: Record<RoleCode, string> = {
  FARMER: "Farmer",
  PROVIDER: "Service Provider",
  OPERATOR: "Operator",
  FIELD_AGENT: "Field Agent",
  MANDAL_OFFICER: "Mandal Officer",
  DISTRICT_OFFICER: "District Officer",
  STATE_ADMIN: "State Administrator",
  HELPDESK: "Helpdesk",
  SUPER_ADMIN: "Super Administrator",
};
export const portalPermissions = {
  FARMER: "portal:farmer",
  PROVIDER: "portal:provider",
  DEPARTMENT: "portal:department",
} as const;
