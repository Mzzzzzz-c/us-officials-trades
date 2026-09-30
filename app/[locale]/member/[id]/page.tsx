import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Positions from "@/components/Positions";
import TradeTable from "@/components/TradeTable";
import { Note, PartyBadge, Pct, Section, Stat } from "@/components/ui";
import { getLatestPrices, getMember, getMembers, getTickers, slim } from "@/lib/data";
import { amountRange } from "@/lib/format";
import { dict, fmt, isLocale } from "@/lib/i18n";
import { committeeName, committeeTitle, stateName } from "@/lib/labels";

export const dynamicParams = true;

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
    description: `${nm} · ${t.chamber[p.profile.chamber]} · ${t.party[p.profile.party as keyof typeof t.party] ?? ""} · ${p.summary.n} ${t.home.trades}`,
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
  for (const tr of data.trades) if (tr.sym && px[tr.sym] != null) pxSub[tr.sym] = px[tr.sym];
  const names: Record<string, string> = {};
  const want = new Set(data.positions.map((x) => x.sym));
  for (const tk of getTickers()) if (want.has(tk.sym)) names[tk.sym] = (locale === "zh" && tk.zh) || tk.name;
  const member = { [p.id]: { name: p.name, zh: p.zh, party: p.party, chamber: p.chamber, state: p.state } };
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
            <PartyBadge party={p.party} label={partyLabel} />
            <span>{t.chamber[p.chamber]}</span>
            <span>·</span>
            <span>
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
                  {t.member.since} {p.since}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

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

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={t.member.tradeCount} value={s.n.toLocaleString()} sub={<><span className="text-pos">{s.nb}</span> / <span className="text-neg">{s.ns}</span> {t.table.buysSells}</>} />
        <Stat label={t.table.volume} value={amountRange(s.vmin, s.vmax)} />
        <Stat label={t.member.avgDelay} value={data.delay.avg != null ? fmt(t.table.days, { n: data.delay.avg }) : "—"} sub={data.delay.max != null ? `${t.member.maxDelay} ${fmt(t.table.days, { n: data.delay.max })}` : undefined} />
        <Stat label={t.table.late} value={<span className={s.late ? "text-warn" : ""}>{s.late}</span>} sub="> 45" />
        <Stat label={t.table.lastFiled} value={<span className="text-base">{s.lastf ?? "—"}</span>} />
      </div>

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

      <Section title={`${t.member.trades} (${data.trades.length})`}>
        <TradeTable locale={locale} trades={data.trades.map(slim)} members={member} px={pxSub} showMember={false} filters={data.trades.length > 30} />
      </Section>

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
      <p className="mt-8 text-xs text-faint">
        <Link prefetch={false} className="link" href={`/${locale}/methodology`}>
          {t.nav.methodology}
        </Link>
      </p>
    </div>
  );
}
