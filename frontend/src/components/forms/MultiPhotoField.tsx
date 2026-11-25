import { useRef } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type FileRef } from "@/api/files.api";
import { Button } from "@/components/ui/button";
import { useFileObjectUrl } from "@/hooks/useFileObjectUrl";
import { fileRules } from "@/utils/file-rules";
import { FormField } from "./fields";
import { useFileUpload } from "./FileUploadField";

function Thumbnail({ file }: { file: FileRef }) {
  const { src, isError } = useFileObjectUrl(file.url);
  return src ? (
    <img src={src} alt={file.originalName} className="photo-thumb" />
  ) : (
    <span className="photo-thumb photo-thumb-empty">{isError ? "!" : "…"}</span>
  );
}
/** 1–`max` photos with thumbnails, removal and up/down reordering. Order is the array order. */
export function MultiPhotoField({
  id,
  label,
  value,
  onChange,
  max = 5,
  error,
  disabled,
}: {
  id: string;
  label: string;
  value: FileRef[];
  onChange: (files: FileRef[]) => void;
  max?: number;
  error?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const { upload, uploading, errorKey } = useFileUpload("EQUIPMENT_PHOTO");
  const message = error ?? errorKey ?? undefined;
  const move = (index: number, by: -1 | 1) => {
    const next = [...value];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  return (
    <FormField
      id={id}
      label={label}
      hint={t("photosHint", { max })}
      error={message ? t(message) : undefined}
    >
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        className="sr-only"
        accept={fileRules.EQUIPMENT_PHOTO.accept}
        disabled={disabled || uploading || value.length >= max}
        onChange={async (event) => {
          const files = [...(event.target.files ?? [])].slice(0, max - value.length);
          event.target.value = "";
          const added: FileRef[] = [];
          for (const file of files) {
            const uploaded = await upload(file);
            if (uploaded) added.push(uploaded);
          }
          if (added.length) onChange([...value, ...added]);
        }}
      />
      <ul className="photo-grid">
        {value.map((file, index) => (
          <li key={file.id}>
            <Thumbnail file={file} />
            <div className="inline-actions">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("moveUp")}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={16} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("moveDown")}
                disabled={disabled || index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("remove")}
                disabled={disabled}
                onClick={() => onChange(value.filter((f) => f.id !== file.id))}
              >
                <X size={16} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="small"
        disabled={disabled || uploading || value.length >= max}
        onClick={() => input.current?.click()}
      >
        {t("addPhotos")} ({value.length}/{max})
      </Button>
    </FormField>
  );
}
