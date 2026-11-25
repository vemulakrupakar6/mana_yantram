import type { ApiResponse } from "@/types/auth";
import { api } from "./axios";

export type FilePurpose = "DOCUMENT" | "EQUIPMENT_PHOTO";
export interface FileRef {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes?: number;
}
/** The API returns absolute-from-origin URLs ("/api/v1/files/<id>"); the client's baseURL already has that prefix. */
export const filePath = (url: string) => url.replace(/^\/api\/v1/, "");

export const filesApi = {
  upload: async (file: File, purpose: FilePurpose, onProgress?: (percent: number) => void) => {
    const body = new FormData();
    body.append("purpose", purpose);
    body.append("file", file);
    const response = await api.post<ApiResponse<FileRef>>("/files", body, {
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
      },
    });
    return response.data.data;
  },
  remove: async (id: string) => {
    await api.delete("/files/" + id);
  },
  blob: async (url: string, signal?: AbortSignal) =>
    (await api.get<Blob>(filePath(url), { responseType: "blob", signal })).data,
};
/** Fetch with the bearer token and open the result in a new tab (PDFs and images). */
export async function openFile(url: string) {
  const opened = window.open("", "_blank");
  try {
    const objectUrl = URL.createObjectURL(await filesApi.blob(url));
    if (opened) opened.location.href = objectUrl;
    else window.open(objectUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    opened?.close();
    throw error;
  }
}
