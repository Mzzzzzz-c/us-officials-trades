import { NextResponse } from "next/server";
import { quotes } from "@/lib/yahoo";

// GET /api/quotes?s=AAPL,MSFT[&spark=1]  ->  { asof, q: { AAPL: Quote, ... } }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const syms = (url.searchParams.get("s") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.^-]{1,12}$/.test(s))
    .slice(0, 60);
  if (!syms.length) return NextResponse.json({ error: "no symbols" }, { status: 400 });
  const q = await quotes(Array.from(new Set(syms)), url.searchParams.get("spark") === "1");
  return NextResponse.json(
    { asof: Math.floor(Date.now() / 1000), q },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
