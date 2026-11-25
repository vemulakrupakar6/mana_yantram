import { expect, test } from "vitest";
import en from "./en.json";
import te from "./te.json";

test("English and Telugu define exactly the same keys", () => {
  const a = Object.keys(en).sort();
  const b = Object.keys(te).sort();
  expect(a.filter((key) => !b.includes(key))).toEqual([]);
  expect(b.filter((key) => !a.includes(key))).toEqual([]);
});
test("no translation is empty and interpolation placeholders match", () => {
  const placeholders = (value: string) => (value.match(/{{\s*\w+\s*}}/g) ?? []).sort();
  for (const [key, value] of Object.entries(en as Record<string, string>)) {
    const other = (te as Record<string, string>)[key];
    expect(value.trim(), key).not.toBe("");
    expect(other.trim(), key).not.toBe("");
    expect(placeholders(other), key).toEqual(placeholders(value));
  }
});
