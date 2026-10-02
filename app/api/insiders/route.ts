import { NextResponse } from "next/server";
import { getInsider, getInsiderPeople, getMedia, insiderName, insiderTitle } from "@/lib/data";

// GET /api/insiders?ids=1494730,315090 -> the followed insiders with their latest open-market trades
// (SEC Form 4, public records). Used by the "following" page.
export async function GET(req: Request) {
  const ids = Array.from(new Set((new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => /^\d{1,10}$/.test(x)))).slice(0, 40);
  const { byId } = getInsiderPeople();
  const media = getMedia();
  const out = [];
  for (const id of ids) {
    const p = byId.get(Number(id));
    if (!p) continue;
    const tx: [string, string, string, string, number, number, number][] = [];
    for (const sym of p[4].slice(0, 6)) {
      for (const r of getInsider(sym)?.tx ?? []) if (r[11] === p[0]) tx.push([r[0], r[1], sym, r[5], r[6], r[7], r[8]]);
    }
    tx.sort((a, b) => (a[0] < b[0] ? 1 : -1));
    out.push({ id: p[0], filed: insiderName(p[1]), en: p[10] || "", zh: p[11] || "", title: insiderTitle(p[3]), rel: p[2], syms: p[4].slice(0, 4), logo: media.logos[p[4][0]] ?? 0, photo: media.people[`ins-${p[0]}`] ? 1 : 0, tx: tx.slice(0, 5) });
  }
  return NextResponse.json({ people: out }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
