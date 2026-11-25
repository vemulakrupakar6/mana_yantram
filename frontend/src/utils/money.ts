/** Rupees text ("1,250.5") → integer paise, or null when empty/invalid. */
export function rupeesToPaise(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
export function paiseToRupees(paise: number | null | undefined): string {
  if (paise == null) return "";
  return (paise / 100).toFixed(2);
}
