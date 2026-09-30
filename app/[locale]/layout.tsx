import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "../globals.css";
import LangSwitch from "@/components/LangSwitch";
import Nav from "@/components/Nav";
import { getMeta } from "@/lib/data";
import { dict, isLocale, LOCALES } from "@/lib/i18n";
import { REPO_URL, siteUrl } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${t.siteName} - ${t.siteTagline}`, template: `%s · ${t.siteName}` },
    description: t.home.intro,
    alternates: { languages: { "zh-CN": "/zh", en: "/en" } },
    openGraph: { siteName: t.siteName, type: "website", locale: locale === "zh" ? "zh_CN" : "en_US" },
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const meta = getMeta();
  const L = (p: string) => `/${locale}${p}`;
  const nav = [
    { href: L(""), label: t.nav.home, match: [""] },
    { href: L("/members"), label: t.nav.members, match: ["members", "member"] },
    { href: L("/tickers"), label: t.nav.tickers, match: ["tickers", "ticker"] },
    { href: L("/investors"), label: t.nav.investors, match: ["investors", "investor"] },
    { href: L("/methodology"), label: t.nav.methodology, match: ["methodology", "unparsed"] },
  ];
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-surface/95 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
            <Link href={L("")} className="flex items-center gap-2 font-semibold whitespace-nowrap">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="text-accent">
                <path d="M3 20h18M5 20V10m4 10V10m6 10V10m4 10V10M2 8l10-5 10 5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{t.siteName}</span>
            </Link>
            <div className="min-w-0 flex-1">
              <Nav items={nav} />
            </div>
            <LangSwitch locale={locale} label={t.langSwitch} title={t.langSwitchLabel} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mt-12 border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-xs leading-relaxed text-muted">
            <p>{t.footer.disclaimer}</p>
            <p>{t.footer.legal}</p>
            <p>
              {t.footer.sources}:{" "}
              <a className="link" href="https://disclosures-clerk.house.gov/FinancialDisclosure" target="_blank" rel="noopener noreferrer">{locale === "zh" ? "众议院书记官办公室" : "Clerk of the House"}</a> ·{" "}
              <a className="link" href="https://efdsearch.senate.gov/search/" target="_blank" rel="noopener noreferrer">{locale === "zh" ? "参议院 eFD 电子披露系统" : "Senate eFD"}</a> ·{" "}
              <a className="link" href="https://www.sec.gov/edgar/search/" target="_blank" rel="noopener noreferrer">{locale === "zh" ? "美国证监会 EDGAR" : "SEC EDGAR"}</a> ·{" "}
              <a className="link" href="https://github.com/unitedstates/congress-legislators" target="_blank" rel="noopener noreferrer">congress-legislators</a>
            </p>
            <p>
              {meta ? (
                <>
                  {t.common.dataThrough} {meta.data_through} · {t.common.pricesAsOf} {meta.price_asof} · {t.common.updatedDaily} ·{" "}
                </>
              ) : null}
              <a className="link" href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
                {t.footer.corrections}
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
