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
  OPERATOR: "portal:operator",
  DEPARTMENT: "portal:department",
} as const;

/** Higher number = more authority. Used for "grant only below/at own level". */
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
export const permissions = {
  portalDepartment: "portal:department",
  portalProvider: "portal:provider",
  portalOperator: "portal:operator",
  portalFarmer: "portal:farmer",
  usersManage: "users.manage",
  providerView: "provider.view",
  providerVerify: "provider.verify",
  providerSuspend: "provider.suspend",
  farmerView: "farmer.view",
  farmerRegisterAssisted: "farmer.register_assisted",
  settingsManage: "settings.manage",
} as const;
export const permissionDescriptions: Record<string, string> = {
  "portal:department": "Access the department portal.",
  "portal:provider": "Access the provider portal.",
  "portal:operator": "Access the operator portal.",
  "portal:farmer": "Access the farmer portal.",
  "users.manage": "Create, deactivate and reset department and scoped users.",
  "provider.view": "View service provider applications within jurisdiction.",
  "provider.verify": "Review documents and approve, return or reject providers.",
  "provider.suspend": "Suspend, blacklist or reinstate providers.",
  "farmer.view": "View farmers within jurisdiction.",
  "farmer.register_assisted": "Register farmers on their behalf.",
  "settings.manage": "Manage application settings such as rate caps.",
};
const p = permissions;
const officerView = [p.portalDepartment, p.providerView, p.farmerView];
/** Explicit role -> permission grants. The seed syncs the database to this matrix. */
export const rolePermissions: Record<RoleCode, readonly string[]> = {
  SUPER_ADMIN: [
    ...officerView,
    p.usersManage,
    p.providerVerify,
    p.providerSuspend,
    p.settingsManage,
  ],
  STATE_ADMIN: [
    ...officerView,
    p.usersManage,
    p.providerVerify,
    p.providerSuspend,
    p.settingsManage,
  ],
  DISTRICT_OFFICER: [...officerView, p.usersManage, p.providerVerify, p.providerSuspend],
  MANDAL_OFFICER: officerView,
  FIELD_AGENT: [p.portalDepartment, p.farmerView, p.farmerRegisterAssisted],
  HELPDESK: [...officerView, p.farmerRegisterAssisted],
  PROVIDER: [p.portalProvider],
  OPERATOR: [p.portalOperator],
  FARMER: [p.portalFarmer],
};
