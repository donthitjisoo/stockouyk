export function currency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value);
}

export function number(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

export function percent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${number(value, digits)}%`;
}
