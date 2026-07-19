export function formatDateTime(value?: string | null) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function formatDay(value?: string | null) {
  if (!value) return "较早";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

export function formatMoney(value?: number | null) {
  const amount = value ?? 0;
  if (Math.abs(amount) >= 100_000_000) return `¥${(amount / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(amount) >= 10_000) return `¥${(amount / 10_000).toFixed(1)}万`;
  return `¥${amount.toFixed(0)}`;
}

export function formatNumber(value?: number | null, digits = 0) {
  return (value ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: digits });
}
