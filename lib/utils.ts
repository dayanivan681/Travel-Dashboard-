export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
  );
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse a YYYY-MM-DD string as a local date (avoids UTC off-by-one).
export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysBetween(a: string, b: string): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.round(ms / 86400000);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function fmtDate(s?: string): string {
  if (!s) return "—";
  return parseDate(s).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateShort(s?: string): string {
  if (!s) return "—";
  return parseDate(s).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Accepts "YYYY-MM-DD" or full ISO datetime; returns a friendly string.
export function fmtDateTime(s?: string): string {
  if (!s) return "—";
  if (s.length <= 10) return fmtDate(s);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtMoney(amount?: number, currency = "USD"): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const n = daysBetween(start, end);
  for (let i = 0; i <= Math.max(0, n); i++) out.push(addDays(start, i));
  return out;
}

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "MXN",
  "CHF",
  "CNY",
  "INR",
  "BRL",
  "KRW",
];
