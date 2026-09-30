import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import TradeTable, { type MemberLite } from "@/components/TradeTable";
import { PartyDot, Section, Stat } from "@/components/ui";
import { getLatestPrices, getMeta, getRecent, getStats, getUnparsed, memberMap, tickerName } from "@/lib/data";
import { dict, fmt, isLocale } from "@/lib/i18n";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const meta = getMeta();
  const stats = getStats();
  const recent = getRecent();
  const mm = memberMap();
  const { px } = getLatestPrices();
  const L = (p: string) => `/${locale}${p}`;

  const members: Record<string, MemberLite> = {};
  const pxSub: Record<string, number> = { SPY: px.SPY };
  for (const tr of recent) {
    const m = mm.get(tr.m);
    if (m && !members[tr.m]) members[tr.m] = { name: m.name, zh: m.zh, party: m.party, chamber: m.chamber, state: m.state };
    if (tr.sym && px[tr.sym] != null) pxSub[tr.sym] = px[tr.sym];
  }
  const unparsed = getUnparsed().length;
  const name = (id: string) => {
    const m = mm.get(id);
    return m ? (locale === "zh" && m.zh ? m.zh : m.name) : id;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t.home.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t.home.intro}</p>
        </div>
        {meta && (
          <div className="text-xs text-faint">
            {t.common.dataThrough} <span className="num">{meta.data_through}</span>
          </div>
        )}
      </div>

      {stats && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label={`${t.home.last30} · ${t.home.trades}`} value={stats.last30.trades.toLocaleString()} />
            <Stat label={`${t.home.last30} · ${t.home.members}`} value={stats.last30.members} />
            <Stat label={`${t.home.last30} · ${t.home.buys}`} value={<span className="text-pos">{stats.last30.buys.toLocaleString()}</span>} />
            <Stat label={`${t.home.last30} · ${t.home.sells}`} value={<span className="text-neg">{stats.last30.sells.toLocaleString()}</span>} />
            <Stat label={`${t.home.last30} · ${t.home.lateFilings}`} value={<span className="text-warn">{stats.last30.late}</span>} />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Board title={fmt(t.home.topBought, { d: stats.window })}>
              {stats.top_bought.map((x) => (
                <Chip key={x.sym} href={L(`/ticker/${x.sym}`)} main={x.sym} sub={fmt(t.home.membersCount, { n: x.nm })} title={tickerName(x.sym)} tone="pos" />
              ))}
            </Board>
            <Board title={fmt(t.home.topSold, { d: stats.window })}>
              {stats.top_sold.map((x) => (
                <Chip key={x.sym} href={L(`/ticker/${x.sym}`)} main={x.sym} sub={fmt(t.home.membersCount, { n: x.nm })} title={tickerName(x.sym)} tone="neg" />
              ))}
            </Board>
            <Board title={fmt(t.home.mostActive, { d: stats.window })}>
              <ol className="space-y-1.5 text-sm">
                {stats.active.slice(0, 8).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2">
                    <Link prefetch={false} href={L(`/member/${x.id}`)} className="flex min-w-0 items-center gap-1.5 hover:underline">
                      <PartyDot party={mm.get(x.id)?.party} />
                      <span className="truncate">{name(x.id)}</span>
                    </Link>
                    <span className="num text-xs text-muted whitespace-nowrap">{fmt(t.home.tradesCount, { n: x.n })}</span>
                  </li>
                ))}
              </ol>
            </Board>
          </div>
        </>
      )}

      <Section title={t.home.latestTable}>
        <TradeTable locale={locale} trades={recent} members={members} px={pxSub} filters />
        {unparsed > 0 && (
          <p className="mt-3 text-xs text-muted">
            {fmt(t.home.unparsedNote, { n: unparsed })}
            <Link prefetch={false} className="link" href={L("/unparsed")}>
              {t.home.unparsedLink}
            </Link>
          </p>
        )}
      </Section>
    </div>
  );
}

function Board({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ href, main, sub, title, tone }: { href: string; main: string; sub: string; title?: string; tone: "pos" | "neg" }) {
  return (
    <Link prefetch={false} href={href} title={title} className={`rounded-lg border border-line px-2.5 py-1.5 hover:bg-surface-2 ${tone === "pos" ? "hover:border-pos/40" : "hover:border-neg/40"}`}>
      <div className={`text-sm font-semibold ${tone === "pos" ? "text-pos" : "text-neg"}`}>{main}</div>
      <div className="text-[11px] text-faint">{sub}</div>
    </Link>
  );
}
