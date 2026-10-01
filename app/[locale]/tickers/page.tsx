import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, PageHeader } from "@/components/layout";
import TickerList from "@/components/TickerList";
import { getLatestPrices, getMedia, getTickers } from "@/lib/data";
import { dict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).nav.tickers } : {};
}

export default async function TickersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const rows = getTickers();
  const { px, pc = {} } = getLatestPrices();
  const keep = (m: Record<string, number>) => Object.fromEntries(rows.filter((r) => m[r.sym] != null).map((r) => [r.sym, Math.round(m[r.sym] * 100) / 100]));
  return (
    <div>
      <PageHeader title={t.nav.tickers} sub={t.x.liveNote} />
      <Container>
        <TickerList locale={locale} rows={rows} logos={getMedia().logos} px={keep(px)} pc={keep(pc)} />
      </Container>
    </div>
  );
}
