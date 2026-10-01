import { NextResponse } from "next/server";
import { cnbcQuotes } from "@/lib/cnbc";
import { quotes as yahooQuotes } from "@/lib/yahoo";

// GET /api/quotes?s=AAPL,MSFT  ->  { asof, q: { AAPL: Quote, ... } }
// CNBC first (it answers Vercel's servers), Yahoo for anything CNBC did not return.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const syms = Array.from(
    new Set(
      (url.searchParams.get("s") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9.^-]{1,12}$/.test(s)),
    ),
  ).slice(0, 60);
  if (!syms.length) return NextResponse.json({ error: "no symbols" }, { status: 400 });
  const q = await cnbcQuotes(syms);
  const missing = syms.filter((s) => !q[s]);
  if (missing.length) Object.assign(q, await yahooQuotes(missing, false));
  return NextResponse.json(
    { asof: Math.floor(Date.now() / 1000), q },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
  );
}
