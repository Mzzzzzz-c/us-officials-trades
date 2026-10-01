import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MemberList from "@/components/MemberList";
import { Container, PageHeader } from "@/components/layout";
import { getMedia, getMembers } from "@/lib/data";
import { dict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).executive.title } : {};
}

export default async function ExecutivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  return (
    <div>
      <PageHeader title={t.executive.title} sub={t.executive.intro} />
      <Container>
        <MemberList locale={locale} rows={getMembers().filter((m) => m.chamber === "E")} executive photos={getMedia().people} />
      </Container>
    </div>
  );
}
