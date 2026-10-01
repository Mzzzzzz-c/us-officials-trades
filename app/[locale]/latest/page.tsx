import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TradeTable, { type MemberLite } from "@/components/TradeTable";
import { Container, PageHeader } from "@/components/layout";
import { getLatestPrices, getRecent, getUnparsed, memberMap, mediaFor } from "@/lib/data";
import { dict, fmt, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).x.latestFeed } : {};
}

export default async function LatestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const recent = getRecent();
  const mm = memberMap();
  const { px } = getLatestPrices();
  const members: Record<string, MemberLite> = {};
  const pxSub: Record<string, number> = { SPY: px.SPY };
  for (const tr of recent) {
    const m = mm.get(tr.m);
    if (m && !members[tr.m]) members[tr.m] = { name: m.name, zh: m.zh, party: m.party, chamber: m.chamber, state: m.state, agency: m.agency, agency_zh: m.agency_zh };
    if (tr.sym && px[tr.sym] != null) pxSub[tr.sym] = px[tr.sym];
  }
  const media = mediaFor(Object.keys(members), recent.map((r) => r.sym ?? ""));
  const unparsed = getUnparsed().length;
  return (
    <div>
      <PageHeader title={t.x.latestFeed} sub={t.home.intro} />
      <Container>
        <TradeTable locale={locale} trades={recent} members={members} px={pxSub} filters media={media} />
        {unparsed > 0 && (
          <p className="mt-4 text-xs text-muted">
            {fmt(t.home.unparsedNote, { n: unparsed })}
            <Link prefetch={false} className="link" href={`/${locale}/unparsed`}>
              {t.home.unparsedLink}
            </Link>
          </p>
        )}
      </Container>
    </div>
  );
}
