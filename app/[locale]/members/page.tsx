import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MemberList from "@/components/MemberList";
import { getMembers } from "@/lib/data";
import { dict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).nav.members } : {};
}

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.nav.members}</h1>
      <p className="mt-1 mb-5 text-sm text-muted">{t.home.intro}</p>
      <MemberList locale={locale} rows={getMembers().filter((m) => m.chamber !== "E")} />
    </div>
  );
}
