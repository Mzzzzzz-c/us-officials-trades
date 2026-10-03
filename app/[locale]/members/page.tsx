import Link from "next/link";
import SectionTabs from "@/components/SectionTabs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MemberList from "@/components/MemberList";
import { Container, PageHeader } from "@/components/layout";
import { getMedia, getMembers } from "@/lib/data";
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
      <PageHeader eyebrow={<SectionTabs locale={locale} group="people" active="members" />}
        title={t.nav.members}
        sub={t.home.intro}
        right={
          <Link prefetch={false} href={`/${locale}/committees`} className="btn btn-quiet text-[15px]">
            {t.committee.link} ›
          </Link>
        }
      />
      <Container>
        <MemberList locale={locale} rows={getMembers().filter((m) => m.chamber !== "E")} photos={getMedia().people} />
      </Container>
    </div>
  );
}
