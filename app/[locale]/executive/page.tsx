import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MemberList from "@/components/MemberList";
import { getMembers } from "@/lib/data";
import { dict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).executive.title } : {};
}

export default async function ExecutivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  // the President and Vice President first, then by latest filing
  const rank = (title?: string) => (title === "President" ? 0 : title === "Vice President" ? 1 : 2);
  const rows = getMembers()
    .filter((m) => m.chamber === "E")
    .sort((a, b) => rank(a.title) - rank(b.title));
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.executive.title}</h1>
      <p className="mt-1 mb-5 text-sm text-muted">{t.executive.intro}</p>
      <MemberList locale={locale} rows={rows} executive />
    </div>
  );
}
