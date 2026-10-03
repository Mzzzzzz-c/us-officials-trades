import type { Metadata } from "next";
import SectionTabs from "@/components/SectionTabs";
import { notFound } from "next/navigation";
import Holdings from "@/components/client/Holdings";
import { Container, PageHeader } from "@/components/layout";
import { dict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale).holdings;
  return { title: t.title, description: t.sub };
}

export default async function PortfolioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  return (
    <div>
      <PageHeader eyebrow={<SectionTabs locale={locale} group="mine" active="portfolio" />} title={t.holdings.title} sub={t.holdings.sub} />
      <Container className="pb-16">
        <Holdings locale={locale} t={t.holdings} follow={t.follow} types={t.types} sectors={t.sectors} />
      </Container>
    </div>
  );
}
