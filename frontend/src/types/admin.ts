import type { Jurisdiction, RoleCode } from "@/types/auth";

export type AccountStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  mobile: string | null;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  roles: RoleCode[];
  jurisdiction: Jurisdiction | null;
}
export interface GeoItem {
  id: string;
  lgdCode: string;
  nameEn: string;
  nameTe: string;
}
