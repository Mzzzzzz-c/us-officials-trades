import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TickerList from "@/components/TickerList";
import { getTickers } from "@/lib/data";
import { dict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).nav.tickers } : {};
}

export default async function TickersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold">{t.nav.tickers}</h1>
      <TickerList locale={locale} rows={getTickers()} />
    </div>
  );
}
