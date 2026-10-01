import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Following from "@/components/client/Following";
import { Container, PageHeader } from "@/components/layout";
import { getStats } from "@/lib/data";
import { dict, isLocale } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).follow.title, robots: { index: false } } : {};
}

export default async function FollowingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const st = getStats();
  const popular = {
    m: (st?.active ?? []).slice(0, 8).map((a: { id: string }) => a.id),
    s: (st?.top_bought ?? []).slice(0, 8).map((a: { sym: string }) => a.sym),
  };
  return (
    <div>
      <PageHeader title={t.follow.title} sub={t.follow.sub} />
      <Container className="pb-16">
        <Following locale={locale} t={t.follow} types={t.types} site={siteUrl()} popular={popular} />
      </Container>
    </div>
  );
}
