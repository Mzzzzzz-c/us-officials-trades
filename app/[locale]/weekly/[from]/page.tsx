import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WeeklyView from "@/components/WeeklyView";
import { getWeekly } from "@/lib/derived";
import { dict, isLocale } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return getWeekly().weeks.map((w) => ({ from: w.from }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; from: string }> }): Promise<Metadata> {
  const { locale, from } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale).weekly;
  return { title: `${t.title} ${from}`, description: t.sub };
}

export default async function WeekPage({ params }: { params: Promise<{ locale: string; from: string }> }) {
  const { locale, from } = await params;
  if (!isLocale(locale)) notFound();
  const { weeks } = getWeekly();
  const week = weeks.find((w) => w.from === from);
  if (!week) notFound();
  return <WeeklyView locale={locale} weeks={weeks} week={week} />;
}
