import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Reveal from "@/components/client/Reveal";
import { Container, PageHeader } from "@/components/layout";
import { Avatar, Logo } from "@/components/media";
import { getInvestors, getMedia } from "@/lib/data";
import { quarterLabel, usdShort } from "@/lib/format";
import { dict, fmt, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).investors.title } : {};
}

export default async function InvestorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const media = getMedia();
  const list = [...getInvestors()].sort((a, b) => b.value - a.value);
  return (
    <div>
      <PageHeader title={t.investors.title} sub={t.investors.intro} />
      <Container className="pb-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((iv, i) => {
            const pid = `inv-${iv.id}`;
            return (
              <Reveal key={iv.id} delay={Math.min(i, 9) * 40}>
                <Link prefetch={false} href={`/${locale}/investor/${iv.id}`} className="tile flex h-full flex-col p-5">
                  <div className="flex items-center gap-4">
                    <Avatar id={pid} name={locale === "zh" ? iv.zh : iv.en} has={!!media.people[pid]} size={60} ring={false} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[17px] font-semibold tracking-tight">{locale === "zh" ? iv.zh : iv.en}</span>
                        {iv.inferred ? (
                          <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn" title={t.investors.inferredNote}>
                            {t.investors.inferred}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-[13px] text-muted">{locale === "zh" ? iv.firm_zh : iv.firm_en}</div>
                    </div>
                  </div>
                  <div className="mt-5 flex items-end justify-between">
                    <div>
                      <div className="text-[28px] font-semibold tracking-tight">{usdShort(iv.value)}</div>
                      <div className="text-xs text-faint">
                        {quarterLabel(iv.period, locale)} · {fmt(t.investors.nHoldings, { n: iv.n })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-5">
                    {iv.top.slice(0, 5).map((s) => (
                      <span key={s} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-2.5 pl-1 text-[12px] font-medium">
                        <Logo sym={s} kind={media.logos[s]} size={20} />
                        {s}
                      </span>
                    ))}
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </div>
  );
}
