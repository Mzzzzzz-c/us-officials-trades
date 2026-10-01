import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LineChart from "@/components/client/LineChart";
import Reveal from "@/components/client/Reveal";
import { Container, Metric, SectionHead } from "@/components/layout";
import { Avatar, Logo } from "@/components/media";
import Positions from "@/components/Positions";
import TradeTable from "@/components/TradeTable";
import { Note, Pct } from "@/components/ui";
import { getLatestPrices, getMedia, getMember, getMembers, getTickers, slim } from "@/lib/data";
import { amountRange, usdShort } from "@/lib/format";
import { dict, fmt, isLocale } from "@/lib/i18n";
import { committeeName, committeeTitle, roleLabel, stateName } from "@/lib/labels";
import { tickerRow } from "@/lib/people";

export const dynamicParams = true;

// keeps the page light for the few filers with thousands of lines (the President reports ~9,000)
const MAX_TRADES = 600;
// the President has ~800 reconstructed positions: show the ones still held, then the most recent
const MAX_POSITIONS = 60;

export function generateStaticParams() {
  return getMembers().map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const p = getMember(id);
  if (!p) return {};
  const t = dict(locale);
  const nm = locale === "zh" && p.profile.zh ? `${p.profile.zh}（${p.profile.name}）` : p.profile.name;
  return {
    title: nm,
    description: `${nm} · ${p.profile.chamber === "E" ? roleLabel(p.profile, locale) : t.chamber[p.profile.chamber]} · ${t.party[p.profile.party as keyof typeof t.party] ?? ""} · ${p.summary.n} ${t.home.trades}`,
  };
}

const pctTxt = (x: number | null | undefined) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);

export default async function MemberPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const data = getMember(id);
  if (!data) notFound();
  const t = dict(locale);
  const { profile: p, summary: s } = data;
  const { px, pc = {} } = getLatestPrices();
  const media = getMedia();
  const shown = data.trades.slice(0, MAX_TRADES);
  const pxSub: Record<string, number> = { SPY: px.SPY };
  for (const tr of shown) if (tr.sym && px[tr.sym] != null) pxSub[tr.sym] = px[tr.sym];
  const names: Record<string, string> = {};
  const kinds: Record<string, 1 | 2 | 3> = {};
  const posShown = [...data.positions].sort((a, b) => Number(b.held) - Number(a.held) || (a.last < b.last ? 1 : -1)).slice(0, MAX_POSITIONS);
  const want = new Set(posShown.map((x) => x.sym));
  for (const tk of getTickers()) if (want.has(tk.sym)) names[tk.sym] = (locale === "zh" && tk.zh) || tk.name;
  for (const sym of want) if (media.logos[sym]) kinds[sym] = media.logos[sym];
  const tradeMedia = { p: media.people[p.id] ? { [p.id]: 1 as const } : {}, l: {} as Record<string, 1 | 2 | 3> };
  for (const tr of shown) if (tr.sym && media.logos[tr.sym]) tradeMedia.l[tr.sym] = media.logos[tr.sym];
  const member = { [p.id]: { name: p.name, zh: p.zh, party: p.party, chamber: p.chamber, state: p.state, agency: p.agency, agency_zh: p.agency_zh } };
  const exec = p.chamber === "E";
  const partyLabel = t.party[p.party as keyof typeof t.party] ?? p.party;
  const horizons = ["30", "90", "180", "365"];
  const buy = data.perf.buy ?? {};
  const sell = data.perf.sell ?? {};
  const nav = data.nav;
  const title = locale === "zh" && p.zh ? p.zh : p.name;

  // what they buy, by sector (stock buys)
  const secCount = new Map<string, number>();
  for (const tr of data.trades) {
    if (tr.type !== "P" || !tr.sym) continue;
    const sec = tickerRow(tr.sym)?.sec ?? "other";
    secCount.set(sec, (secCount.get(sec) ?? 0) + 1);
  }
  const sectors = Array.from(secCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const secMax = sectors[0]?.[1] ?? 1;
  const heldNow = data.positions.filter((x) => x.held).length;

  const place = exec
    ? roleLabel(p, locale)
    : `${t.chamber[p.chamber]} · ${stateName(p.state, locale)}${
        p.chamber === "H" && p.district != null ? (locale === "zh" ? (p.district === 0 ? " 全州选区" : ` 第${p.district}选区`) : p.district === 0 ? " at-large" : ` district ${p.district}`) : ""
      }`;

  return (
    <div>
      {/* ---------------------------------------------------------------- hero */}
      <section className="bg-elev">
        <Container className="pt-12 pb-10 sm:pt-16">
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:text-left">
            <div className="fade-up">
              <Avatar id={p.id} name={p.name} party={p.party} has={!!media.people[p.id]} size={148} />
            </div>
            <div className="fade-up min-w-0 flex-1" style={{ animationDelay: "80ms" }}>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {p.party ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${p.party === "D" ? "bg-dem" : p.party === "R" ? "bg-rep" : "bg-ind"}`}>{partyLabel}</span>
                ) : null}
                <span className="text-sm text-muted">{p.current ? t.common.current : t.common.former}</span>
                {p.since ? <span className="text-sm text-faint">· {exec ? t.member.firstFiling : t.member.since} {p.since.slice(0, 4)}</span> : null}
              </div>
              <h1 className="headline mt-2">{title}</h1>
              {locale === "zh" && p.zh ? <div className="mt-1 text-lg text-muted">{p.name}</div> : null}
              <div className="mt-2 text-[17px] text-muted">{place}</div>
            </div>
          </div>

          {p.committees?.length ? (
            <div className="mt-8 flex flex-wrap justify-center gap-2 sm:justify-start">
              {p.committees.map((c) => (
                <span key={c.id} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs">
                  {committeeName(c.id, c.name, locale)}
                  {c.title ? <span className="font-semibold text-accent"> · {committeeTitle(c.title, locale)}</span> : null}
                </span>
              ))}
            </div>
          ) : null}

          {exec && p.congress ? (
            <p className="mt-5 text-center text-sm sm:text-left">
              <Link prefetch={false} className="link" href={`/${locale}/member/${p.congress}`}>
                {t.member.congressPage} ›
              </Link>
            </p>
          ) : null}

          {!(exec && data.trades.length === 0) ? (
            <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-hair pt-8 sm:grid-cols-3 lg:grid-cols-6">
              <Metric
                label={t.member.tradeCount}
                value={s.n.toLocaleString()}
                sub={
                  <>
                    <span className="text-pos">{s.nb}</span> {t.x.buy} · <span className="text-neg">{s.ns}</span> {t.x.sell}
                  </>
                }
              />
              <Metric label={t.table.volume} value={<span className="whitespace-nowrap text-[20px]">{amountRange(s.vmin, s.vmax)}</span>} />
              <Metric label={t.member.stillHeld} value={heldNow} />
              <Metric
                label={t.member.avgDelay}
                value={data.delay.avg != null ? fmt(t.table.days, { n: Math.round(data.delay.avg) }) : "—"}
                sub={data.delay.max != null ? `${t.member.maxDelay} ${fmt(t.table.days, { n: data.delay.max })}` : undefined}
              />
              {exec ? (
                <Metric label={t.table.late} value="—" sub={t.member.execLateNote.slice(0, 40) + "…"} />
              ) : (
                <Metric label={t.table.late} value={<span className={s.late ? "text-warn" : ""}>{s.late}</span>} sub="> 45" />
              )}
              <Metric label={t.table.lastFiled} value={<span className="text-[20px]">{s.lastf ?? "—"}</span>} />
            </div>
          ) : null}
        </Container>
      </section>

      <Container>
        {exec && data.trades.length === 0 && data.scanned.length === 0 ? <p className="mt-8 rounded-2xl bg-warn-soft px-5 py-4 text-sm text-warn">{t.member.noExecTrades}</p> : null}

        {s.ov ? (
          <Reveal className="mt-8">
            <div className="flex items-start gap-3 rounded-2xl bg-warn-soft px-5 py-4 text-sm text-warn">
              <span className="text-lg leading-none">!</span>
              <span>
                <b>
                  {t.x.oversightTitle} · {s.ov}
                </b>
                <br />
                {t.x.oversightSub}
              </span>
            </div>
          </Reveal>
        ) : null}

        {/* ---------------------------------------------------------------- copy curve */}
        {nav && nav.pts.length > 5 ? (
          <Reveal className="mt-14">
            <SectionHead title={t.x.copyThis} sub={t.x.copyThisSub} />
            <div className="card p-5 sm:p-8">
              <div className="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {nav.cagr != null ? (
                  <>
                    <Metric label={`${t.x.copyAll} · ${t.x.cagr}`} value={pctTxt(nav.cagr)} tone={nav.cagr >= (nav.bcagr ?? 0) ? "pos" : "neg"} />
                    <Metric label={`${t.x.spy} · ${t.x.cagr}`} value={pctTxt(nav.bcagr)} />
                    <Metric label={t.x.total} value={pctTxt(nav.total)} sub={`${t.x.spy} ${pctTxt(nav.bench)}`} />
                  </>
                ) : (
                  <>
                    {/* under a year of history: cumulative returns, not annualised ones */}
                    <Metric label={`${t.x.copyAll} · ${t.x.total}`} value={pctTxt(nav.total)} tone={nav.total >= nav.bench ? "pos" : "neg"} />
                    <Metric label={`${t.x.spy} · ${t.x.total}`} value={pctTxt(nav.bench)} />
                    <Metric label={t.x.period} value={<span className="text-[20px]">{nav.from.slice(0, 7)} → {nav.to.slice(0, 7)}</span>} sub={t.x.shortHistory} />
                  </>
                )}
                <Metric label={t.x.mdd} value={pctTxt(nav.mdd)} sub={fmt(t.x.nBuys, { n: nav.n })} />
              </div>
              <LineChart
                series={[
                  { label: t.x.copyAll, color: "var(--chart-1)", pts: nav.pts.map((x) => [x[0], x[1]]) },
                  { label: t.x.spy, color: "var(--chart-2)", pts: nav.pts.map((x) => [x[0], x[2]]) },
                ]}
                rangeLabels={t.x.range}
                height={280}
              />
            </div>
          </Reveal>
        ) : null}

        {/* ---------------------------------------------------------------- performance + sectors */}
        {Object.keys(buy).length > 0 || sectors.length > 0 ? (
          <div className="mt-14 grid gap-6 lg:grid-cols-5">
            {Object.keys(buy).length > 0 ? (
              <Reveal className="lg:col-span-3">
                <h3 className="title-2 mb-4">{t.member.perfTitle}</h3>
                <div className="card scroll-x overflow-hidden">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>{t.member.horizon}</th>
                        <th className="r">{t.member.officialExcess}</th>
                        <th className="r">{t.member.followerExcess}</th>
                        <th className="r">{t.member.winRate}</th>
                        <th className="r">{t.member.n}</th>
                        <th className="r">{t.x.sell}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {horizons.map((h) =>
                        buy[h] || sell[h] ? (
                          <tr key={h}>
                            <td className="whitespace-nowrap font-medium">{fmt(t.trade.horizonDays, { n: h })}</td>
                            <td className="r"><Pct v={buy[h]?.off} /></td>
                            <td className="r"><Pct v={buy[h]?.fol} /></td>
                            <td className="r num">{buy[h]?.win != null ? `${Math.round((buy[h]!.win as number) * 100)}%` : "—"}</td>
                            <td className="r num text-muted">{buy[h]?.n ?? 0}</td>
                            <td className="r"><Pct v={sell[h]?.off} /></td>
                          </tr>
                        ) : null,
                      )}
                    </tbody>
                  </table>
                </div>
                <Note>{t.member.perfNote} {t.member.sellPerf}</Note>
              </Reveal>
            ) : null}
            {sectors.length > 0 ? (
              <Reveal className={Object.keys(buy).length > 0 ? "lg:col-span-2" : "lg:col-span-5"}>
                <h3 className="title-2 mb-4">{t.x.topSectors}</h3>
                <div className="card space-y-3 p-5">
                  {sectors.map(([sec, n]) => (
                    <div key={sec}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{t.sectors[sec as keyof typeof t.sectors] ?? sec}</span>
                        <span className="num text-muted">{n}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(n / secMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
            ) : null}
          </div>
        ) : null}

        {/* ---------------------------------------------------------------- trading style */}
        {data.style && data.trades.length >= 5 ? (
          <Reveal className="mt-14">
            <SectionHead title={t.x.styleTitle} sub={t.x.styleSub} />
            <div className="card grid gap-px overflow-hidden bg-hair sm:grid-cols-2 lg:grid-cols-4">
              <StyleCell label={t.x.styleMed} value={data.style.med != null ? usdShort(data.style.med) : "—"} />
              <StyleCell
                label={t.x.styleHold}
                value={data.style.hold != null ? fmt(t.table.days, { n: data.style.hold }) : "—"}
                sub={data.style.nhold ? fmt(t.x.styleHoldSub, { n: data.style.nhold }) : undefined}
              />
              <StyleCell label={t.x.styleOpt} value={`${Math.round(data.style.opt * 100)}%`} />
              <StyleCell label={t.x.styleFam} value={`${Math.round(data.style.fam * 100)}%`} sub={t.x.styleFamSub} />
            </div>
            {data.style.top.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.style.top.map(([sym, n]) => (
                  <Link key={sym} prefetch={false} href={`/${locale}/ticker/${sym}`} className="chip py-1.5 pl-1.5">
                    <Logo sym={sym} kind={media.logos[sym]} size={24} />
                    <span className="font-semibold">{sym}</span>
                    <span className="text-muted">{fmt(t.x.nTimes, { n })}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </Reveal>
        ) : null}

        {/* ---------------------------------------------------------------- positions */}
        {data.positions.length > 0 && (
          <Reveal className="mt-14">
            <SectionHead title={t.x.holdingsTitle} sub={t.member.positionsNote} />
            <Positions locale={locale} positions={posShown} names={names} kinds={kinds} px={px} pc={pc} />
            {data.positions.length > posShown.length ? <Note>{fmt(t.x.positionsCapped, { n: posShown.length, total: data.positions.length })}</Note> : null}
          </Reveal>
        )}

        {/* ---------------------------------------------------------------- trades */}
        {exec && data.trades.length === 0 ? null : (
          <section className="mt-14">
            <SectionHead title={`${t.x.tradesTitle} (${data.trades.length.toLocaleString()})`} />
            <TradeTable locale={locale} trades={shown.map(slim)} members={member} px={pxSub} showMember={false} filters={data.trades.length > 30} media={tradeMedia} />
            {data.trades.length > MAX_TRADES ? <Note>{fmt(t.member.tradesCapped, { n: MAX_TRADES, total: data.trades.length })}</Note> : null}
          </section>
        )}

        {data.scanned.length > 0 && (
          <section className="mt-14">
            <SectionHead title={`${t.member.scanned} (${data.scanned.length})`} />
            <ul className="card divide-y divide-hair text-sm">
              {data.scanned.map((f) => (
                <li key={f.doc} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="num text-muted">{f.fil ?? "—"}</span>
                  <span className="text-xs text-faint">{t.unparsed.why[f.why as keyof typeof t.unparsed.why] ?? f.why}</span>
                  <a className="link" href={f.url} target="_blank" rel="noopener noreferrer">
                    {t.common.viewSource} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {exec && (p.docs?.length || p.on_request) ? (
          <section className="mt-14">
            <SectionHead title={t.member.ogeDocs} />
            <ul className="card divide-y divide-hair text-sm">
              {(p.docs ?? []).map((d, i) => (
                <li key={`${d.url}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="num text-muted">{d.added}</span>
                  <span className="flex-1">
                    {t.executive.kinds[d.kind.replace(/\s*\(?\d{4}\)?$/, "")] ?? d.kind}
                    {/\d{4}/.test(d.kind) ? ` (${d.kind.match(/\d{4}/)![0]})` : ""}
                  </span>
                  {d.url ? (
                    <a className="link" href={d.url} target="_blank" rel="noopener noreferrer">
                      PDF ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            <Note>
              {t.member.ogeDocsNote} {p.on_request ? fmt(t.member.onRequest, { n: p.on_request }) : ""}
            </Note>
          </section>
        ) : null}

        {media.wiki[p.id] || media.files?.[p.id] ? (
          <p className="mt-10 text-[11px] text-faint">
            {t.x.photo}:{" "}
            <a
              className="hover:underline"
              href={
                media.files?.[p.id]
                  ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(media.files[p.id].replace(/ /g, "_"))}`
                  : `https://en.wikipedia.org/wiki/${(media.wiki[p.id] ?? "").replace(/ /g, "_")}`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              {media.files?.[p.id] ? "Wikimedia Commons" : "Wikipedia"}
            </a>
          </p>
        ) : null}
      </Container>
    </div>
  );
}

function StyleCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-[28px] font-semibold tracking-tight">{value}</div>
      {sub ? <div className="mt-1 text-xs text-faint">{sub}</div> : null}
    </div>
  );
}
