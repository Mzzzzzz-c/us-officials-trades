import Link from "next/link";
import { notFound } from "next/navigation";
import { StockTile, TradeRow } from "@/components/cards";
import CountUp from "@/components/client/CountUp";
import LineChart from "@/components/client/LineChart";
import { LiveChange, LivePrice, LiveSince } from "@/components/client/Quotes";
import Reveal from "@/components/client/Reveal";
import { SearchField } from "@/components/client/SearchPalette";
import SignalBoard from "@/components/client/SignalBoard";
import { Band, Container, SectionHead } from "@/components/layout";
import { Avatar, AvatarStack, Logo } from "@/components/media";
import { getInsights, getLatestPrices, getMeta, getRecent, getSeries, getStats, type Strategy } from "@/lib/data";
import { dict, fmt, isLocale, type Dict } from "@/lib/i18n";
import { person, stock } from "@/lib/people";
import { signalGroups } from "@/lib/signals";

const MARKETS: [string, string, string][] = [
  ["SPY", "标普 500", "S&P 500"],
  ["QQQ", "纳斯达克 100", "Nasdaq 100"],
  ["DIA", "道琼斯", "Dow Jones"],
  ["IWM", "罗素 2000", "Russell 2000"],
];

const pctTxt = (x: number | null | undefined) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const meta = getMeta();
  const stats = getStats();
  const ins = getInsights();
  const recent = getRecent();
  const { px, pc = {} } = getLatestPrices();
  const L = (p: string) => `/${locale}${p}`;
  const c = meta?.counts;
  const spark = (sym: string) => (getSeries(sym)?.w ?? []).slice(-26).map((x) => x[1]);

  const sigs = signalGroups(ins, locale);
  const all = ins?.strategies.all;
  const off = ins?.strategies.all_off;
  // the latest stock trades, at most two per official so one busy filer doesn't fill the list
  const seen = new Map<string, number>();
  const feed = recent
    .filter((r) => {
      if (!r.sym) return false;
      const n = seen.get(r.m) ?? 0;
      seen.set(r.m, n + 1);
      return n < 2;
    })
    .slice(0, 12);

  return (
    <div>
      {/* ---------------------------------------------------------------- hero */}
      <section className="overflow-hidden bg-elev">
        <Container className="pt-16 pb-14 text-center sm:pt-24 sm:pb-20">
          <div className="eyebrow fade-up">{t.x.heroEyebrow}</div>
          <h1 className="display fade-up mt-3" style={{ animationDelay: "60ms" }}>
            {t.x.heroTitle1}
            <br />
            <span className="gradient-text">{t.x.heroTitle2}</span>
          </h1>
          <p className="lead fade-up mx-auto mt-6 max-w-2xl" style={{ animationDelay: "120ms" }}>
            {t.x.heroSub}
          </p>
          <div className="fade-up mx-auto mt-8 max-w-xl" style={{ animationDelay: "160ms" }}>
            <SearchField label={t.x.searchPlaceholder} />
          </div>
          <div className="fade-up mt-6 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: "200ms" }}>
            <Link href={L("/latest")} className="btn btn-primary">
              {t.x.ctaLatest}
            </Link>
            <Link href={L("/insights")} className="btn btn-ghost text-[17px]">
              {t.x.ctaInsights} ›
            </Link>
          </div>
          {c ? (
            <div className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-4">
              {[
                [c.trades, t.x.statTrades],
                [c.members, t.x.statOfficials],
                [c.tickers, t.x.statTickers],
              ].map(([v, label]) => (
                <div key={String(label)}>
                  <div className="text-[34px] font-semibold tracking-tight sm:text-[48px]">
                    <CountUp value={Number(v)} />
                  </div>
                  <div className="text-[13px] text-muted">{label}</div>
                </div>
              ))}
            </div>
          ) : null}
          {meta ? <div className="mt-3 text-xs text-faint">{fmt(t.x.statSince, { y: meta.start_year })} · {t.common.dataThrough} {meta.data_through}</div> : null}
        </Container>
      </section>

      {/* ---------------------------------------------------------------- market strip */}
      <Container className="-mt-px">
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MARKETS.map(([sym, zh, en]) => (
            <Link key={sym} prefetch={false} href={L(`/ticker/${sym}`)} className="tile flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="whitespace-nowrap">
                <div className="text-[13px] font-semibold">{locale === "zh" ? zh : en}</div>
                <div className="text-[11px] text-faint">{sym}</div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <LivePrice sym={sym} fallback={px[sym]} fallbackPrev={pc[sym]} showChange={false} />
                <LiveChange sym={sym} fallback={px[sym]} fallbackPrev={pc[sym]} />
              </div>
            </Link>
          ))}
        </div>
      </Container>

      {/* ---------------------------------------------------------------- hot stocks */}
      {stats ? (
        <Band>
          <Reveal>
            <SectionHead title={t.x.hotBuys} sub={fmt(t.x.hotSub, { d: stats.window })} href={L("/tickers")} more={t.x.viewAll} />
          </Reveal>
          <div className="no-scrollbar snap-x -mx-5 flex gap-4 overflow-x-auto px-5 pb-4">
            {stats.top_bought.slice(0, 10).map((x) => {
              const s = stock(x.sym, locale);
              return (
                <StockTile
                  key={x.sym}
                  href={L(`/ticker/${x.sym}`)}
                  sym={x.sym}
                  name={s.name}
                  kind={s.kind}
                  price={px[x.sym]}
                  prev={pc[x.sym]}
                  spark={spark(x.sym)}
                  people={(x.ms ?? []).map((id) => person(id, locale))}
                  caption={fmt(t.x.nOfficials, { n: x.nm })}
                />
              );
            })}
          </div>
          <Reveal className="mt-10">
            <h3 className="title-2 mb-4">{t.x.hotSells}</h3>
          </Reveal>
          <div className="no-scrollbar snap-x -mx-5 flex gap-4 overflow-x-auto px-5 pb-4">
            {stats.top_sold.slice(0, 10).map((x) => {
              const s = stock(x.sym, locale);
              return (
                <StockTile
                  key={x.sym}
                  href={L(`/ticker/${x.sym}`)}
                  sym={x.sym}
                  name={s.name}
                  kind={s.kind}
                  price={px[x.sym]}
                  prev={pc[x.sym]}
                  spark={spark(x.sym)}
                  people={(x.ms ?? []).map((id) => person(id, locale))}
                  caption={fmt(t.x.nOfficials, { n: x.nm })}
                />
              );
            })}
          </div>
        </Band>
      ) : null}

      {/* ---------------------------------------------------------------- strategy */}
      {all ? (
        <Band alt>
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <div className="eyebrow">{t.x.strategyEyebrow}</div>
              <h2 className="headline mt-2">{t.x.strategyTitle}</h2>
              <p className="lead mt-4">{fmt(t.x.strategySub, { from: all.from.slice(0, 4), hold: ins!.hold })}</p>
            </div>
          </Reveal>
          <Reveal className="mt-10">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Big label={`${t.x.copyAll} · ${t.x.cagr}`} value={pctTxt(all.cagr)} accent />
              <Big label={`${t.x.spy} · ${t.x.cagr}`} value={pctTxt(all.bcagr)} />
              <Big label={`${t.x.offTiming} · ${t.x.cagr}`} value={off ? pctTxt(off.cagr) : "—"} />
              <Big label={t.x.mdd} value={pctTxt(all.mdd)} />
            </div>
          </Reveal>
          <Reveal className="card mt-10 p-5 sm:p-8">
            <LineChart
              series={[
                { label: t.x.copyAll, color: "var(--chart-1)", pts: all.pts.map((p) => [p[0], p[1]]) },
                { label: t.x.spy, color: "var(--chart-2)", pts: all.pts.map((p) => [p[0], p[2]]) },
                ...(off ? [{ label: t.x.offTiming, color: "var(--chart-3)", pts: off.pts.map((p) => [p[0], p[1]] as [string, number]), dashed: true }] : []),
              ]}
              rangeLabels={t.x.range}
            />
          </Reveal>
          <Reveal>
            <p className="mx-auto mt-8 max-w-3xl text-center text-[17px] leading-relaxed">
              {verdict(all, off, t, pctTxt)}
            </p>
            <div className="mt-6 text-center">
              <Link href={L("/insights")} className="btn btn-primary">
                {t.x.ctaInsights}
              </Link>
            </div>
          </Reveal>
        </Band>
      ) : null}

      {/* ---------------------------------------------------------------- feed */}
      <Band>
        <Reveal>
          <SectionHead title={t.x.latestFeed} href={L("/latest")} more={t.x.viewAll} />
        </Reveal>
        <Reveal className="card divide-y divide-hair overflow-hidden">
          {feed.map((tr) => (
            <TradeRow key={tr.id} tr={tr} p={person(tr.m, locale)} s={tr.sym ? stock(tr.sym, locale) : null} locale={locale} />
          ))}
        </Reveal>
      </Band>

      {/* ---------------------------------------------------------------- signals */}
      {sigs.length ? (
        <Band alt>
          <Reveal>
            <SectionHead title={t.x.signalsTitle} sub={t.x.signalsSub} href={L("/insights#signals")} more={t.x.viewAll} />
          </Reveal>
          <SignalBoard groups={sigs} labels={{ empty: t.x.sigEmpty, since: t.x.sincePublic }} px={px} limit={6} />
        </Band>
      ) : null}

      {/* ---------------------------------------------------------------- active officials */}
      {stats ? (
        <Band>
          <Reveal>
            <SectionHead title={t.x.activeOfficials} sub={fmt(t.home.mostActive, { d: stats.window })} href={L("/members")} more={t.x.viewAll} />
          </Reveal>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {stats.active.slice(0, 12).map((x, i) => {
              const p = person(x.id, locale);
              return (
                <Reveal key={x.id} delay={(i % 6) * 50}>
                  <Link prefetch={false} href={L(`/member/${x.id}`)} className="tile flex flex-col items-center px-3 pt-5 pb-4 text-center">
                    <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={72} />
                    <div className="mt-3 line-clamp-1 text-sm font-semibold">{p.name}</div>
                    <div className="line-clamp-1 text-[11px] text-muted">{p.role}</div>
                    <div className="num mt-2 text-xs text-faint">{fmt(t.home.tradesCount, { n: x.n })}</div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </Band>
      ) : null}
    </div>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className={`num text-[36px] font-semibold tracking-tight sm:text-[44px] ${accent ? "text-accent" : ""}`}>{value}</div>
      <div className="mt-1 text-[13px] text-muted">{label}</div>
    </div>
  );
}

/** One sentence: did copying beat the index, and what did the disclosure delay cost. */
function verdict(all: Strategy, off: Strategy | undefined, t: Dict, pctTxt: (x: number | null | undefined) => string): string {
  const a = all.cagr ?? all.total;
  const b = all.bcagr ?? all.bench;
  const head = a < b ? fmt(t.x.verdictLose, { d: pctTxt(b - a).replace("+", "") }) : fmt(t.x.verdictWin, { d: pctTxt(a - b) });
  if (!off || off.cagr == null || all.cagr == null) return head;
  return `${head} ${fmt(t.x.delayCost, { a: pctTxt(off.cagr), b: pctTxt(all.cagr), d: pctTxt(off.cagr - all.cagr).replace("+", "") })}`;
}
