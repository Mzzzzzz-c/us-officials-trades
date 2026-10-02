import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WeeklyView from "@/components/WeeklyView";
import { getWeekly } from "@/lib/derived";
import { dict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale).weekly;
  return { title: t.title, description: t.sub };
}

export default async function WeeklyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { weeks } = getWeekly();
  if (!weeks.length) notFound();
  return <WeeklyView locale={locale} weeks={weeks} week={weeks[0]} />;
}
