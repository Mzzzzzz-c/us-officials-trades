import { NextResponse } from "next/server";
import { cnbcChart } from "@/lib/cnbc";
import { yahooJson, yahooSymbol } from "@/lib/yahoo";

const RANGES: Record<string, { range: string; interval: string; ttl: number }> = {
  "1d": { range: "1d", interval: "5m", ttl: 60 },
  "5d": { range: "5d", interval: "30m", ttl: 300 },
  "1m": { range: "1mo", interval: "1d", ttl: 900 },
  "6m": { range: "6mo", interval: "1d", ttl: 1800 },
  "1y": { range: "1y", interval: "1d", ttl: 3600 },
  "5y": { range: "5y", interval: "1d", ttl: 3600 },
  max: { range: "max", interval: "1wk", ttl: 3600 * 6 },
};

interface ChartResult {
  timestamp?: number[];
  indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
  meta?: { gmtoffset?: number };
}

// GET /api/chart?s=AAPL&r=1y  ->  { r, bars: [[unixSeconds, o, h, l, c, v], ...] }  (split-adjusted)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sym = (url.searchParams.get("s") ?? "").toUpperCase();
  const r = RANGES[url.searchParams.get("r") ?? "1y"] ?? RANGES["1y"];
  if (!/^[A-Z0-9.^-]{1,12}$/.test(sym)) return NextResponse.json({ error: "bad symbol" }, { status: 400 });
  const rk = url.searchParams.get("r") ?? "1y";
  const cn = await cnbcChart(sym, rk, r.ttl);
  if (cn) {
    return NextResponse.json(
      { r: rk, tz: cn.tz, bars: cn.bars, src: "cnbc" },
      { headers: { "Cache-Control": `public, s-maxage=${r.ttl}, stale-while-revalidate=${r.ttl * 4}` } },
    );
  }
  const d = (await yahooJson(`/v8/finance/chart/${yahooSymbol(sym)}?range=${r.range}&interval=${r.interval}`, r.ttl)) as {
    chart?: { result?: ChartResult[] };
  } | null;
  const res = d?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  const bars: number[][] = [];
  (res?.timestamp ?? []).forEach((t, i) => {
    const o = q?.open?.[i], h = q?.high?.[i], l = q?.low?.[i], c = q?.close?.[i];
    if (o == null || h == null || l == null || c == null) return;
    const rd = (x: number) => Math.round(x * 1000) / 1000;
    bars.push([t, rd(o), rd(h), rd(l), rd(c), q?.volume?.[i] ?? 0]);
  });
  if (!bars.length) return NextResponse.json({ error: "no data" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  return NextResponse.json(
    { r: url.searchParams.get("r") ?? "1y", tz: res?.meta?.gmtoffset ?? 0, bars },
    { headers: { "Cache-Control": `public, s-maxage=${r.ttl}, stale-while-revalidate=${r.ttl * 4}` } },
  );
}
