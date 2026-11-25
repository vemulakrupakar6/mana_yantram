import type { ApiResponse } from "@/types/auth";
import type { GeoItem } from "@/types/admin";
import { api } from "./axios";
import { endpoints } from "./endpoints";

export const mastersApi = {
  districts: async () => (await api.get<ApiResponse<GeoItem[]>>(endpoints.districts)).data.data,
  mandals: async (districtId: string) =>
    (await api.get<ApiResponse<GeoItem[]>>(endpoints.mandals(districtId))).data.data,
  villages: async (mandalId: string) =>
    (await api.get<ApiResponse<GeoItem[]>>(endpoints.villages(mandalId))).data.data,
};
