import type { Page } from "@/types/admin";
import type { ApiResponse } from "@/types/auth";
import type { PricingBasis } from "@/types/equipment";
import { api } from "./axios";

export interface RateCap {
  id: string;
  pricingBasis: PricingBasis;
  maxRatePaise: number;
  isActive: boolean;
  category: { id: string; code: string; nameEn: string; nameTe: string };
  operation: { id: string; code: string; nameEn: string; nameTe: string };
  district: { id: string; nameEn: string; nameTe: string } | null;
}
export interface RateCapCreate {
  categoryId: string;
  operationId: string;
  districtId?: string;
  pricingBasis: PricingBasis;
  maxRatePaise: number;
}
export interface RateCapHint {
  enabled: boolean;
  maxRatePaise: number | null;
  scope: "DISTRICT" | "STATEWIDE" | null;
}

export const rateCapsApi = {
  enabled: async () =>
    (await api.get<ApiResponse<{ enabled: boolean }>>("/admin/settings/rate-caps-enabled")).data
      .data,
  setEnabled: async (enabled: boolean) =>
    (
      await api.put<ApiResponse<{ enabled: boolean }>>("/admin/settings/rate-caps-enabled", {
        enabled,
      })
    ).data.data,
  list: async (page: number, pageSize = 50) =>
    (await api.get<ApiResponse<Page<RateCap>>>("/admin/rate-caps", { params: { page, pageSize } }))
      .data.data,
  create: async (payload: RateCapCreate) =>
    (await api.post<ApiResponse<RateCap>>("/admin/rate-caps", payload)).data.data,
  update: async (id: string, patch: { maxRatePaise?: number; isActive?: boolean }) =>
    (await api.patch<ApiResponse<RateCap>>("/admin/rate-caps/" + id, patch)).data.data,
  hint: async (query: { categoryId: string; operationId: string; pricingBasis: PricingBasis }) =>
    (await api.get<ApiResponse<RateCapHint>>("/masters/rate-cap", { params: query })).data.data,
};
