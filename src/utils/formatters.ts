export function formatNumber(value: number | undefined, digits = 2): string {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: digits });
}

export function formatPercent(value: number | undefined): string {
  if (!Number.isFinite(value)) return "-";
  return `${Number(value).toFixed(2)}%`;
}

export function formatCurrency(value: number | undefined): string {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function formatDate(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

export function classForSignedValue(value: number): string {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}
