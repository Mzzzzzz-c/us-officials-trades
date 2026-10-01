import { NextResponse } from "next/server";

// TEMPORARY: response shapes of quote sources that answer from Vercel. Removed after testing.
export const dynamic = "force-dynamic";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const NQ = { Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" };

async function hit(url: string, headers: Record<string, string> = {}, n = 2500) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", ...headers }, cache: "no-store" });
    const t = await r.text();
    return { s: r.status, b: t.slice(0, n) };
  } catch (e) {
    return { s: -1, b: String(e).slice(0, 160) };
  }
}

export async function GET() {
  const out: Record<string, unknown> = {};
  out.cnbc = await hit("https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=AAPL%7CBRK.B%7C.SPX%7CSPY&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1", {}, 6000);
  out.nqchart = await hit("https://api.nasdaq.com/api/quote/AAPL/chart?assetclass=stocks", NQ, 1500);
  out.nqhist = await hit("https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=stocks&fromdate=2025-09-01&limit=5", NQ, 1500);
  out.nqetf = await hit("https://api.nasdaq.com/api/quote/SPY/historical?assetclass=etf&fromdate=2026-09-01&limit=3", NQ, 800);
  out.cnbcchart = await hit("https://ts-api.cnbc.com/harmony/app/charts/1D.json?symbol=AAPL", {}, 1200);
  out.cnbcchart5y = await hit("https://ts-api.cnbc.com/harmony/app/charts/5Y.json?symbol=AAPL", {}, 800);
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
