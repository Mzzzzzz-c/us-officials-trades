import { NextResponse } from "next/server";

// TEMPORARY: which free quote sources answer from Vercel's servers. Removed after testing.
export const dynamic = "force-dynamic";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function hit(url: string, headers: Record<string, string> = {}) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", ...headers }, cache: "no-store" });
    const t = await r.text();
    return { s: r.status, b: t.slice(0, 160), c: r.headers.get("set-cookie")?.slice(0, 80) ?? null };
  } catch (e) {
    return { s: -1, b: String(e).slice(0, 160), c: null };
  }
}

export async function GET() {
  const out: Record<string, unknown> = {};
  out.y1spark = await hit("https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL&range=1d&interval=5m");
  out.y2spark = await hit("https://query2.finance.yahoo.com/v7/finance/spark?symbols=AAPL&range=1d&interval=5m");
  out.y1chart = await hit("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m");
  out.y2chart = await hit("https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m");
  out.stooq = await hit("https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv");
  out.cnbc = await hit("https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=AAPL%7CNVDA&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json");
  out.nasdaq = await hit("https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks", { Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" });
  out.twelve = await hit("https://api.twelvedata.com/quote?symbol=AAPL&apikey=demo");
  // Yahoo's cookie + crumb handshake (what yfinance does)
  const fc = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", cache: "no-store" }).catch(() => null);
  const cookie = fc?.headers.get("set-cookie")?.split(";")[0] ?? "";
  out.fc = { s: fc?.status ?? -1, cookie: cookie.slice(0, 30) };
  if (cookie) {
    const cr = await hit("https://query2.finance.yahoo.com/v1/test/getcrumb", { Cookie: cookie });
    out.crumb = cr;
    if (cr.s === 200) out.y7quote = await hit(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL,NVDA&crumb=${encodeURIComponent(cr.b)}`, { Cookie: cookie });
    out.y2sparkCookie = await hit("https://query2.finance.yahoo.com/v7/finance/spark?symbols=AAPL&range=1d&interval=5m", { Cookie: cookie });
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
