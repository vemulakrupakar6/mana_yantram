import type { ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "./button";

export function ConfirmDialog({
  trigger,
  title,
  description,
  action,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-panel">
          <AlertDialog.Title className="text-xl font-bold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="muted">{description}</AlertDialog.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={onConfirm}>{action}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
