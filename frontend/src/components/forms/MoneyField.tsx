import { useState } from "react";
import { Input } from "@/components/ui/input";
import { paiseToRupees, rupeesToPaise } from "@/utils/money";
import { FormField } from "./fields";

/** Rupees with 2 decimals in the UI; the form value is an integer number of paise (or null). */
export function MoneyField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (paise: number | null) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(paiseToRupees(value));
  return (
    <FormField id={id} label={label} error={error} hint={hint}>
      <Input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        value={text}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          setText(event.target.value);
          onChange(rupeesToPaise(event.target.value));
        }}
        onBlur={() => {
          const paise = rupeesToPaise(text);
          if (paise !== null) setText(paiseToRupees(paise));
        }}
      />
    </FormField>
  );
}
