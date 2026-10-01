// Free quotes and charts from CNBC's public quote service, fetched on the server.
// Yahoo Finance answers "429 Too Many Requests" to Vercel's servers, CNBC does not, so CNBC is the
// first source and Yahoo the fallback (it still works from most other networks, e.g. local dev).
import type { Quote } from "./yahoo";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

interface CnbcQuote {
  symbol: string;
  code?: number;
  last?: string;
  last_time?: string;
  previous_day_closing?: string;
  high?: string;
  low?: string;
  yrhiprice?: string;
  yrloprice?: string;
  curmktstatus?: string;
  ExtendedMktQuote?: { last?: string; change_pct?: string; type?: string };
}

const num = (s?: string): number | undefined => {
  if (s == null) return undefined;
  const v = parseFloat(String(s).replace(/[,$%+]/g, ""));
  return Number.isFinite(v) ? v : undefined;
};

const STATE: Record<string, Quote["st"]> = { REG_MKT: "open", PRE_MKT: "pre", POST_MKT: "post" };

export async function cnbcQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 25) chunks.push(symbols.slice(i, i + 25));
  await Promise.all(
    chunks.map(async (ch) => {
      const url =
        "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=" +
        encodeURIComponent(ch.join("|")) +
        "&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json";
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, next: { revalidate: 30 } });
        if (!r.ok) return;
        const d = (await r.json()) as { FormattedQuoteResult?: { FormattedQuote?: CnbcQuote[] } };
        for (const q of d.FormattedQuoteResult?.FormattedQuote ?? []) {
          const p = num(q.last);
          if (q.code !== 0 || p == null || !ch.includes(q.symbol)) continue;
          const pc = num(q.previous_day_closing) ?? null;
          const ext = q.ExtendedMktQuote;
          out[q.symbol] = {
            s: q.symbol,
            p,
            pc,
            ch: pc ? p / pc - 1 : null,
            hi: num(q.high),
            lo: num(q.low),
            h52: num(q.yrhiprice),
            l52: num(q.yrloprice),
            t: q.last_time ? Math.floor(Date.parse(q.last_time) / 1000) : 0,
            st: STATE[q.curmktstatus ?? ""] ?? "closed",
            ...(ext?.last && num(ext.last) != null ? { xp: num(ext.last), xch: (num(ext.change_pct) ?? 0) / 100 } : {}),
          };
        }
      } catch {
        // leave these symbols to the fallback
      }
    }),
  );
  return out;
}

const RANGE: Record<string, string> = { "1d": "1D", "5d": "5D", "1m": "1M", "6m": "6M", "1y": "1Y", "5y": "5Y", max: "ALL" };

/** Price bars [unixSeconds, o, h, l, c, v]; intraday times are shifted to New York wall-clock time. */
export async function cnbcChart(sym: string, range: string, ttl: number): Promise<{ bars: number[][]; tz: number } | null> {
  const r = RANGE[range];
  if (!r) return null;
  try {
    const res = await fetch(`https://ts-api.cnbc.com/harmony/app/charts/${r}.json?symbol=${encodeURIComponent(sym)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: ttl },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { barData?: { priceBars?: { open: string; high: string; low: string; close: string; volume?: number; tradeTimeinMills: number }[] } };
    const rows = d.barData?.priceBars ?? [];
    const rd = (x: number) => Math.round(x * 1000) / 1000;
    const bars: number[][] = [];
    for (const b of rows) {
      const o = num(b.open), h = num(b.high), l = num(b.low), c = num(b.close);
      if (o == null || h == null || l == null || c == null) continue;
      bars.push([Math.floor(b.tradeTimeinMills / 1000), rd(o), rd(h), rd(l), rd(c), b.volume ?? 0]);
    }
    if (!bars.length) return null;
    // CNBC's "5Y" chart reaches further back; keep five years
    const keep = range === "5y" ? bars.filter((x) => x[0] >= Date.now() / 1000 - 5 * 365.25 * 86400) : bars;
    return { bars: keep, tz: nyOffset(keep[keep.length - 1][0]) };
  } catch {
    return null;
  }
}

/** Seconds to add to a UTC timestamp to get New York local time (EDT -4h / EST -5h). */
export function nyOffset(t: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(t * 1000))
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute) / 1000;
  return Math.round((local - t) / 60) * 60;
}
