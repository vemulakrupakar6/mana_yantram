import { useState, type ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "./button";

/**
 * A confirmation that also collects remarks. The action is disabled until the remarks are long
 * enough (or immediately, when they are optional).
 */
export function RemarksDialog({
  trigger,
  title,
  description,
  action,
  label,
  minLength = 3,
  maxLength = 1000,
  required = true,
  disabled,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  action: string;
  label: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  onConfirm: (remarks: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const valid = required
    ? trimmed.length >= minLength
    : trimmed.length === 0 || trimmed.length >= minLength;
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setText("");
      }}
    >
      <AlertDialog.Trigger asChild disabled={disabled}>
        {trigger}
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-panel">
          <AlertDialog.Title className="text-xl font-bold">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="muted">{description}</AlertDialog.Description>
          )}
          <div className="form-field mt-4">
            <label htmlFor="remarks-dialog-text">{label}</label>
            <textarea
              id="remarks-dialog-text"
              className="input"
              rows={4}
              maxLength={maxLength}
              value={text}
              aria-invalid={!valid && text.length > 0}
              onChange={(event) => setText(event.target.value)}
            />
            {!valid && text.length > 0 && (
              <p role="alert" className="field-error">
                {t("remarksTooShort", { min: minLength })}
              </p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button disabled={!valid} onClick={() => onConfirm(trimmed)}>
                {action}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
