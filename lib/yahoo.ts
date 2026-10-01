// Free market data from Yahoo Finance's public chart endpoints, fetched on the server
// (the browser can't call them directly) and cached briefly at Vercel's edge.

export const yahooSymbol = (s: string) => s.replace(/\./g, "-");
export const fromYahoo = (s: string) => s.replace(/-/g, ".");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

export async function yahooJson(path: string, revalidate: number): Promise<unknown | null> {
  for (const host of HOSTS) {
    try {
      const r = await fetch(host + path, { headers: { "User-Agent": UA, Accept: "application/json" }, next: { revalidate } });
      if (r.ok) return await r.json();
    } catch {
      // try the other host
    }
  }
  return null;
}

export interface Quote {
  s: string; // our symbol
  p: number; // last price
  pc: number | null; // previous close
  ch: number | null; // change (fraction)
  hi?: number;
  lo?: number;
  h52?: number;
  l52?: number;
  t: number; // unix seconds of the last trade
  st: "open" | "pre" | "post" | "closed";
  spark?: number[]; // intraday closes (5-minute)
}

interface SparkMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketTime?: number;
  currentTradingPeriod?: { pre?: { start: number; end: number }; regular?: { start: number; end: number }; post?: { start: number; end: number } };
}

export async function quotes(symbols: string[], withSpark = false): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  const now = Date.now() / 1000;
  await Promise.all(
    chunks.map(async (ch) => {
      const d = (await yahooJson(`/v7/finance/spark?symbols=${ch.map(yahooSymbol).join(",")}&range=1d&interval=5m`, 60)) as {
        spark?: { result?: { symbol: string; response?: { meta: SparkMeta; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }[] };
      } | null;
      for (const r of d?.spark?.result ?? []) {
        const res = r.response?.[0];
        const m = res?.meta;
        if (!m?.regularMarketPrice) continue;
        const pc = m.previousClose ?? m.chartPreviousClose ?? null;
        const tp = m.currentTradingPeriod;
        const st: Quote["st"] = tp?.regular && now >= tp.regular.start && now < tp.regular.end ? "open" : tp?.pre && now >= tp.pre.start && now < tp.pre.end ? "pre" : tp?.post && now >= tp.post.start && now < tp.post.end ? "post" : "closed";
        const sym = fromYahoo(r.symbol);
        const q: Quote = {
          s: sym,
          p: m.regularMarketPrice,
          pc,
          ch: pc ? m.regularMarketPrice / pc - 1 : null,
          hi: m.regularMarketDayHigh,
          lo: m.regularMarketDayLow,
          h52: m.fiftyTwoWeekHigh,
          l52: m.fiftyTwoWeekLow,
          t: m.regularMarketTime ?? 0,
          st,
        };
        if (withSpark) {
          const c = res?.indicators?.quote?.[0]?.close ?? [];
          q.spark = c.filter((x): x is number => x != null).map((x) => Math.round(x * 100) / 100);
        }
        out[sym] = q;
      }
    }),
  );
  return out;
}
