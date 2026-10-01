import { isLocale } from "@/lib/i18n";
import { OG_SIZE, OG_TYPE } from "@/lib/og";
import { tickerCard, siteCard } from "@/lib/og-cards";

export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = "US Officials' Trades";

// drawn on first request and then cached, rather than thousands at build time
export function generateStaticParams() {
  return [];
}

export default async function Image({ params }: { params: Promise<{ locale: string; sym: string }> }) {
  const { locale, sym } = await params;
  return isLocale(locale) ? tickerCard(locale, sym) : siteCard("en");
}
