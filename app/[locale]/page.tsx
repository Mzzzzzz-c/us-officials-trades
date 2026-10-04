import { PosterButton } from "@/components/client/Share";
import Link from "next/link";
import { FollowStrip } from "@/components/client/Follow";
import { updatedAt } from "@/lib/format";
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
import StockLookup from "@/components/client/StockLookup";
import Term from "@/components/client/Term";
import Timeline, { type TLEvent, type TLItem, type TLStory } from "@/components/client/Timeline";
import { getInsiders, getInsights, getLatestPrices, getMedia, getMeta, getRecent, getSeries, getStats, getTickers, insiderLabel, insiderTitle, type Strategy } from "@/lib/data";
import { POLICY_EVENTS } from "@/lib/events";
import { amountRange, usdShort } from "@/lib/format";
import { officialItems, tlLabels } from "@/lib/timeline";
import { macroEvents } from "@/lib/timeline-events";
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

  // ---------------------------------------------------------------- the market-wide timeline
  const today = meta?.generated?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const since = new Date(Date.parse(today) - 70 * 864e5).toISOString().slice(0, 10);
  const insIdx = getInsiders();
  const media = getMedia();
  const bigOfficial = recent
    .filter((r) => r.sym && r.tx && r.tx >= since && (r.amin ?? 0) >= 50001 && r.type !== "E")
    .sort((x, y) => (y.amax ?? y.amin ?? 0) - (x.amax ?? x.amin ?? 0))
    .slice(0, 260);
  const offItems = officialItems(bigOfficial, locale, "stock", 0).map((it) => ({ ...it, title: `${it.title} · ${it.sym}` }));
  const i18 = t.insider;
  const insItems: TLItem[] = (insIdx?.big ?? []).map((r, k) => ({
    id: `b-${k}`,
    d: r[0],
    side: r[7] === "P" ? "b" : "s",
    lane: 1,
    sym: r[2],
    title: `${insiderLabel(r[4], r[3], locale)} · ${r[2]}`,
    sub: insiderTitle(r[6]) || [...r[5]].map((c) => i18.rel[c as keyof typeof i18.rel] ?? "").filter(Boolean).join(" · "),
    amount: usdShort(r[10]),
    v: r[10],
    rows: [
      [t.tl.shares, r[8].toLocaleString("en-US")],
      [t.tl.price2, `$${r[9].toFixed(2)}`],
      [t.tl.filed, r[1]],
      [t.tl.type, r[7] === "P" ? i18.openBuy : i18.openSell],
    ],
    tags: r[11] ? [i18.plan] : [],
    link: r[4] ? `/${locale}/insider/${r[4]}` : undefined,
    src: `https://www.sec.gov/Archives/edgar/data/${r[13]}/${r[12].replace(/-/g, "")}/`,
    avatar: { id: `ins-${r[4]}`, name: insiderLabel(r[4], r[3], "en"), has: !!media.people[`ins-${r[4]}`] },
  }));
  const tlItems = [...offItems, ...insItems];
  const tlEvents: TLEvent[] = [
    ...macroEvents(locale, since),
    ...POLICY_EVENTS.filter((e) => !e.sectors && e.d >= since).map((e) => ({ d: e.d, k: "p" as const, label: locale === "zh" ? e.zh : e.en })),
  ];
  // three ways in: the largest recent trade, the stock most officials are buying, and a stock
  // officials and its own insiders are both buying
  const stories: TLStory[] = [];
  const week2 = new Date(Date.parse(today) - 21 * 864e5).toISOString().slice(0, 10);
  const top = bigOfficial.find((r) => (r.fil ?? "") >= week2) ?? bigOfficial[0];
  if (top) {
    const who = person(top.m, locale);
    stories.push({
      kicker: t.h.s1k,
      title: fmt(t.h.s1, { who: who.name, side: top.type === "P" ? t.h.bought : t.h.sold, sym: top.sym ?? "" }),
      sub: fmt(t.h.s1sub, { amt: amountRange(top.amin, top.amax), d: top.tx ?? "" }),
      ids: [top.id],
      tone: top.type === "P" ? "b" : "s",
    });
  }
  const many = stats?.top_bought.find((x) => offItems.some((i) => i.sym === x.sym && i.side === "b"));
  if (many && stats) {
    stories.push({ kicker: t.h.s2k, title: fmt(t.h.s2, { n: many.nm, sym: many.sym }), sub: fmt(t.h.s2sub, { d: stats.window }), ids: offItems.filter((i) => i.sym === many.sym && i.side === "b").map((i) => i.id), tone: "b" });
  }
  const both = insIdx?.both.find((x) => tlItems.some((i) => i.sym === x.sym && i.side === "b"));
  if (both) {
    stories.push({ kicker: t.h.s3k, title: fmt(t.h.s3, { sym: both.sym }), sub: fmt(t.h.s3sub, { o: both.off.length, i: both.ins }), ids: tlItems.filter((i) => i.sym === both.sym && i.side === "b").map((i) => i.id), tone: "b" });
  }
  const spy = getSeries("SPY")?.w ?? [];

  // ---------------------------------------------------------------- the next two weeks
  const end14 = new Date(Date.parse(today) + 14 * 864e5).toISOString().slice(0, 10);
  const tickN = new Map(getTickers().map((x) => [x.sym, x]));
  const soon = (insIdx?.upcoming ?? [])
    .filter(([d, sym]) => d >= today && d <= end14 && tickN.has(sym))
    .sort((x, y) => (tickN.get(y[1])!.n - tickN.get(x[1])!.n))
    .slice(0, 9)
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));
  const soonMacro = macroEvents(locale, today).filter((e) => e.d <= end14);
  const leaders = (ins?.leaderboard ?? []).slice(0, 5);
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" });

  return (
    <div>
      {/* ---------------------------------------------------------------- hero: headline and the timeline */}
      <section>
        <Container className="pt-10 text-center sm:pt-16">
          <div className="fade-up inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[12px] font-medium text-muted shadow-[inset_0_0_0_1px_var(--edge)]">
            <span className="live-dot" />
            {meta ? fmt(t.h.live, { t: updatedAt(meta.generated, locale) }) : t.siteName}
          </div>
          <h1 className="display fade-up mx-auto mt-5 max-w-4xl" style={{ animationDelay: "60ms" }}>
            {t.h.title1}
            <br />
            <span className="gradient-text">{t.h.title2}</span>
          </h1>
          {stats ? (
            <p className="lead fade-up mx-auto mt-6 max-w-2xl" style={{ animationDelay: "120ms" }}>
              {fmt(t.h.pulse, { m: stats.last30.members, n: stats.last30.trades.toLocaleString("en-US"), b: stats.last30.buys.toLocaleString("en-US"), s: stats.last30.sells.toLocaleString("en-US") })}
            </p>
          ) : null}
          <div className="fade-up mt-7 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "180ms" }}>
            <div className="w-full max-w-md">
              <SearchField label={t.x.searchPlaceholder} />
            </div>
            <PosterButton src={L("/poster/week")} path={L("/latest")} text={`${t.x.latestFeed} · ${t.siteName}`} labels={t.share} label={t.share.posterWeek} />
          </div>
        </Container>
        <Container className="mt-10">
          <div className="card fade-up p-4 sm:p-6" style={{ animationDelay: "240ms" }} id="timeline">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="max-w-2xl">
                <h2 className="title-2">{t.h.tlTitle}</h2>
                <p className="mt-1 text-[13px] text-muted">{t.h.tlSub}</p>
              </div>
              <span className="text-[13px] font-semibold text-accent">{t.h.three} ↓</span>
            </div>
            {c ? (
              <div className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-surface-2 px-4 py-3 sm:grid-cols-4">
                {(
                  [
                    [c.trades, t.h.statTrades],
                    [c.members, t.h.statPeople],
                    [insIdx?.people ?? 0, t.h.statInsiders],
                    [c.tickers, t.h.statStocks],
                  ] as [number, string][]
                ).map(([v, label]) => (
                  <div key={label} className="min-w-0">
                    <div className="display !text-[26px] sm:!text-[32px]">
                      <CountUp value={Number(v)} />
                    </div>
                    <div className="truncate text-[12px] text-muted">{label}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <Timeline items={tlItems} events={tlEvents} lanes={[t.tl.lanes.officials, t.tl.lanes.insiders]} price={spy} priceSym={t.h.spy} labels={tlLabels(locale)} locale={locale} today={today} stories={stories} />
          </div>
        </Container>
      </section>

      {/* ---------------------------------------------------------------- check your stock */}
      <Band>
        <div className="grid items-start gap-8 lg:grid-cols-[5fr_6fr]">
          <Reveal>
            <h2 className="headline">{t.h.lookupTitle}</h2>
            <p className="lead mt-4">{t.h.lookupSub}</p>
            <div className="mt-6">
              <FollowStrip href={L("/following")} text={t.follow.stripText} cta={`${t.follow.stripCta} ›`} />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <StockLookup locale={locale} labels={t.lookup} share={t.share} logos={media.logos} examples={(stats?.top_bought ?? []).slice(0, 5).map((x) => x.sym)} />
          </Reveal>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
      </Band>

      {/* ---------------------------------------------------------------- who to follow, what is next */}
      <Band>
        <div className="grid gap-6 lg:grid-cols-2">
          {leaders.length ? (
            <Reveal className="card p-5 sm:p-6">
              <h2 className="title-2">{t.h.rank}</h2>
              <p className="mt-1 mb-4 text-[13px] text-muted">
                {t.h.rankSub}{" "}
                <Term tip={t.glossary.excess}>{t.h.x90}</Term>
              </p>
              <ol className="divide-y divide-hair">
                {leaders.map((r, k) => {
                  const p = person(r.id, locale);
                  return (
                    <li key={r.id}>
                      <Link prefetch={false} href={L(`/member/${r.id}`)} className="flex items-center gap-3 py-2.5">
                        <span className="display w-6 text-center !text-[22px] text-faint">{k + 1}</span>
                        <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="block truncate text-xs text-muted">{p.role}</span>
                        </span>
                        <span className="text-right">
                          <span className={`num block text-[17px] font-semibold ${r.x90 >= 0 ? "text-pos" : "text-neg"}`}>{pctTxt(r.x90)}</span>
                          <span className="block text-[11px] text-faint">
                            {t.h.win} {Math.round(r.win * 100)}%
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={L("/insights")} className="btn btn-quiet text-[14px]">
                  {t.h.rankAll} ›
                </Link>
                <PosterButton src={L("/poster/leaderboard")} path={L("/insights")} text={`${t.h.rank} · ${t.siteName}`} labels={t.share} label={t.share.posterLeaderboard} />
              </div>
            </Reveal>
          ) : null}
          <Reveal className="card p-5 sm:p-6" delay={120}>
            <h2 className="title-2">{t.h.upcoming}</h2>
            <p className="mt-1 mb-4 text-[13px] text-muted">{t.h.upcomingSub}</p>
            <ul className="divide-y divide-hair">
              {soonMacro.map((e, k) => (
                <li key={`m${k}`} className="flex items-center gap-3 py-2.5">
                  <span className="num w-[92px] shrink-0 text-[13px] text-muted">{day(e.d)}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: "#bf5af2" }} />
                  <span className="truncate font-medium">{e.label}</span>
                </li>
              ))}
              {soon.map(([d, sym]) => {
                const tk = tickN.get(sym)!;
                return (
                  <li key={sym}>
                    <Link prefetch={false} href={L(`/ticker/${encodeURIComponent(sym)}#timeline`)} className="flex items-center gap-3 py-2">
                      <span className="num w-[92px] shrink-0 text-[13px] text-muted">{day(d)}</span>
                      <Logo sym={sym} kind={media.logos[sym]} size={26} />
                      <span className="font-semibold">{sym}</span>
                      <span className="truncate text-muted">{(locale === "zh" && tk.zh) || tk.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-faint">{t.cal.earnings}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link href={L("/calendar")} className="btn btn-quiet mt-4 text-[14px]">
              {t.h.upcomingAll} ›
            </Link>
          </Reveal>
        </div>
      </Band>

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
        <Band>
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
          <div className="-mt-2 mb-6 flex flex-wrap gap-2">
            <Link prefetch={false} href={L("/weekly")} className="btn btn-quiet text-[13px]">
              {t.weekly.home} ›
            </Link>
          </div>
        </Reveal>
        <Reveal className="card divide-y divide-hair overflow-hidden">
          {feed.map((tr) => (
            <TradeRow key={tr.id} tr={tr} p={person(tr.m, locale)} s={tr.sym ? stock(tr.sym, locale) : null} locale={locale} />
          ))}
        </Reveal>
      </Band>

      {/* ---------------------------------------------------------------- signals */}
      {sigs.length ? (
        <Band>
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
