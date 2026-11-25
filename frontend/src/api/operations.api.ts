import type { ApiResponse } from "@/types/auth";
import type { Provider } from "@/types/provider";
import type {
  AvailabilityBlock,
  CoveragePayload,
  CreateOperatorPayload,
  Operator,
  OperatorSelf,
  WorkingDay,
} from "@/types/operations";
import { api } from "./axios";

const data = <T>(response: { data: ApiResponse<T> }) => response.data.data;

export const coverageApi = {
  saveCoverage: async (payload: CoveragePayload) =>
    data(await api.put<ApiResponse<Provider>>("/providers/me/coverage", payload)),
  saveHours: async (days: WorkingDay[]) =>
    data(await api.put<ApiResponse<WorkingDay[]>>("/providers/me/working-hours", { days })),
};
const base = "/providers/me/operators";
export const operatorsApi = {
  list: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<Operator[]>>(base, { signal })),
  get: async (id: string, signal?: AbortSignal) =>
    data(await api.get<ApiResponse<Operator>>(`${base}/${id}`, { signal })),
  create: async (payload: CreateOperatorPayload) =>
    data(await api.post<ApiResponse<Operator>>(base, payload)),
  update: async (
    id: string,
    payload: Partial<{
      fullName: string;
      mobile: string;
      licenceNo: string | null;
      licenceFileId: string | null;
    }>,
  ) => data(await api.patch<ApiResponse<Operator>>(`${base}/${id}`, payload)),
  setEquipment: async (id: string, equipmentIds: string[]) =>
    data(await api.put<ApiResponse<Operator>>(`${base}/${id}/equipment`, { equipmentIds })),
  setActive: async (id: string, active: boolean) =>
    data(
      await api.post<ApiResponse<Operator>>(`${base}/${id}/${active ? "activate" : "deactivate"}`),
    ),
  resetPassword: async (id: string, temporaryPassword: string) =>
    data(
      await api.post<ApiResponse<Operator>>(`${base}/${id}/reset-password`, { temporaryPassword }),
    ),
};
export const availabilityApi = {
  list: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<AvailabilityBlock[]>>("/providers/me/availability", { signal })),
  create: async (unitId: string, payload: { startsAt: string; endsAt: string; reason: string }) =>
    data(
      await api.post<ApiResponse<AvailabilityBlock>>(
        `/providers/me/units/${unitId}/blocks`,
        payload,
      ),
    ),
  remove: async (unitId: string, blockId: string) => {
    await api.delete(`/providers/me/units/${unitId}/blocks/${blockId}`);
  },
};
export const operatorSelfApi = {
  me: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<OperatorSelf>>("/operator/me", { signal })),
};
