import type { Locale } from "./i18n";

export function usd(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Compact money: $15K, $1.5M, $2B */
export function usdShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${trim(n / 1e9)}B`;
  if (a >= 1e6) return `$${trim(n / 1e6)}M`;
  if (a >= 1e3) return `$${trim(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function trim(x: number): string {
  const r = Math.abs(x) >= 100 ? Math.round(x) : Math.abs(x) >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100;
  return String(r);
}

export function amountRange(min?: number | null, max?: number | null, short = true): string {
  const f = short ? usdShort : (n: number) => usd(n);
  if (min == null) return "—";
  if (max == null) return `${f(min)}+`;
  if (min === max) return f(min);
  return `${f(min)}–${f(max)}`;
}

export function price(p?: number | null): string {
  if (p == null) return "—";
  return p >= 100 ? usd(p, 2) : p >= 1 ? usd(p, 2) : "$" + p.toPrecision(3);
}

export function priceRange(lo?: number | null, hi?: number | null): string {
  if (lo == null || hi == null) return "—";
  if (Math.abs(lo - hi) < 1e-9) return price(lo);
  return `${price(lo)}–${price(hi)}`;
}

export function shares(n?: number | null): string {
  if (n == null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e4) return Math.round(n / 1000) + "K";
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  return (Math.round(n * 10) / 10).toString();
}

export function shareRange(lo?: number | null, hi?: number | null): string {
  if (lo == null) return "—";
  if (hi == null) return lo > 0 ? `≥ ${shares(lo)}` : "?";
  if (Math.abs(lo - hi) < 1e-9) return shares(lo);
  if (hi >= 1e4 && hi < 1e6 && lo >= 1000) {
    // same unit on both ends: 4.9K–11K rather than 4,915–11K
    const k = (n: number) => (n >= 1e5 ? Math.round(n / 1000) : Math.round(n / 100) / 10) + "K";
    return `${k(lo)}–${k(hi)}`;
  }
  return `${shares(lo)}–${shares(hi)}`;
}

export function pct(x?: number | null, digits = 1): string {
  if (x == null || Number.isNaN(x)) return "—";
  const v = x * 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function num(n?: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

export function quarterLabel(period: string, locale: Locale): string {
  const [y, m] = period.split("-").map(Number);
  const q = Math.ceil(m / 3);
  return locale === "zh" ? `${y}年第${q}季度` : `Q${q} ${y}`;
}

/** Return since entry, and the same window for SPY. */
export function since(entry?: number | null, now?: number | null): number | null {
  if (!entry || !now) return null;
  return now / entry - 1;
}

/** When the data was last rebuilt: Beijing time for Chinese readers, US Eastern for English ones. */
export function updatedAt(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (locale === "zh") {
    const s = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return `${s}（北京时间）`;
  }
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d)} ET`;
}
