import { PosterButton } from "@/components/client/Share";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TypePill } from "@/components/cards";
import { FlowBars, Histogram, MonthlyBars, YearBars } from "@/components/charts";
import LineChart from "@/components/client/LineChart";
import SignalBoard from "@/components/client/SignalBoard";
import StrategyLab from "@/components/client/StrategyLab";
import { LivePrice, LiveSince } from "@/components/client/Quotes";
import Reveal from "@/components/client/Reveal";
import { Band, Container, Metric, PageHeader, SectionHead } from "@/components/layout";
import { Avatar, AvatarStack, Logo, Sparkline } from "@/components/media";
import { getInsiders, insiderLabel, getInsights, getLatestPrices, type Strategy, type TradeCard } from "@/lib/data";
import { amountRange, usdShort } from "@/lib/format";
import { dict, fmt, isLocale, type Dict, type Locale } from "@/lib/i18n";
import { person, stock } from "@/lib/people";
import { signalGroups } from "@/lib/signals";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).x.insightsTitle, description: dict(locale).x.insightsSub } : {};
}

const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const tone = (x: number | null | undefined) => (x == null ? "" : x > 0.0005 ? "text-pos" : x < -0.0005 ? "text-neg" : "text-muted");

export default async function InsightsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const ins = getInsights();
  if (!ins) notFound();
  const { px, pc = {} } = getLatestPrices();
  const L = (p: string) => `/${locale}${p}`;
  const st = ins.strategies;
  const all = st.all;
  const secLabel = (s: string) => t.sectors[s as keyof typeof t.sectors] ?? s;
  const sigs = signalGroups(ins, locale);
  const insiders = getInsiders();
  const sections: [string, string][] = [
    ...(sigs.length ? ([["signals", t.x.signalsTitle]] as [string, string][]) : []),
    ["strategy", t.x.strategyEyebrow],
    ...(ins.lab?.length ? ([["lab", t.x.labTitle]] as [string, string][]) : []),
    ["leaders", t.x.leaderboard],
    ["flows", t.x.flowsTitle],
    ["clusters", t.x.clustersTitle],
    ...(insiders ? ([["insiders", t.insider.title]] as [string, string][]) : []),
    ["oversight", t.x.oversightTitle],
    ["timing", t.x.bestTitle],
    ["delay", t.x.delayTitle],
    ["party", t.x.partyTitle],
  ];
  const stratRows: [string, string][] = [
    ["all", t.x.copyAll],
    ["congress", t.x.copyCongress],
    ["exec", t.x.copyExec],
    ["all_off", t.x.offTiming],
  ];

  return (
    <div>
      <PageHeader title={t.x.insightsTitle} sub={t.x.insightsSub} />
      <Container>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-2">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="chip">
              {label}
            </a>
          ))}
        </div>
      </Container>

      {/* ---------------------------------------------------------------- signals */}
      {sigs.length ? (
        <Band id="signals">
          <Reveal>
            <SectionHead title={t.x.signalsTitle} sub={t.x.signalsSub} />
          </Reveal>
          <SignalBoard groups={sigs} labels={{ empty: t.x.sigEmpty, since: t.x.sincePublic }} px={px} />
        </Band>
      ) : null}

      {/* ---------------------------------------------------------------- strategy */}
      {all ? (
        <Band alt id="strategy">
          <Reveal>
            <SectionHead eyebrow={t.x.strategyEyebrow} title={t.x.strategyTitle} sub={fmt(t.x.strategySub, { from: all.from.slice(0, 4), hold: ins.hold })} />
          </Reveal>
          <Reveal className="card p-5 sm:p-8">
            <LineChart
              series={[
                { label: t.x.copyAll, color: "var(--chart-1)", pts: all.pts.map((p) => [p[0], p[1]]) },
                { label: t.x.spy, color: "var(--chart-2)", pts: all.pts.map((p) => [p[0], p[2]]) },
                ...(st.all_off ? [{ label: t.x.offTiming, color: "var(--chart-3)", pts: st.all_off.pts.map((p) => [p[0], p[1]] as [string, number]), dashed: true }] : []),
                ...(st.exec ? [{ label: t.x.copyExec, color: "var(--chart-4)", pts: st.exec.pts.map((p) => [p[0], p[1]] as [string, number]) }] : []),
              ]}
              rangeLabels={t.x.range}
              height={340}
            />
          </Reveal>
          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <Reveal className="card scroll-x overflow-hidden lg:col-span-3">
              <table className="tbl">
                <thead>
                  <tr>
                    <th />
                    <th className="r">{t.x.cagr}</th>
                    <th className="r">{t.x.spy}</th>
                    <th className="r">{t.x.total}</th>
                    <th className="r">{t.x.mdd}</th>
                    <th className="r">{t.x.samples}</th>
                  </tr>
                </thead>
                <tbody>
                  {stratRows.map(([k, label]) =>
                    st[k] ? (
                      <tr key={k}>
                        <td className="font-medium">{label}</td>
                        <td className={`r num font-semibold ${(st[k].cagr ?? st[k].total) >= (st[k].bcagr ?? st[k].bench) ? "text-pos" : "text-neg"}`}>{pct(st[k].cagr)}</td>
                        <td className="r num text-muted">{pct(st[k].bcagr)}</td>
                        <td className="r num">{pct(st[k].total, 0)}</td>
                        <td className="r num text-neg">{pct(st[k].mdd, 0)}</td>
                        <td className="r num text-muted">{st[k].n.toLocaleString()}</td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
            </Reveal>
            <Reveal className="card p-5 lg:col-span-2">
              <h3 className="mb-4 text-[15px] font-semibold">{t.x.yearly}</h3>
              <YearBars years={all.years} sLabel={t.x.copyAll} bLabel={t.x.spy} />
              <div className="mt-4 flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-1)" }} />
                  {t.x.copyAll}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} />
                  {t.x.spy}
                </span>
              </div>
            </Reveal>
          </div>
          <Reveal>
            <p className="mt-6 max-w-3xl text-[15px] leading-relaxed">
              {verdict(all, st.all_off, t, pct)}
            </p>
            <p className="mt-2 text-xs text-faint">{t.x.notAdvice}</p>
          </Reveal>
        </Band>
      ) : null}

      {/* ---------------------------------------------------------------- strategy lab */}
      {ins.lab?.length ? (
        <Band id="lab">
          <Reveal>
            <SectionHead title={t.x.labTitle} sub={t.x.labSub} />
          </Reveal>
          <StrategyLab
            rows={ins.lab}
            labels={{
              rules: t.x.labRules,
              notes: t.x.labNotes,
              groups: t.x.labGroups,
              rule: t.x.labRule,
              cagr: t.x.cagr,
              spy: t.x.labVsSpy,
              hit: t.x.labHit,
              x: t.x.labX,
              n: t.x.samples,
              copy: t.x.copyAll,
              best: t.x.labBest,
              range: t.x.range,
              total: t.x.total,
              mdd: t.x.mdd,
            }}
          />
          <p className="mt-4 text-xs text-faint">{t.x.notAdvice}</p>
        </Band>
      ) : null}

      {/* ---------------------------------------------------------------- leaderboard */}
      <Band alt id="leaders">
        <Reveal>
          <SectionHead title={t.x.leaderboard} sub={t.x.leaderboardSub} />
          <div className="-mt-2 mb-6 flex flex-wrap gap-2">
            <PosterButton src={`/${locale}/poster/leaderboard`} path={`/${locale}/insights#leaders`} text={`${t.x.leaderboard} · ${t.siteName}`} labels={t.share} label={t.share.posterLeaderboard} />
            <PosterButton src={`/${locale}/poster/leaderboard?k=worst`} path={`/${locale}/insights#leaders`} text={`${t.x.laggards} · ${t.siteName}`} labels={t.share} label={t.share.posterWorst} />
          </div>
        </Reveal>
        <Reveal className="card scroll-x overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>{t.table.member}</th>
                <th className="r">{t.x.excess90}</th>
                <th className="r">{t.x.winRate}</th>
                <th className="r">{t.x.excess365}</th>
                <th className="r">{t.x.copyCagr}</th>
                <th className="r hidden sm:table-cell" />
                <th className="r">{t.x.samples}</th>
              </tr>
            </thead>
            <tbody>
              {ins.leaderboard.slice(0, 25).map((b, i) => {
                const p = person(b.id, locale);
                return (
                  <tr key={b.id}>
                    <td className="num font-semibold text-muted">{i + 1}</td>
                    <td>
                      <Link prefetch={false} href={L(`/member/${b.id}`)} className="flex items-center gap-3 hover:underline">
                        <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={36} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="block truncate text-[11px] text-faint">{p.role}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={`r num font-semibold ${tone(b.x90)}`}>{pct(b.x90)}</td>
                    <td className="r num">{Math.round(b.win * 100)}%</td>
                    <td className={`r num ${tone(b.x365)}`}>{pct(b.x365)}</td>
                    <td className={`r num ${tone(b.cagr)}`}>{pct(b.cagr)}</td>
                    <td className="r hidden sm:table-cell">
                      <Sparkline values={b.spark} width={90} height={26} />
                    </td>
                    <td className="r num text-muted">{b.n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Reveal>
        {ins.laggards.length ? (
          <Reveal className="mt-10">
            <h3 className="title-2 mb-4">{t.x.laggards}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ins.laggards.slice(0, 10).map((b) => {
                const p = person(b.id, locale);
                return (
                  <Link key={b.id} prefetch={false} href={L(`/member/${b.id}`)} className="tile flex items-center gap-3 p-3">
                    <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={36} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <div className={`num text-xs font-semibold ${tone(b.x90)}`}>{pct(b.x90)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Reveal>
        ) : null}
      </Band>

      {/* ---------------------------------------------------------------- flows + activity */}
      <Band id="flows">
        <Reveal>
          <SectionHead title={t.x.flowsTitle} sub={t.x.flowsSub} />
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-2">
          {(
            [
              [t.x.flows90, ins.flows90],
              [t.x.flows365, ins.flows365],
            ] as const
          ).map(([label, rows]) => (
            <Reveal key={label} className="card p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">{label}</h3>
                <div className="flex gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-neg" />
                    {t.x.sell}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-pos" />
                    {t.x.buy}
                  </span>
                </div>
              </div>
              <FlowBars rows={rows.slice(0, 11)} labelOf={secLabel} buyLabel={t.x.buy} sellLabel={t.x.sell} />
            </Reveal>
          ))}
        </div>
        <Reveal className="card mt-6 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-[15px] font-semibold">{t.x.activityTitle}</h3>
              <p className="text-xs text-muted">{t.x.activitySub}</p>
            </div>
            <div className="flex gap-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-pos" />
                {t.x.buy}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-neg" />
                {t.x.sell}
              </span>
            </div>
          </div>
          <MonthlyBars rows={ins.activity} buyLabel={t.x.buy} sellLabel={t.x.sell} />
        </Reveal>
      </Band>

      {/* ---------------------------------------------------------------- clusters */}
      <Band alt id="clusters">
        <Reveal>
          <SectionHead title={t.x.clustersTitle} sub={t.x.clustersSub} />
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ins.clusters.slice(0, 24).map((cl) => {
            const s = stock(cl.sym, locale);
            return (
              <Link key={cl.sym} prefetch={false} href={L(`/ticker/${cl.sym}`)} className="tile flex flex-col p-5">
                <div className="flex items-center gap-3">
                  <Logo sym={cl.sym} kind={s.kind} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{cl.sym}</div>
                    <div className="truncate text-xs text-muted">{s.name}</div>
                  </div>
                  <LivePrice sym={cl.sym} fallback={px[cl.sym]} fallbackPrev={pc[cl.sym]} />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <AvatarStack people={cl.members.map((id) => person(id, locale))} size={28} max={6} />
                  <span className="text-sm font-semibold">{fmt(t.x.nOfficials, { n: cl.nm })}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-hair pt-3 text-xs text-muted">
                  <span className="num">
                    {cl.from} → {cl.to}
                  </span>
                  <span>
                    {t.x.sincePublic} <LiveSince sym={cl.sym} entry={cl.fol} fallback={px[cl.sym]} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </Band>

      {/* ---------------------------------------------------------------- oversight */}
      {/* ---------------------------------------------------------------- officials and company insiders */}
      {insiders ? (
        <Band id="insiders">
          <Reveal>
            <SectionHead title={t.insider.bothTitle} sub={t.insider.bothSub} />
          </Reveal>
          {insiders.both.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {insiders.both.slice(0, 12).map((b) => {
                const s = stock(b.sym, locale);
                const people = b.off.slice(0, 5).map((id) => person(id, locale));
                return (
                  <Link key={b.sym} prefetch={false} href={`/${locale}/ticker/${encodeURIComponent(b.sym)}#insiders`} className="tile flex flex-col gap-4 p-5">
                    <div className="flex items-center gap-3">
                      <Logo sym={b.sym} kind={s.kind} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[17px] font-semibold tracking-tight">{b.sym}</div>
                        <div className="truncate text-xs text-muted">{s.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <AvatarStack people={people.map((p) => ({ id: p.id, name: p.en, party: p.party, has: p.has }))} size={28} max={5} />
                      <span className="font-semibold text-pos">{fmt(t.insider.nOfficials, { n: b.off.length })}</span>
                    </div>
                    <div className="border-t border-hair pt-3 text-[13px]">
                      <span className="font-semibold text-pos">{fmt(t.insider.nInsiders, { n: b.ins, v: usdShort(b.vb) })}</span>
                      <span className="num ml-2 text-faint">{b.last}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="card px-5 py-8 text-center text-muted">{t.insider.bothNone}</p>
          )}
          {insiders.top.length ? (
            <Reveal className="mt-10">
              <h3 className="title-2">{t.insider.topTitle}</h3>
              <p className="mt-1 mb-4 text-sm text-muted">{t.insider.topSub}</p>
              <div className="card scroll-x overflow-hidden">
                <table className="tbl">
                  <tbody>
                    {insiders.top.slice(0, 12).map((r, i) => {
                      const s = stock(r.sym, locale);
                      return (
                        <tr key={i}>
                          <td>
                            <Link prefetch={false} href={`/${locale}/ticker/${encodeURIComponent(r.sym)}#insiders`} className="flex items-center gap-3">
                              <Logo sym={r.sym} kind={s.kind} size={30} />
                              <span>
                                <span className="block font-semibold">{r.sym}</span>
                                <span className="block max-w-[180px] truncate text-[11px] text-faint">{s.name}</span>
                              </span>
                            </Link>
                          </td>
                          <td>
                            {r.oc ? (
                              <Link prefetch={false} href={`/${locale}/insider/${r.oc}`} className="font-medium hover:underline">
                                {insiderLabel(r.oc, r.who, locale)}
                              </Link>
                            ) : (
                              <div className="font-medium">{insiderLabel(r.oc, r.who, locale)}</div>
                            )}
                            <div className="max-w-[220px] truncate text-[11px] text-faint">{(r.title && !/^see remarks?/i.test(r.title) ? r.title : "") || [...r.rel].map((c) => t.insider.rel[c as keyof typeof t.insider.rel] ?? "").join(" · ")}</div>
                          </td>
                          <td className="r num">
                            <span className="font-semibold text-pos">{usdShort(r.val)}</span>
                            {r.n > 1 ? <span className="ml-1.5 text-xs text-faint">{fmt(t.insider.nTrades, { n: r.n })}</span> : null}
                          </td>
                          <td className="r num whitespace-nowrap text-muted">
                            <a className="link" href={`https://www.sec.gov/Archives/edgar/data/${r.cik}/${r.acc.replace(/-/g, "")}/`} target="_blank" rel="noopener noreferrer">
                              {r.td}
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Reveal>
          ) : null}
          <p className="mt-4 text-xs text-faint">
            {fmt(t.insider.coverage, { n: insiders.stocks.toLocaleString("en-US") })}{" "}
            <Link prefetch={false} className="link" href={`/${locale}/insiders`}>
              {t.insider.listLink} ›
            </Link>
          </p>
        </Band>
      ) : null}

      <Band alt id="oversight">
        <Reveal>
          <SectionHead title={t.x.oversightTitle} sub={t.x.oversightSub} />
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-3">
          <Reveal className="card p-5">
            <h3 className="mb-4 text-[15px] font-semibold">{t.x.oversightCount}</h3>
            <ol className="space-y-3">
              {ins.oversight.count.slice(0, 12).map(([id, n], i) => {
                const p = person(id, locale);
                return (
                  <li key={id}>
                    <Link prefetch={false} href={L(`/member/${id}`)} className="flex items-center gap-3 hover:underline">
                      <span className="num w-5 text-xs text-faint">{i + 1}</span>
                      <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-[11px] text-faint">{p.role}</span>
                      </span>
                      <span className="num text-sm font-semibold text-warn">{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Reveal>
          <Reveal className="card divide-y divide-hair overflow-hidden lg:col-span-2">
            {ins.oversight.recent.slice(0, 14).map((c) => (
              <CardRow key={c.id} c={c} locale={locale} />
            ))}
          </Reveal>
        </div>
      </Band>

      {/* ---------------------------------------------------------------- timing */}
      <Band id="timing">
        <Reveal>
          <SectionHead title={`${t.x.bestTitle} · ${t.x.worstTitle}`} sub={t.x.timingSub} />
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-2">
          {(
            [
              [t.x.bestTitle, ins.best.slice(0, 12)],
              [t.x.worstTitle, ins.worst.slice(0, 12)],
            ] as const
          ).map(([label, rows]) => (
            <Reveal key={label} className="card overflow-hidden">
              <h3 className="px-5 pt-5 pb-2 text-[15px] font-semibold">{label}</h3>
              <div className="divide-y divide-hair">
                {rows.map((c) => (
                  <CardRow key={c.id} c={c} locale={locale} showX />
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </Band>

      {/* ---------------------------------------------------------------- delay */}
      <Band alt id="delay">
        <Reveal>
          <SectionHead title={t.x.delayTitle} sub={t.x.delaySub} />
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-3">
          <Reveal className="card p-5 sm:p-6 lg:col-span-2">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-[15px] font-semibold">{ins.delay.median != null ? fmt(t.x.delayMedian, { n: ins.delay.median }) : ""}</span>
            </div>
            <Histogram
              bins={ins.delay.buckets.map(([lo, hi, n]) => ({ label: hi == null ? `${lo}+ ${t.x.days}` : `${lo}–${hi}`, n }))}
              highlightFrom={3}
            />
            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-hair pt-5 sm:grid-cols-7">
              {ins.delay.by_year.map(([y, n, late]) => (
                <Metric key={y} label={y} value={<span className="text-[20px]">{n ? `${Math.round((late / n) * 100)}%` : "—"}</span>} sub={t.x.lateRate} />
              ))}
            </div>
          </Reveal>
          <Reveal className="card p-5">
            <h3 className="mb-4 text-[15px] font-semibold">{t.x.lateTop}</h3>
            <ol className="space-y-3">
              {ins.delay.late.slice(0, 10).map(([id, n]) => {
                const p = person(id, locale);
                return (
                  <li key={id}>
                    <Link prefetch={false} href={L(`/member/${id}`)} className="flex items-center gap-3 hover:underline">
                      <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={32} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      <span className="num text-sm font-semibold text-warn">{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Reveal>
        </div>
      </Band>

      {/* ---------------------------------------------------------------- party */}
      <Band id="party">
        <Reveal>
          <SectionHead title={t.x.partyTitle} sub={t.x.partySub} />
          <div className="-mt-2 mb-6 flex">
            <PosterButton src={`/${locale}/poster/party`} path={`/${locale}/insights#party`} text={`${t.x.partyTitle} · ${t.siteName}`} labels={t.share} label={t.share.posterParty} />
          </div>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2">
          {(["D", "R"] as const).map((k) => {
            const v = ins.party[k];
            if (!v) return null;
            const color = k === "D" ? "var(--dem)" : "var(--rep)";
            return (
              <Reveal key={k} className="card overflow-hidden">
                <div className="h-1.5" style={{ background: color }} />
                <div className="p-6">
                  <h3 className="title-2" style={{ color }}>
                    {t.party[k]}
                  </h3>
                  <div className="mt-5 grid grid-cols-3 gap-4">
                    <Metric label={t.x.statOfficials} value={v.members} />
                    <Metric label={t.x.trades} value={<span className="text-[22px]">{v.trades.toLocaleString()}</span>} />
                    <Metric label={t.x.copyCagr} value={<span className={`text-[22px] ${tone(v.cagr)}`}>{pct(v.cagr)}</span>} />
                    <Metric label={t.x.buy} value={<span className="text-[20px] text-pos">{v.buys.toLocaleString()}</span>} />
                    <Metric label={t.x.sell} value={<span className="text-[20px] text-neg">{v.sells.toLocaleString()}</span>} />
                    <Metric label={t.x.excess90} value={<span className={`text-[20px] ${tone(v.x90)}`}>{pct(v.x90)}</span>} sub={v.win != null ? `${t.x.winRate} ${Math.round(v.win * 100)}%` : undefined} />
                  </div>
                  <div className="mt-6 text-xs text-muted">{t.x.topSectors}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {v.sectors.map(([s, n]) => (
                      <span key={s} className="rounded-full bg-surface-2 px-3 py-1 text-xs">
                        {secLabel(s)} <span className="num text-faint">{n}</span>
                      </span>
                    ))}
                  </div>
                  {v.pts.length > 5 ? (
                    <div className="mt-6">
                      <LineChart
                        series={[
                          { label: t.x.copyAll, color, pts: v.pts.map((p) => [p[0], p[1]]) },
                          { label: t.x.spy, color: "var(--chart-2)", pts: v.pts.map((p) => [p[0], p[2]]) },
                        ]}
                        height={160}
                        compact
                      />
                    </div>
                  ) : null}
                </div>
              </Reveal>
            );
          })}
        </div>
      </Band>
    </div>
  );
}

function CardRow({ c, locale, showX = false }: { c: TradeCard; locale: Locale; showX?: boolean }) {
  const p = person(c.m, locale);
  const s = c.sym ? stock(c.sym, locale) : null;
  const L = (x: string) => `/${locale}${x}`;
  return (
    <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
      <Link prefetch={false} href={L(`/member/${c.m}`)} className="shrink-0">
        <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={34} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link prefetch={false} href={L(`/member/${c.m}`)} className="block truncate text-sm font-semibold hover:underline">
          {p.name}
        </Link>
        <div className="num truncate text-[11px] text-faint">
          {c.tx} · {amountRange(c.amin, c.amax)}
        </div>
      </div>
      <TypePill type={c.type} locale={locale} />
      {s ? (
        <Link prefetch={false} href={L(`/ticker/${s.sym}`)} className="flex w-24 items-center gap-2 sm:w-32">
          <Logo sym={s.sym} kind={s.kind} size={28} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{s.sym}</span>
            <span className="hidden truncate text-[11px] text-faint sm:block">{s.name}</span>
          </span>
        </Link>
      ) : null}
      {showX && c.x != null ? <span className={`num w-16 text-right text-sm font-semibold ${tone(c.x)}`}>{pct(c.x)}</span> : null}
    </div>
  );
}

/** One sentence: did copying beat the index, and what did the disclosure delay cost. */
function verdict(all: Strategy, off: Strategy | undefined, t: Dict, pct: (x: number | null | undefined) => string): string {
  const a = all.cagr ?? all.total;
  const b = all.bcagr ?? all.bench;
  const head = a < b ? fmt(t.x.verdictLose, { d: pct(b - a).replace("+", "") }) : fmt(t.x.verdictWin, { d: pct(a - b) });
  if (!off || off.cagr == null || all.cagr == null) return head;
  return `${head} ${fmt(t.x.delayCost, { a: pct(off.cagr), b: pct(all.cagr), d: pct(off.cagr - all.cagr).replace("+", "") })}`;
}
