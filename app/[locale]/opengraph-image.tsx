import { isLocale } from "@/lib/i18n";
import { OG_SIZE, OG_TYPE } from "@/lib/og";
import { siteCard } from "@/lib/og-cards";

export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = "US Officials' Trades";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return siteCard(isLocale(locale) ? locale : "en");
}
