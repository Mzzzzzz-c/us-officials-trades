import Share from "@/components/client/Share";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveChange } from "@/components/client/Quotes";
import Reveal from "@/components/client/Reveal";
import { Container, Metric, SectionHead } from "@/components/layout";
import { Avatar, Logo } from "@/components/media";
import { Note, Pct, Section, Stat } from "@/components/ui";
import { getInvestor, getInvestors, getLatestPrices, getMedia, getTickers, type InvestorHolding } from "@/lib/data";
import { priceRange, quarterLabel, shares, since, usdShort } from "@/lib/format";
import { dict, isLocale, type Locale } from "@/lib/i18n";
import { tickerRow } from "@/lib/people";

export const dynamicParams = true;

export function generateStaticParams() {
  return getInvestors().map((i) => ({ id: i.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const d = getInvestor(id);
  if (!d) return {};
  const p = d.profile;
  return { title: locale === "zh" ? `${p.zh} · ${p.firm_zh} 13F` : `${p.en} · ${p.firm_en} 13F` };
}

const CHG_TONE: Record<string, string> = {
  new: "bg-pos-soft text-pos",
  add: "bg-pos-soft text-pos",
  trim: "bg-neg-soft text-neg",
  exit: "bg-neg text-white",
  same: "bg-surface-2 text-muted",
};

export default async function InvestorPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const d = getInvestor(id);
  if (!d) notFound();
  const t = dict(locale);
  const p = d.profile;
  const { px, pc = {} } = getLatestPrices();
  const tickers = getTickers();
  const known = new Set(tickers.map((x) => x.sym));
  const zhNames: Record<string, string> = {};
  if (locale === "zh") for (const x of tickers) if (x.zh) zhNames[x.sym] = x.zh;
  const latest = d.quarters[0];
  const note = locale === "zh" ? p.note_zh : p.note_en;

  const media = getMedia();
  const pid = `inv-${p.id}`;
  const name = locale === "zh" ? p.zh : p.en;
  const firm = locale === "zh" ? p.firm_zh : p.firm_en;
  const top10 = d.holdings.slice(0, 10);
  const conc = top10.reduce((a, h) => a + h.w, 0);
  // weight by sector, from the tickers' SEC industry codes
  const bySec = new Map<string, number>();
  for (const h of d.holdings) {
    const sec = (h.sym && tickerRow(h.sym)?.sec) || "other";
    bySec.set(sec, (bySec.get(sec) ?? 0) + h.w);
  }
  const sectors = Array.from(bySec.entries()).sort((x, y) => y[1] - x[1]);
  const qs = [...d.quarters].reverse();
  const qmax = Math.max(...qs.map((q) => q.value), 1);

  return (
    <div>
      <section className="bg-elev">
        <Container className="pt-12 pb-10 sm:pt-16">
          <div className="fade-up flex flex-col gap-6 sm:flex-row sm:items-center">
            <Avatar id={pid} name={locale === "zh" ? p.zh ?? p.en : p.en} has={!!media.people[pid]} size={104} ring={false} className="shadow-[0_8px_30px_rgba(0,0,0,0.12)]" />
            <div className="min-w-0">
              <div className="eyebrow flex flex-wrap items-center gap-2">
                {t.investors.title}
                {p.inferred ? <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">{t.investors.inferred}</span> : null}
              </div>
              <h1 className="headline mt-1">{name}</h1>
              {locale === "zh" ? <div className="text-[15px] text-faint">{p.en}</div> : null}
              <div className="mt-2 text-[15px] text-muted">
                {firm} ·{" "}
                <a className="link" href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${p.cik}&type=13F-HR`} target="_blank" rel="noopener noreferrer">
                  SEC 13F ↗
                </a>
              </div>
              <div className="mt-4 flex justify-center sm:justify-start">
                <Share compact path={`/${locale}/investor/${p.id}`} image={`/${locale}/investor/${p.id}/opengraph-image`} text={`${name} · ${firm} · ${t.siteName}`} labels={t.share} />
              </div>
            </div>
          </div>
          {note ? <p className="mt-5 max-w-3xl rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{note}</p> : null}
          {latest ? (
            <div className="mt-10 grid grid-cols-2 gap-6 border-t border-hair pt-8 sm:grid-cols-5">
              <Metric label={t.investors.totalValue} value={usdShort(latest.value)} />
              <Metric label={t.table.holdings} value={latest.n} />
              <Metric label={t.x.top10} value={`${(conc * 100).toFixed(0)}%`} />
              <Metric label={t.investors.latestQuarter} value={<span className="text-[20px]">{quarterLabel(latest.period, locale)}</span>} />
              <Metric label={t.investors.filedOn} value={<span className="text-[20px]">{latest.filed}</span>} />
            </div>
          ) : null}
        </Container>
      </section>

      <Container>
        {top10.length ? (
          <div className="mt-12 grid gap-6 lg:grid-cols-5">
            <Reveal className="card p-5 sm:p-6 lg:col-span-3">
              <h2 className="title-2 mb-5">{t.x.topHoldings}</h2>
              <ul className="space-y-3.5">
                {top10.map((h) => (
                  <li key={h.cusip} className="flex items-center gap-3">
                    {h.sym ? <Logo sym={h.sym} kind={media.logos[h.sym]} size={32} /> : <span className="h-8 w-8 shrink-0 rounded-lg bg-surface-3" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-semibold">
                          {h.sym && known.has(h.sym) ? (
                            <Link prefetch={false} href={`/${locale}/ticker/${h.sym}`} className="hover:underline">
                              {h.sym}
                            </Link>
                          ) : (
                            h.sym ?? h.name
                          )}
                          <span className="ml-2 font-normal text-muted">{(h.sym && zhNames[h.sym]) || h.name}</span>
                        </span>
                        <span className="num shrink-0 text-sm">{(h.w * 100).toFixed(1)}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (h.w / top10[0].w) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="hidden w-20 text-right sm:block">{h.sym ? <LiveChange sym={h.sym} fallback={px[h.sym]} fallbackPrev={pc[h.sym]} pill={false} /> : null}</div>
                  </li>
                ))}
              </ul>
            </Reveal>
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Reveal className="card p-5 sm:p-6">
                <h2 className="title-2 mb-5">{t.x.bySector}</h2>
                <ul className="space-y-3">
                  {sectors.slice(0, 8).map(([sec, w]) => (
                    <li key={sec}>
                      <div className="flex justify-between text-sm">
                        <span>{t.sectors[sec as keyof typeof t.sectors] ?? sec}</span>
                        <span className="num text-muted">{(w * 100).toFixed(1)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (w / sectors[0][1]) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
              {qs.length > 1 ? (
                <Reveal className="card p-5 sm:p-6">
                  <h2 className="title-2 mb-5">{t.x.valueHistory}</h2>
                  <div className="flex h-28 items-end gap-1.5">
                    {qs.map((q) => (
                      <div key={q.period} className="group flex h-full flex-1 flex-col justify-end" title={`${quarterLabel(q.period, locale)} · ${usdShort(q.value)}`}>
                        <div className="rounded-t-[4px] bg-accent/80 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(3, (q.value / qmax) * 100)}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-faint">
                    <span>{quarterLabel(qs[0].period, locale)}</span>
                    <span>{quarterLabel(qs[qs.length - 1].period, locale)}</span>
                  </div>
                </Reveal>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="mt-14">
          <SectionHead title={t.investors.holdingsTitle} />
          <HoldingTable locale={locale} rows={d.holdings} px={px} known={known} zh={zhNames} />
          <Note>{t.investors.costNote}</Note>
        </section>

      {d.exits.length > 0 && (
        <Section title={t.investors.exitsTitle}>
          <HoldingTable locale={locale} rows={d.exits} px={px} known={known} zh={zhNames} exits />
        </Section>
      )}

      <Section title={t.investors.quarters}>
        <div className="card scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t.table.period}</th>
                <th>{t.investors.filedOn}</th>
                <th className="r">{t.investors.totalValue}</th>
                <th className="r">{t.table.holdings}</th>
                <th className="r">{t.common.source}</th>
              </tr>
            </thead>
            <tbody>
              {d.quarters.map((q) => (
                <tr key={q.period}>
                  <td>{quarterLabel(q.period, locale)}</td>
                  <td className="num text-muted">{q.filed}</td>
                  <td className="r num">{usdShort(q.value)}</td>
                  <td className="r num">{q.n}</td>
                  <td className="r">
                    <a className="link" href={q.url} target="_blank" rel="noopener noreferrer">
                      EDGAR ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {d.activity.length > 0 && (
        <Section title={t.investors.activityTitle}>
          <div className="space-y-2">
            {d.activity.map((a, i) => (
              <details key={a.period} className="card" open={i === 0}>
                <summary className="flex items-center justify-between px-4 py-3">
                  <span className="font-medium">{quarterLabel(a.period, locale)}</span>
                  <span className="text-xs text-muted">
                    {t.investors.filedOn} {a.filed} · {a.items.length}
                  </span>
                </summary>
                <div className="border-t border-line">
                  <HoldingTable locale={locale} rows={a.items} px={px} known={known} zh={zhNames} compact />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}
        {media.files?.[pid] ? (
          <p className="mt-10 text-[11px] text-faint">
            {t.x.photo}:{" "}
            <a className="hover:underline" href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(media.files[pid].replace(/ /g, "_"))}`} target="_blank" rel="noopener noreferrer">
              Wikimedia Commons
            </a>
          </p>
        ) : null}
      </Container>
    </div>
  );
}

function HoldingTable({ locale, rows, px, known, zh, exits = false, compact = false }: { locale: Locale; rows: InvestorHolding[]; px: Record<string, number>; known: Set<string>; zh: Record<string, string>; exits?: boolean; compact?: boolean }) {
  const t = dict(locale);
  return (
    <div className={compact ? "scroll-x" : "card scroll-x"}>
      <table className="tbl">
        <thead>
          <tr>
            <th>{t.table.ticker}</th>
            <th className="hidden sm:table-cell">{t.table.name}</th>
            <th className="r">{t.table.shares}</th>
            {!exits && <th className="r">{t.table.value}</th>}
            {!exits && <th className="r">{t.table.weight}</th>}
            <th className="r">{t.table.change}</th>
            {!exits && <th className="r">{t.table.estCost}</th>}
            {!exits && <th className="r">{t.table.sinceFiling}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => {
            const now = h.sym ? px[h.sym] : undefined;
            const r = h.fol ? since(h.fol.p, now) : null;
            const s = h.fol?.sp ? since(h.fol.sp, px.SPY) : null;
            return (
              <tr key={`${h.cusip}-${h.pc ?? ""}-${i}`}>
                <td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-2.5">
                  {h.sym ? <Logo sym={h.sym} kind={getMedia().logos[h.sym]} size={28} /> : null}
                  {h.sym && known.has(h.sym) ? (
                    <Link prefetch={false} className="font-semibold link" href={`/${locale}/ticker/${h.sym}`}>
                      {h.sym}
                    </Link>
                  ) : (
                    <span className="font-semibold">{h.sym ?? "—"}</span>
                  )}
                  {h.pc ? <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] text-muted">{h.pc}</span> : null}
                  </span>
                </td>
                <td className="hidden max-w-64 truncate text-muted sm:table-cell" title={`${h.name} ${h.cls ?? ""}`}>
                  {(h.sym && zh[h.sym]) || h.name}
                </td>
                <td className="r num">{exits ? shares(-(h.dsh ?? 0)) : shares(h.sh)}</td>
                {!exits && <td className="r num">{usdShort(h.val)}</td>}
                {!exits && <td className="r num">{(h.w * 100).toFixed(h.w >= 0.1 ? 1 : 2)}%</td>}
                <td className="r whitespace-nowrap">
                  {h.chg ? <span className={`rounded px-1.5 py-0.5 text-xs ${CHG_TONE[h.chg] ?? ""}`}>{t.chg[h.chg]}</span> : "—"}
                  {h.pct != null && (h.chg === "add" || h.chg === "trim") ? (
                    <div className="text-[11px] text-faint num">
                      {h.pct > 0 ? "+" : ""}
                      {(h.pct * 100).toFixed(1)}%
                    </div>
                  ) : null}
                </td>
                {!exits && <td className="r num whitespace-nowrap">{h.cost ? priceRange(h.cost.lo, h.cost.hi) : "—"}</td>}
                {!exits && (
                  <td className="r whitespace-nowrap">
                    <Pct v={r} />
                    {r != null && s != null ? <div className="text-[11px] text-faint num">SPY {(s * 100).toFixed(1)}%</div> : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
