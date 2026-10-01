import { NextResponse } from "next/server";
import { getInvestors, getMedia, getMembers, getTickers } from "@/lib/data";
import { isLocale, LOCALES } from "@/lib/i18n";
import { roleShort } from "@/lib/people";

// A compact index for the search palette, built once at deploy time: /api/search/zh, /api/search/en
export const dynamic = "force-static";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return NextResponse.json({ error: "locale" }, { status: 404 });
  const media = getMedia();
  const members = getMembers();
  // people: [id, display name, English name, role, party, has photo, trade count]
  const p = members.map((m) => [m.id, locale === "zh" && m.zh ? m.zh : m.name, m.name, roleShort(m, locale), m.party ?? "", media.people[m.id] ? 1 : 0, m.n]);
  // stocks: [symbol, display name, other-language name, logo kind, trade count]
  const s = getTickers().map((r) => [r.sym, locale === "zh" && r.zh ? r.zh : r.name, locale === "zh" && r.zh ? r.name : r.zh ?? "", media.logos[r.sym] ?? 0, r.n]);
  // investors: [id, name, firm, other-language name, has photo]
  const i = getInvestors().map((v) => [v.id, locale === "zh" ? v.zh : v.en, locale === "zh" ? v.firm_zh : v.firm_en, locale === "zh" ? v.en : v.zh, media.people[`inv-${v.id}`] ? 1 : 0]);
  return NextResponse.json({ p, s, i }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
