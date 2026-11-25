import type { Page } from "@/types/admin";
import type { ApiResponse } from "@/types/auth";
import type {
  AssistedPayload,
  Crop,
  Farmer,
  FarmerDetail,
  FarmerProfilePayload,
  Plot,
  PlotPayload,
} from "@/types/farmer";
import { api } from "./axios";

const data = <T>(response: { data: ApiResponse<T> }) => response.data.data;
const params = (query: object) =>
  Object.fromEntries(Object.entries(query).filter(([, value]) => value !== "" && value != null));

export const farmersApi = {
  me: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<Farmer>>("/farmers/me", { signal })),
  create: async (payload: FarmerProfilePayload) =>
    data(await api.post<ApiResponse<Farmer>>("/farmers/me", payload)),
  update: async (payload: Partial<FarmerProfilePayload>) =>
    data(await api.patch<ApiResponse<Farmer>>("/farmers/me", payload)),
  plots: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<Plot[]>>("/farmers/me/plots", { signal })),
  plot: async (id: string, signal?: AbortSignal) =>
    data(await api.get<ApiResponse<Plot>>("/farmers/me/plots/" + id, { signal })),
  createPlot: async (payload: PlotPayload) =>
    data(await api.post<ApiResponse<Plot>>("/farmers/me/plots", payload)),
  updatePlot: async (id: string, payload: Partial<PlotPayload>) =>
    data(await api.patch<ApiResponse<Plot>>("/farmers/me/plots/" + id, payload)),
  deletePlot: async (id: string) => {
    await api.delete("/farmers/me/plots/" + id);
  },
  crops: async () => data(await api.get<ApiResponse<Crop[]>>("/masters/crops")),
};
export const assistedApi = {
  register: async (payload: AssistedPayload) =>
    data(await api.post<ApiResponse<Farmer>>("/assisted/farmers", payload)),
  list: async (query: { search?: string; page: number }, signal?: AbortSignal) =>
    data(
      await api.get<ApiResponse<Page<Farmer>>>("/assisted/farmers", {
        params: params(query),
        signal,
      }),
    ),
  get: async (id: string, signal?: AbortSignal) =>
    data(await api.get<ApiResponse<FarmerDetail>>("/assisted/farmers/" + id, { signal })),
  addPlot: async (id: string, payload: PlotPayload) =>
    data(await api.post<ApiResponse<Plot>>(`/assisted/farmers/${id}/plots`, payload)),
};
export const adminFarmersApi = {
  list: async (
    query: {
      districtId?: string;
      mandalId?: string;
      villageId?: string;
      search?: string;
      assisted?: string;
      page: number;
    },
    signal?: AbortSignal,
  ) =>
    data(
      await api.get<ApiResponse<Page<Farmer>>>("/admin/farmers", { params: params(query), signal }),
    ),
  get: async (id: string, signal?: AbortSignal) =>
    data(await api.get<ApiResponse<FarmerDetail>>("/admin/farmers/" + id, { signal })),
};
