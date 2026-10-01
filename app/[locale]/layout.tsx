import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "../globals.css";
import LangSwitch from "@/components/LangSwitch";
import Nav from "@/components/Nav";
import { MarketState, QuoteProvider } from "@/components/client/Quotes";
import SearchPalette, { SearchButton } from "@/components/client/SearchPalette";
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
    { href: L("/executive"), label: t.nav.executive, match: ["executive"] },
    { href: L("/tickers"), label: t.nav.tickers, match: ["tickers", "ticker"] },
    { href: L("/insights"), label: t.nav.insights, match: ["insights"] },
    { href: L("/investors"), label: t.nav.investors, match: ["investors", "investor"] },
    { href: L("/methodology"), label: t.nav.methodology, match: ["methodology", "unparsed", "trade"] },
  ];
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} suppressHydrationWarning>
      <head>
        {/* hide scroll-in content only when JavaScript can reveal it again */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-screen font-sans">
        <QuoteProvider>
          <Nav
            items={nav}
            home={L("")}
            brand={t.siteName}
            right={
              <>
                <span className="hidden lg:inline-flex">
                  <MarketState labels={t.x.market} />
                </span>
                <SearchButton label={t.x.searchOpen} />
                <LangSwitch locale={locale} label={t.langSwitch} title={t.langSwitchLabel} />
              </>
            }
          />
          <SearchPalette
            locale={locale}
            labels={{
              placeholder: t.x.searchPlaceholder,
              officials: t.x.searchGroupOfficials,
              stocks: t.x.searchStocks,
              investors: t.x.searchInvestors,
              empty: t.x.searchEmpty,
              hint: t.x.searchHint,
              open: t.x.searchOpen,
            }}
          />
          <main>{children}</main>
        </QuoteProvider>
        <footer className="mt-20 bg-surface-2">
          <div className="mx-auto max-w-[1100px] space-y-3 px-5 py-10 text-xs leading-relaxed text-muted">
            <p>{t.footer.disclaimer}</p>
            <p>{t.footer.legal}</p>
            <p>{t.x.liveNote} {t.x.photoCredit}</p>
            <p>
              {t.footer.sources}:{" "}
              <a className="link" href="https://disclosures-clerk.house.gov/FinancialDisclosure" target="_blank" rel="noopener noreferrer">{locale === "zh" ? "众议院书记官办公室" : "Clerk of the House"}</a> ·{" "}
              <a className="link" href="https://efdsearch.senate.gov/search/" target="_blank" rel="noopener noreferrer">{locale === "zh" ? "参议院 eFD 电子披露系统" : "Senate eFD"}</a> ·{" "}
              <a className="link" href="https://www.oge.gov/web/oge.nsf/Officials%20Individual%20Disclosures%20Search%20Collection?OpenForm" target="_blank" rel="noopener noreferrer">{locale === "zh" ? "美国政府道德办公室 OGE" : "Office of Government Ethics"}</a> ·{" "}
              <a className="link" href="https://www.sec.gov/edgar/search/" target="_blank" rel="noopener noreferrer">{locale === "zh" ? "美国证监会 EDGAR" : "SEC EDGAR"}</a> ·{" "}
              <a className="link" href="https://github.com/unitedstates/congress-legislators" target="_blank" rel="noopener noreferrer">congress-legislators</a>
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-4">
              <span>
                {meta ? (
                  <>
                    {t.common.dataThrough} {meta.data_through} · {t.common.pricesAsOf} {meta.price_asof} · {t.common.updatedDaily}
                  </>
                ) : null}
              </span>
              <span className="flex gap-4">
                <Link className="hover:text-ink" href={L("/methodology")}>{t.nav.methodology}</Link>
                <a className="hover:text-ink" href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
                  {t.footer.corrections}
                </a>
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
