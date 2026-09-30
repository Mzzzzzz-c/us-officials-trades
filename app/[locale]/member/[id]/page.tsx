import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Positions from "@/components/Positions";
import TradeTable from "@/components/TradeTable";
import { Note, PartyBadge, Pct, Section, Stat } from "@/components/ui";
import { getLatestPrices, getMember, getMembers, getTickers, slim } from "@/lib/data";
import { amountRange } from "@/lib/format";
import { dict, fmt, isLocale } from "@/lib/i18n";
import { committeeName, committeeTitle, roleLabel, stateName } from "@/lib/labels";

export const dynamicParams = true;

// keeps the page light for the few filers with thousands of lines (the President reports ~9,000)
const MAX_TRADES = 1500;

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

export default async function MemberPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const data = getMember(id);
  if (!data) notFound();
  const t = dict(locale);
  const { profile: p, summary: s } = data;
  const { px } = getLatestPrices();
  const pxSub: Record<string, number> = { SPY: px.SPY };
  for (const tr of data.trades.slice(0, MAX_TRADES)) if (tr.sym && px[tr.sym] != null) pxSub[tr.sym] = px[tr.sym];
  const names: Record<string, string> = {};
  const want = new Set(data.positions.map((x) => x.sym));
  for (const tk of getTickers()) if (want.has(tk.sym)) names[tk.sym] = (locale === "zh" && tk.zh) || tk.name;
  const member = { [p.id]: { name: p.name, zh: p.zh, party: p.party, chamber: p.chamber, state: p.state, agency: p.agency, agency_zh: p.agency_zh } };
  const exec = p.chamber === "E";
  const partyLabel = t.party[p.party as keyof typeof t.party] ?? p.party;
  const horizons = ["30", "90", "180", "365"];
  const buy = data.perf.buy ?? {};
  const sell = data.perf.sell ?? {};

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {locale === "zh" && p.zh ? p.zh : p.name}
            {locale === "zh" && p.zh ? <span className="ml-2 text-base font-normal text-muted">{p.name}</span> : null}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {p.party ? <PartyBadge party={p.party} label={partyLabel} /> : null}
            <span>{t.chamber[p.chamber]}</span>
            <span>·</span>
            {exec ? <span>{roleLabel(p, locale)}</span> : null}
            <span className={exec ? "hidden" : ""}>
              {stateName(p.state, locale)}
              {p.chamber === "H" && p.district != null
                ? locale === "zh"
                  ? p.district === 0 ? " 全州选区" : ` 第${p.district}选区`
                  : p.district === 0 ? " at-large" : ` district ${p.district}`
                : ""}
            </span>
            <span>·</span>
            <span>{p.current ? t.common.current : t.common.former}</span>
            {p.since ? (
              <>
                <span>·</span>
                <span>
                  {exec ? t.member.firstFiling : t.member.since} {p.since}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {exec && p.congress ? (
        <p className="mt-3 text-sm">
          <Link prefetch={false} className="link" href={`/${locale}/member/${p.congress}`}>
            {t.member.congressPage} →
          </Link>
        </p>
      ) : null}
      {exec && data.trades.length === 0 && data.scanned.length === 0 ? (
        <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{t.member.noExecTrades}</p>
      ) : null}

      {p.committees?.length ? (
        <div className="mt-4">
          <div className="mb-1.5 text-xs text-muted">{t.member.committees}</div>
          <div className="flex flex-wrap gap-1.5">
            {p.committees.map((c) => (
              <span key={c.id} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs">
                {committeeName(c.id, c.name, locale)}
                {c.title ? <span className="text-faint"> · {committeeTitle(c.title, locale)}</span> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {exec && data.trades.length === 0 ? null : (
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={t.member.tradeCount} value={s.n.toLocaleString()} sub={<><span className="text-pos">{s.nb}</span> / <span className="text-neg">{s.ns}</span> {t.table.buysSells}</>} />
        <Stat label={t.table.volume} value={amountRange(s.vmin, s.vmax)} />
        <Stat label={t.member.avgDelay} value={data.delay.avg != null ? fmt(t.table.days, { n: data.delay.avg }) : "—"} sub={data.delay.max != null ? `${t.member.maxDelay} ${fmt(t.table.days, { n: data.delay.max })}` : undefined} />
        {exec ? (
          <Stat label={t.table.late} value="—" sub={<span className="text-[11px]">{t.member.execLateNote}</span>} />
        ) : (
          <Stat label={t.table.late} value={<span className={s.late ? "text-warn" : ""}>{s.late}</span>} sub="> 45" />
        )}
        <Stat label={t.table.lastFiled} value={<span className="text-base">{s.lastf ?? "—"}</span>} />
      </div>
      )}

      {Object.keys(buy).length > 0 && (
        <Section title={t.member.perfTitle}>
          <div className="card scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t.member.horizon}</th>
                  <th className="r">{t.member.officialExcess}</th>
                  <th className="r">{t.member.followerExcess}</th>
                  <th className="r">{t.member.winRate}</th>
                  <th className="r">{t.member.n}</th>
                  <th className="r">{t.member.sellPerf}</th>
                </tr>
              </thead>
              <tbody>
                {horizons.map((h) =>
                  buy[h] || sell[h] ? (
                    <tr key={h}>
                      <td className="whitespace-nowrap">{fmt(t.trade.horizonDays, { n: h })}</td>
                      <td className="r"><Pct v={buy[h]?.off} /></td>
                      <td className="r"><Pct v={buy[h]?.fol} /></td>
                      <td className="r num">{buy[h]?.win != null ? `${Math.round((buy[h]!.win as number) * 100)}%` : "—"}</td>
                      <td className="r num text-muted">{buy[h]?.n ?? 0}</td>
                      <td className="r"><Pct v={sell[h]?.off} /> <span className="text-[11px] text-faint">({sell[h]?.n ?? 0})</span></td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
          <Note>{t.member.perfNote}</Note>
        </Section>
      )}

      {data.positions.length > 0 && (
        <Section title={t.member.positions}>
          <Positions locale={locale} positions={data.positions} names={names} />
          <Note>{t.member.positionsNote}</Note>
        </Section>
      )}

      {exec && data.trades.length === 0 ? null : (
      <Section title={`${t.member.trades} (${data.trades.length})`}>
        <TradeTable locale={locale} trades={data.trades.slice(0, MAX_TRADES).map(slim)} members={member} px={pxSub} showMember={false} filters={data.trades.length > 30} />
        {data.trades.length > MAX_TRADES ? <Note>{fmt(t.member.tradesCapped, { n: MAX_TRADES, total: data.trades.length })}</Note> : null}
      </Section>
      )}

      {data.scanned.length > 0 && (
        <Section title={`${t.member.scanned} (${data.scanned.length})`}>
          <ul className="card divide-y divide-line text-sm">
            {data.scanned.map((f) => (
              <li key={f.doc} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="num text-muted">{f.fil ?? "—"}</span>
                <span className="text-xs text-faint">{t.unparsed.why[f.why as keyof typeof t.unparsed.why] ?? f.why}</span>
                <a className="link" href={f.url} target="_blank" rel="noopener noreferrer">
                  {t.common.viewSource} ↗
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {exec && (p.docs?.length || p.on_request) ? (
        <Section title={t.member.ogeDocs}>
          <ul className="card divide-y divide-line text-sm">
            {(p.docs ?? []).map((d, i) => (
              <li key={`${d.url}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <span className="num text-muted">{d.added}</span>
                <span className="flex-1">{t.executive.kinds[d.kind.replace(/\s*\(?\d{4}\)?$/, "")] ?? d.kind}{/\d{4}/.test(d.kind) ? ` (${d.kind.match(/\d{4}/)![0]})` : ""}</span>
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
        </Section>
      ) : null}
      <p className="mt-8 text-xs text-faint">
        <Link prefetch={false} className="link" href={`/${locale}/methodology`}>
          {t.nav.methodology}
        </Link>
      </p>
    </div>
  );
}
