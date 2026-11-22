import { useState } from "react";
import { useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/session";
import { errorKey } from "@/features/auth/errors";

export function LogoutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const { key } = useLocation();
  const { t } = useTranslation();
  async function handleLogout() {
    setBusy(true);
    try {
      await logout(key);
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      variant="ghost"
      className={className}
      onClick={() => void handleLogout()}
      disabled={busy}
      aria-busy={busy}
    >
      <LogOut size={18} />
      {t("logout")}
    </Button>
  );
}
