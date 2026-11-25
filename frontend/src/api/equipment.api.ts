import type { FileRef } from "@/api/files.api";
import type { ApiResponse } from "@/types/auth";
import type {
  Category,
  EquipmentDetail,
  EquipmentPayload,
  EquipmentSummary,
  Service,
  ServicePayload,
  Unit,
} from "@/types/equipment";
import { api } from "./axios";

const data = <T>(response: { data: ApiResponse<T> }) => response.data.data;
const base = "/providers/me/equipment";

export const equipmentApi = {
  categories: async () => data(await api.get<ApiResponse<Category[]>>("/masters/categories")),
  list: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<EquipmentSummary[]>>(base, { signal })),
  get: async (id: string, signal?: AbortSignal) =>
    data(await api.get<ApiResponse<EquipmentDetail>>(`${base}/${id}`, { signal })),
  create: async (payload: EquipmentPayload & { numberOfUnits: number; photoFileIds: string[] }) =>
    data(await api.post<ApiResponse<EquipmentDetail>>(base, payload)),
  update: async (id: string, payload: Partial<EquipmentPayload>) =>
    data(await api.patch<ApiResponse<EquipmentDetail>>(`${base}/${id}`, payload)),
  setActive: async (id: string, active: boolean) =>
    data(
      await api.post<ApiResponse<EquipmentDetail>>(
        `${base}/${id}/${active ? "activate" : "deactivate"}`,
      ),
    ),
  setPhotos: async (id: string, fileIds: string[]) =>
    data(
      await api.put<ApiResponse<(FileRef & { sortOrder: number })[]>>(`${base}/${id}/photos`, {
        fileIds,
      }),
    ),
  addUnits: async (id: string, count: number) =>
    data(await api.post<ApiResponse<Unit[]>>(`${base}/${id}/units`, { count })),
  updateUnit: async (
    id: string,
    unitId: string,
    payload: Partial<{
      registrationNo: string | null;
      droneUin: string | null;
      status: "ACTIVE" | "INACTIVE";
    }>,
  ) => data(await api.patch<ApiResponse<Unit>>(`${base}/${id}/units/${unitId}`, payload)),
  addService: async (id: string, payload: ServicePayload) =>
    data(await api.post<ApiResponse<Service>>(`${base}/${id}/services`, payload)),
  updateService: async (
    id: string,
    serviceId: string,
    payload: Partial<
      Omit<ServicePayload, "travelFlatPaise" | "travelPerKmPaise" | "freeRadiusKm">
    > & {
      // null clears the field (used when the travel mode changes)
      travelFlatPaise?: number | null;
      travelPerKmPaise?: number | null;
      freeRadiusKm?: number | null;
    },
  ) => data(await api.patch<ApiResponse<Service>>(`${base}/${id}/services/${serviceId}`, payload)),
  removeService: async (id: string, serviceId: string) => {
    await api.delete(`${base}/${id}/services/${serviceId}`);
  },
};
