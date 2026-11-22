import { useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <p id={id + "-hint"} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={id + "-error"} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function fieldDescription(id: string, hint: boolean, error?: string) {
  return (
    [hint ? id + "-hint" : "", error ? id + "-error" : ""].filter(Boolean).join(" ") || undefined
  );
}
export function PasswordInput(props: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  return (
    <div className="password-field">
      <Input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible(!visible)}
        aria-label={t(visible ? "hidePassword" : "showPassword")}
      >
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  );
}
export function SelectField({ children, ...props }: ComponentProps<"select">) {
  return (
    <div className="select-field">
      <select className="input" {...props}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </div>
  );
}
