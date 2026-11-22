import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { fieldDescription, FormField, PasswordInput, SelectField } from "./fields";

export function TextField({
  label,
  hint,
  error,
  input,
  kind = "text",
}: {
  label: string;
  hint?: string;
  error?: string;
  input: ComponentProps<"input"> & { id: string };
  kind?: "text" | "password";
}) {
  const { t } = useTranslation();
  const Component = kind === "password" ? PasswordInput : Input;
  return (
    <FormField
      id={input.id}
      label={t(label)}
      error={error ? t(error) : undefined}
      hint={hint ? t(hint) : undefined}
    >
      <Component
        {...input}
        aria-invalid={Boolean(error)}
        aria-describedby={fieldDescription(input.id, Boolean(hint), error)}
      />
    </FormField>
  );
}
export function LanguageField({ id, ...props }: ComponentProps<"select"> & { id: string }) {
  const { t } = useTranslation();
  return (
    <FormField id={id} label={t("preferredLanguage")}>
      <SelectField {...props} id={id}>
        <option value="en" lang="en">
          English
        </option>
        <option value="te" lang="te">
          తెలుగు
        </option>
      </SelectField>
    </FormField>
  );
}
