import Morph from "@/components/Morph";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Share from "@/components/client/Share";
import { FollowButton } from "@/components/client/Follow";
import { ExtendedPrice, LivePrice, QuoteRanges } from "@/components/client/Quotes";
import Reveal from "@/components/client/Reveal";
import StockChart, { type ChartEvent, type TradeMark } from "@/components/client/StockChart";
import InsiderSection from "@/components/InsiderSection";
import Timeline, { type TLEvent } from "@/components/client/Timeline";
import { insiderItems, officialItems, tlLabels } from "@/lib/timeline";
import { stockEvents } from "@/lib/timeline-events";
import { Container, Metric, SectionHead } from "@/components/layout";
import { Avatar, Logo } from "@/components/media";
import TradeTable, { type MemberLite } from "@/components/TradeTable";
import { getInsider, getInsiders, getLatestPrices, getMedia, getSeries, getTicker, getTickers, investorMap, memberMap, slim } from "@/lib/data";
import { policyEventsFor } from "@/lib/events";
import { amountRange, quarterLabel, shares, usdShort } from "@/lib/format";
import { dict, fmt, isLocale } from "@/lib/i18n";
import { person } from "@/lib/people";

export const dynamicParams = true;

export function generateStaticParams() {
  // the most-traded stocks are pre-rendered; the rest render on first visit and are then cached
  return getTickers()
    .slice(0, 400)
    .map((t) => ({ sym: t.sym }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; sym: string }> }): Promise<Metadata> {
  const { locale, sym } = await params;
  if (!isLocale(locale)) return {};
  const d = getTicker(decodeURIComponent(sym));
  if (!d) return {};
  const t = dict(locale);
  const nm = locale === "zh" && d.zh ? `${d.zh}（${d.name}）` : d.name;
  return { title: `${d.sym} ${locale === "zh" && d.zh ? d.zh : d.name}`, description: `${d.sym} · ${nm} · ${d.trades.length} ${t.home.trades}` };
}

export default async function TickerPage({ params }: { params: Promise<{ locale: string; sym: string }> }) {
  const { locale, sym: raw } = await params;
  if (!isLocale(locale)) notFound();
  const sym = decodeURIComponent(raw).toUpperCase();
  const d = getTicker(sym);
  if (!d) notFound();
  const t = dict(locale);
  const mm = memberMap();
  const im = investorMap();
  const media = getMedia();
  const { px, pc = {}, asof } = getLatestPrices();
  const series = getSeries(sym)?.w ?? [];
  const members: Record<string, MemberLite> = {};
  const photos: Record<string, 1> = {};
  for (const tr of d.trades) {
    const m = mm.get(tr.m);
    if (m) members[tr.m] = { name: m.name, zh: m.zh, party: m.party, chamber: m.chamber, state: m.state, agency: m.agency, agency_zh: m.agency_zh };
    if (media.people[tr.m]) photos[tr.m] = 1;
  }
  const byDay = new Map<string, TradeMark>();
  for (const tr of d.trades) {
    if (!tr.tx || tr.opt || !["P", "SF", "SP", "S"].includes(tr.type)) continue;
    const mk = byDay.get(tr.tx) ?? { d: tr.tx, b: 0, s: 0 };
    if (tr.type === "P") mk.b += 1;
    else mk.s += 1;
    byDay.set(tr.tx, mk);
  }
  const marks = Array.from(byDay.values()).sort((a, b) => (a.d < b.d ? -1 : 1));

  // company insiders (SEC Form 4), earnings releases and policy events for the chart
  const ins = getInsider(sym);
  const insIndex = getInsiders();
  const insDay = new Map<string, TradeMark>();
  for (const r of ins?.tx ?? []) {
    const mk = insDay.get(r[0]) ?? { d: r[0], b: 0, s: 0 };
    if (r[5] === "P") mk.b += 1;
    else mk.s += 1;
    insDay.set(r[0], mk);
  }
  const insMarks = Array.from(insDay.values()).sort((a, b) => (a.d < b.d ? -1 : 1));
  const earnDates = ins?.earn ?? [];
  const events: ChartEvent[] = [
    ...earnDates.map((e) => ({ d: e, k: "e" as const, label: t.insider.earnings })),
    ...policyEventsFor(d.sec, locale).map((e) => ({ d: e.d, k: "p" as const, label: e.label })),
  ];
  // how many official trades fell in the 30 days before an earnings release, against chance
  let earnStat: { n: number; k: number; base: number; releases: number } | null = null;
  if (earnDates.length >= 4) {
    const day = (x: string) => Date.parse(x) / 864e5;
    const es = earnDates.map(day);
    const lo = es[0] - 30, hi = es[es.length - 1];
    const txs = d.trades.filter((x) => x.tx && ["P", "S", "SF", "SP"].includes(x.type)).map((x) => day(x.tx!)).filter((x) => x >= lo && x <= hi);
    const k = txs.filter((x) => es.some((e) => e - x > 0 && e - x <= 30)).length;
    earnStat = { n: txs.length, k, base: Math.min(1, (30 * es.length) / Math.max(1, hi - lo)), releases: es.length };
  }
  // the interactive timeline: officials in one lane, the company's insiders in the next
  const today = insIndex?.asof ?? new Date().toISOString().slice(0, 10);
  const offItems = officialItems(d.trades.filter((x) => x.tx).slice(0, 500), locale, "stock", 0);
  const insItems = ins?.tx.length ? insiderItems(ins.tx.slice(0, 350), d.sym, ins.cik, locale, "stock", 1) : [];
  const tlLanes = insItems.length ? [t.tl.lanes.officials, t.tl.lanes.insiders] : [t.tl.lanes.officials];
  const tlItems = [...offItems, ...insItems];
  const tlEvents: TLEvent[] = stockEvents(d.sym, d.sec, ins, locale);
  const cut90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const off90 = {
    b: d.trades.filter((x) => x.type === "P" && (x.fil ?? "") >= cut90).length,
    s: d.trades.filter((x) => x.type !== "P" && x.type !== "E" && (x.fil ?? "") >= cut90).length,
  };
  const nb = d.trades.filter((x) => x.type === "P").length;
  const ns = d.trades.filter((x) => x.type !== "P" && x.type !== "E").length;
  const holders = d.members.filter((m) => m.held).length;
  const name = locale === "zh" && d.zh ? d.zh : d.name;

  return (
    <div>
      <section className="bg-elev">
        <Container className="pt-12 pb-10 sm:pt-16">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div className="fade-up flex items-center gap-5">
              <Morph name={`s-${d.sym}`}>
                <Logo sym={d.sym} kind={media.logos[d.sym]} size={76} />
              </Morph>
              <div className="min-w-0">
                <div className="eyebrow">
                  {t.sectors[d.sec as keyof typeof t.sectors] ?? d.sec}
                  {d.exch ? ` · ${d.exch}` : ""}
                </div>
                <h1 className="headline">{d.sym}</h1>
                <div className="text-[17px] text-muted">{name}</div>
                {locale === "zh" && d.zh ? <div className="text-xs text-faint">{d.name}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <FollowButton kind="s" id={d.sym} labels={t.follow} compact />
                  <Share compact path={`/${locale}/ticker/${encodeURIComponent(d.sym)}`} image={`/${locale}/ticker/${encodeURIComponent(d.sym)}/opengraph-image`} poster={`/${locale}/poster/ticker/${encodeURIComponent(d.sym)}`} text={`${d.sym} ${name} · ${t.siteName}`} labels={t.share} />
                </div>
              </div>
            </div>
            <div className="fade-up text-right" style={{ animationDelay: "80ms" }}>
              <div className="eyebrow mb-1">{t.x.livePrice}</div>
              <LivePrice sym={d.sym} fallback={px[d.sym]} fallbackPrev={pc[d.sym]} size="xl" />
              <div>
                <ExtendedPrice sym={d.sym} labels={{ pre: t.x.extPre, post: t.x.extPost }} />
              </div>
              <div className="num mt-1 text-[11px] text-faint">{t.common.pricesAsOf} {asof}</div>
            </div>
          </div>
          <div className="mt-8">
            <QuoteRanges sym={d.sym} labels={{ day: t.x.dayRange, wk52: t.x.wk52 }} />
          </div>
        </Container>
      </section>

      <Container>
        <Reveal className="card mt-8 p-4 sm:p-6">
          <StockChart
            sym={d.sym}
            marks={marks}
            insiders={insMarks}
            events={events}
            layers={{ earnings: t.insider.layerEarnings, policy: t.insider.layerPolicy, insiders: t.insider.layerInsiders, insiderBuy: t.insider.insiderBuy, insiderSell: t.insider.insiderSell }}
            fallback={series}
            labels={t.x.chartRange}
            buyLabel={t.x.buy}
            sellLabel={t.x.sell}
            locale={locale}
          />
        </Reveal>

        {tlItems.length ? (
          <Reveal className="mt-14">
            <SectionHead title={fmt(t.tl.stockTitle, { sym: d.sym })} sub={t.tl.stockSub} id="timeline" />
            <div className="card p-4 sm:p-6">
              <Timeline items={tlItems} events={tlEvents} lanes={tlLanes} price={series} priceSym={d.sym} labels={tlLabels(locale)} locale={locale} today={today} poster={{ src: `/${locale}/poster/timeline/ticker/${encodeURIComponent(d.sym)}`, path: `/${locale}/ticker/${encodeURIComponent(d.sym)}`, text: `${d.sym} ${name} · ${t.tl.title} · ${t.siteName}`, label: t.tl.poster, labels: t.share }} />
            </div>
          </Reveal>
        ) : null}

        <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Metric label={t.ticker.trades} value={d.trades.length.toLocaleString()} />
          <Metric label={t.x.boughtBy} value={<span className="text-pos">{nb}</span>} />
          <Metric label={t.x.soldBy} value={<span className="text-neg">{ns}</span>} />
          <Metric label={t.ticker.stillHolding} value={holders} sub={fmt(t.x.nOfficials, { n: d.members.length })} />
        </div>

        {d.stats && (d.stats.nx || d.stats.b365 || d.stats.s365) ? (
          <Reveal className="mt-14">
            <SectionHead title={t.x.tickerRecord} />
            <div className="card grid gap-px overflow-hidden bg-hair sm:grid-cols-2 lg:grid-cols-4">
              <RecordCell
                label={t.x.afterBuys}
                value={d.stats.x90 != null ? pctS(d.stats.x90) : "—"}
                tone={d.stats.x90}
                sub={d.stats.nx ? `${fmt(t.x.afterBuysSub, { n: d.stats.nx })} · ${t.x.buyWin} ${Math.round((d.stats.win ?? 0) * 100)}%` : undefined}
              />
              <RecordCell label={t.x.officialTiming} value={d.stats.xo90 != null ? pctS(d.stats.xo90) : "—"} tone={d.stats.xo90} sub={t.x.afterBuys} />
              <SentimentCell label={t.x.sentiment} b={d.stats.b90} s={d.stats.s90} line={fmt(t.x.sentimentLine, { b: d.stats.b90, s: d.stats.s90 })} />
              <SentimentCell label={t.x.sentiment365} b={d.stats.b365} s={d.stats.s365} line={fmt(t.x.sentimentLine, { b: d.stats.b365, s: d.stats.s365 })} />
            </div>
          </Reveal>
        ) : null}

        {ins ? (
          <Reveal className="mt-14">
            <SectionHead title={t.insider.title} sub={t.insider.sub} id="insiders" />
            <InsiderSection locale={locale} symbol={d.sym} ins={ins} officials={off90} earn={earnStat} today={insIndex?.asof ?? new Date().toISOString().slice(0, 10)} bulkEnd={insIndex?.bulk_end ?? null} />
          </Reveal>
        ) : null}

        {d.members.length > 0 && (
          <Reveal className="mt-14">
            <SectionHead title={t.x.whoTraded} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {d.members.slice(0, 24).map((m) => {
                const p = person(m.id, locale);
                return (
                  <Link key={m.id} prefetch={false} href={`/${locale}/member/${m.id}`} className="tile flex items-center gap-3 p-4">
                    <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <div className="truncate text-[11px] text-muted">{p.role}</div>
                      <div className="num mt-1 text-xs">
                        <span className="text-pos">
                          {t.x.b} {m.nb}
                        </span>{" "}
                        ·{" "}
                        <span className="text-neg">
                          {t.x.s} {m.ns}
                        </span>
                        {m.held ? <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">{t.member.stillHeld}</span> : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            {d.members.length > 24 ? <p className="mt-3 text-xs text-muted">+{d.members.length - 24}</p> : null}
          </Reveal>
        )}

        {d.investors.length > 0 && (
          <Reveal className="mt-14">
            <SectionHead title={t.ticker.investors} />
            <div className="card scroll-x overflow-hidden">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t.nav.investors}</th>
                    <th>{t.table.period}</th>
                    <th className="r">{t.table.shares}</th>
                    <th className="r">{t.table.value}</th>
                    <th className="r">{t.table.weight}</th>
                    <th className="r">{t.table.change}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.investors.map((iv) => {
                    const p = im.get(iv.id);
                    return (
                      <tr key={iv.id}>
                        <td>
                          <Link prefetch={false} className="flex items-center gap-3" href={`/${locale}/investor/${iv.id}`}>
                            <Avatar id={`inv-${iv.id}`} name={(locale === "zh" ? p?.zh : p?.en) ?? iv.id} has={!!media.people[`inv-${iv.id}`]} size={34} ring={false} />
                            <span className="min-w-0">
                              <span className="block font-medium hover:underline">{p ? (locale === "zh" ? p.zh : p.en) : iv.id}</span>
                              {p ? <span className="block truncate text-[11px] text-faint">{locale === "zh" ? p.firm_zh : p.firm_en}</span> : null}
                            </span>
                          </Link>
                        </td>
                        <td className="text-muted">{quarterLabel(iv.period, locale)}</td>
                        <td className="r num">{shares(iv.sh)}</td>
                        <td className="r num">{usdShort(iv.val)}</td>
                        <td className="r num">{(iv.w * 100).toFixed(1)}%</td>
                        <td className="r">{iv.chg ? t.chg[iv.chg as keyof typeof t.chg] : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Reveal>
        )}

        {d.trades.length > 0 && (
          <section className="mt-14">
            <SectionHead title={`${t.x.tradesTitle} (${d.trades.length})`} sub={amountRange(d.trades.reduce((a, x) => a + (x.amin ?? 0), 0), d.trades.reduce((a, x) => a + (x.amax ?? x.amin ?? 0), 0))} />
            <TradeTable
              locale={locale}
              trades={d.trades.map(slim)}
              members={members}
              px={{ SPY: px.SPY, [sym]: px[sym] }}
              showTicker={false}
              filters={d.trades.length > 30}
              media={{ p: photos, l: {} }}
            />
          </section>
        )}
      </Container>
    </div>
  );
}

const pctS = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

function RecordCell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number | null }) {
  const c = tone == null ? "" : tone > 0.0005 ? "text-pos" : tone < -0.0005 ? "text-neg" : "";
  return (
    <div className="bg-surface p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`mt-1 text-[32px] font-semibold tracking-tight ${c}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-faint">{sub}</div> : null}
    </div>
  );
}

/** Officials buying vs selling, as counts and a two-part bar. */
function SentimentCell({ label, b, s, line }: { label: string; b: number; s: number; line: string }) {
  const total = b + s;
  return (
    <div className="bg-surface p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-[32px] font-semibold tracking-tight">
        <span className="text-pos">{b}</span>
        <span className="text-faint"> / </span>
        <span className="text-neg">{s}</span>
      </div>
      <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {total ? (
          <>
            <span className="h-full rounded-l-full bg-pos" style={{ width: `${(b / total) * 100}%` }} />
            <span className="h-full rounded-r-full bg-neg" style={{ width: `${(s / total) * 100}%` }} />
          </>
        ) : null}
      </div>
      <div className="mt-2 text-xs text-faint">{line}</div>
    </div>
  );
}
