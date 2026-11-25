import { useRef, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { filesApi, openFile, type FilePurpose, type FileRef } from "@/api/files.api";
import { LoadingSpinner } from "@/components/common/shared";
import { Button } from "@/components/ui/button";
import { fileRules, precheckFile } from "@/utils/file-rules";
import type { ApiError } from "@/types/auth";
import { FormField } from "./fields";

const serverErrors: Record<string, string> = {
  FILE_TOO_LARGE: "fileTooLarge",
  FILE_TYPE_NOT_ALLOWED: "fileTypeNotAllowed",
  RATE_LIMITED: "rateLimited",
};
export function uploadErrorKey(error: unknown) {
  return axios.isAxiosError<ApiError>(error)
    ? (serverErrors[error.response?.data?.code ?? ""] ?? "uploadFailed")
    : "uploadFailed";
}
/** Uploads immediately (step 1) and hands the resulting file to the form, which submits its id (step 2). */
export function useFileUpload(purpose: FilePurpose) {
  const [progress, setProgress] = useState<number | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  async function upload(file: File): Promise<FileRef | null> {
    const problem = precheckFile(file, purpose);
    if (problem) {
      setErrorKey(problem);
      return null;
    }
    setErrorKey(null);
    setProgress(0);
    try {
      return await filesApi.upload(file, purpose, setProgress);
    } catch (error) {
      setErrorKey(uploadErrorKey(error));
      return null;
    } finally {
      setProgress(null);
    }
  }
  return {
    upload,
    progress,
    errorKey,
    uploading: progress !== null,
    clearError: () => setErrorKey(null),
  };
}

export function FileUploadField({
  id,
  label,
  purpose = "DOCUMENT",
  value,
  onChange,
  current,
  error,
  disabled,
}: {
  id: string;
  label: string;
  purpose?: FilePurpose;
  /** File just uploaded in this form (not yet attached). */
  value: FileRef | null;
  onChange: (file: FileRef | null) => void;
  /** Already-saved file shown when nothing new has been chosen. */
  current?: FileRef | null;
  error?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const { upload, progress, errorKey, uploading } = useFileUpload(purpose);
  const shown = value ?? current ?? null;
  const message = error ?? errorKey ?? undefined;
  const view = (file: FileRef) => void openFile(file.url).catch(() => undefined);
  return (
    <FormField
      id={id}
      label={label}
      hint={t("fileHint", { mb: fileRules[purpose].maxMb })}
      error={message ? t(message) : undefined}
    >
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        accept={fileRules[purpose].accept}
        disabled={disabled || uploading}
        aria-invalid={Boolean(message)}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const uploaded = await upload(file);
          if (uploaded) onChange(uploaded);
        }}
      />
      <div className="inline-actions">
        {shown && <span className="file-name">{shown.originalName}</span>}
        {shown && (
          <Button type="button" variant="outline" size="small" onClick={() => view(shown)}>
            {t("view")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="small"
          disabled={disabled || uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? <LoadingSpinner size={16} /> : null}
          {shown ? t("replace") : t("chooseFile")}
        </Button>
      </div>
      {uploading && (
        <progress value={progress ?? 0} max={100} aria-label={t("uploading")}>
          {progress}%
        </progress>
      )}
    </FormField>
  );
}
