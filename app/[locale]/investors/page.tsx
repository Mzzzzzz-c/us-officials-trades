import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvestors } from "@/lib/data";
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
  const list = [...getInvestors()].sort((a, b) => b.value - a.value);
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.investors.title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t.investors.intro}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((iv) => (
          <Link key={iv.id} prefetch={false} href={`/${locale}/investor/${iv.id}`} className="card block p-4 hover:border-accent/50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">
                  {locale === "zh" ? iv.zh : iv.en}
                  {iv.inferred ? (
                    <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-normal text-warn" title={t.investors.inferredNote}>
                      {t.investors.inferred}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted">{locale === "zh" ? iv.firm_zh : iv.firm_en}</div>
              </div>
              <div className="text-right">
                <div className="num font-semibold">{usdShort(iv.value)}</div>
                <div className="text-[11px] text-faint">{quarterLabel(iv.period, locale)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {iv.top.map((s) => (
                <span key={s} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                  {s}
                </span>
              ))}
              <span className="ml-auto text-xs text-faint">{fmt(t.investors.nHoldings, { n: iv.n })}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
