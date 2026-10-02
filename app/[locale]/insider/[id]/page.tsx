import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Share from "@/components/client/Share";
import Reveal from "@/components/client/Reveal";
import StockChart, { type TradeMark } from "@/components/client/StockChart";
import { Container, Metric, SectionHead } from "@/components/layout";
import { Avatar, Logo } from "@/components/media";
import { getInsider, getInsiderPeople, getMedia, getSeries, getTicker, insiderName, insiderTitle, tickerName } from "@/lib/data";
import { usdShort } from "@/lib/format";
import { dict, fmt, isLocale, type Locale } from "@/lib/i18n";

// Tens of thousands of people: every page renders on first visit and is then cached.
export const dynamicParams = true;
export const revalidate = 86400;
export function generateStaticParams() {
  return [];
}

const MAX_SHOWN = 300;

function load(id: string) {
  if (!/^\d{1,10}$/.test(id)) return null;
  const { byId, asof } = getInsiderPeople();
  const p = byId.get(Number(id));
  if (!p) return null;
  const stocks = p[4].map((sym) => {
    const f = getInsider(sym);
    return { sym, cik: f?.cik ?? 0, file: f, tx: (f?.tx ?? []).filter((r) => r[11] === p[0]) };
  });
  return { p, asof, stocks };
}

const roleOf = (rel: string, ttl: string, locale: Locale) => {
  const i = dict(locale).insider;
  return insiderTitle(ttl) || [...rel].map((c) => i.rel[c as keyof typeof i.rel] ?? "").filter(Boolean).join(" · ");
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const d = load(id);
  if (!d) return {};
  const t = dict(locale);
  const name = insiderName(d.p[1]);
  return {
    title: `${name} · ${d.p[4][0]} ${t.insider.eyebrow}`,
    description: `${name} · ${d.p[4].slice(0, 4).join(", ")} · ${roleOf(d.p[2], d.p[3], locale)} · ${t.insider.bought} ${usdShort(d.p[7])} · ${t.insider.sold} ${usdShort(d.p[8])}`,
  };
}

export default async function InsiderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const d = load(id);
  if (!d) notFound();
  const t = dict(locale);
  const i = t.insider;
  const { p, stocks } = d;
  const logos = getMedia().logos;
  const name = insiderName(p[1]);
  const main = stocks[0];
  const rows = stocks
    .flatMap((s) => s.tx.map((r) => ({ r, sym: s.sym, cik: s.cik })))
    .sort((a, b) => (a.r[0] < b.r[0] ? 1 : a.r[0] > b.r[0] ? -1 : 0));
  const n = p[5] + p[6];
  const planned = rows.filter((x) => x.r[9]).length;
  const net = p[7] - p[8];
  const first = rows.length ? rows[rows.length - 1].r[0] : "";

  // this person's buys and sells per day, for the chart of the stock they traded most
  const byDay = new Map<string, TradeMark>();
  for (const r of main.tx) {
    const mk = byDay.get(r[0]) ?? { d: r[0], b: 0, s: 0 };
    if (r[5] === "P") mk.b += 1;
    else mk.s += 1;
    byDay.set(r[0], mk);
  }
  const marks = Array.from(byDay.values()).sort((a, b) => (a.d < b.d ? -1 : 1));
  // trades older than a year would fall outside the default one-year view
  const yearAgo = new Date(Date.parse(d.asof || new Date().toISOString()) - 365 * 864e5).toISOString().slice(0, 10);
  const wide = marks.length > 0 && marks.filter((m) => m.d >= yearAgo).length < marks.length / 2;
  const series = getSeries(main.sym)?.w ?? [];
  const officialTrades = getTicker(main.sym)?.trades.length ?? 0;

  // colleagues: other insiders of the same company, by dollar value traded
  const peers = new Map<number, { id: number; who: string; rel: string; title: string; v: number; b: number; s: number }>();
  for (const r of main.file?.tx ?? []) {
    const oc = r[11];
    if (!oc || oc === p[0]) continue;
    const c = peers.get(oc) ?? { id: oc, who: r[2], rel: r[3], title: r[4], v: 0, b: 0, s: 0 };
    c.v += r[8];
    if (r[5] === "P") c.b += 1;
    else c.s += 1;
    peers.set(oc, c);
  }
  const peerList = Array.from(peers.values()).sort((a, b) => b.v - a.v).slice(0, 8);
  const path = `/${locale}/insider/${p[0]}`;

  return (
    <div>
      <section className="bg-elev">
        <Container className="pt-12 pb-10 sm:pt-16">
          <div className="fade-up flex flex-wrap items-center gap-6">
            <Avatar id={`ins-${p[0]}`} name={name} size={104} />
            <div className="min-w-0 flex-1">
              <div className="eyebrow">{i.eyebrow}</div>
              <h1 className="headline break-words">{name}</h1>
              <div className="mt-1 text-[17px] text-muted">
                {roleOf(p[2], p[3], locale)} ·{" "}
                <Link prefetch={false} className="link" href={`/${locale}/ticker/${encodeURIComponent(main.sym)}#insiders`}>
                  {main.sym} {tickerName(main.sym, locale) ?? ""}
                </Link>
              </div>
              <div className="mt-1 text-xs text-faint">{i.asFiled}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[...p[2]].map((c) =>
                  i.rel[c as keyof typeof i.rel] ? (
                    <span key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-muted">
                      {i.rel[c as keyof typeof i.rel]}
                    </span>
                  ) : null,
                )}
                <Share compact path={path} image={`/${locale}/opengraph-image`} text={`${name} · ${main.sym} ${i.eyebrow} · ${t.siteName}`} labels={t.share} />
                <a className="btn btn-quiet text-[13px]" href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(p[0]).padStart(10, "0")}&type=4&dateb=&owner=include&count=40`} target="_blank" rel="noopener noreferrer">
                  {i.secAll} ↗
                </a>
              </div>
            </div>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Metric label={`${i.bought} · ${i.window}`} value={p[5] ? usdShort(p[7]) : "—"} tone={p[5] ? "pos" : undefined} sub={p[5] ? fmt(i.nTrades, { n: p[5] }) : undefined} />
            <Metric label={`${i.sold} · ${i.window}`} value={p[6] ? usdShort(p[8]) : "—"} tone={p[6] ? "neg" : undefined} sub={p[6] ? fmt(i.nTrades, { n: p[6] }) : undefined} />
            <Metric label={net >= 0 ? i.net : i.netSell} value={usdShort(Math.abs(net))} tone={net >= 0 ? "pos" : "neg"} sub={first ? `${first} – ${p[9]}` : undefined} />
            <Metric label={i.planShare} value={n ? `${Math.round((planned / Math.max(1, rows.length)) * 100)}%` : "—"} sub={fmt(i.planShareSub, { n: rows.length, k: planned })} />
          </div>
        </Container>
      </section>

      <Container>
        {series.length ? (
          <Reveal className="mt-10">
            <SectionHead title={fmt(i.chartTitle, { sym: main.sym })} sub={i.chartSub} href={`/${locale}/ticker/${encodeURIComponent(main.sym)}`} more={fmt(i.viewStock, { sym: main.sym })} />
            <div className="card p-4 sm:p-6">
              <StockChart sym={main.sym} initialRange={wide ? "5y" : "1y"} marks={marks} fallback={series} labels={t.x.chartRange} buyLabel={t.x.buy} sellLabel={t.x.sell} locale={locale} />
            </div>
            {officialTrades ? (
              <p className="mt-3 text-[13px] text-muted">
                <Link prefetch={false} className="link" href={`/${locale}/ticker/${encodeURIComponent(main.sym)}`}>
                  {fmt(i.officialsToo, { sym: main.sym, n: officialTrades.toLocaleString("en-US") })} ›
                </Link>
              </p>
            ) : null}
          </Reveal>
        ) : null}

        {stocks.length > 1 ? (
          <Reveal className="mt-14">
            <SectionHead title={i.companies} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {stocks.map((s) => {
                const vb = s.tx.filter((r) => r[5] === "P").reduce((a, r) => a + r[8], 0);
                const vs = s.tx.filter((r) => r[5] === "S").reduce((a, r) => a + r[8], 0);
                return (
                  <Link key={s.sym} prefetch={false} href={`/${locale}/ticker/${encodeURIComponent(s.sym)}#insiders`} className="tile flex items-center gap-3 p-4">
                    <Logo sym={s.sym} kind={logos[s.sym]} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{s.sym}</div>
                      <div className="truncate text-[11px] text-muted">{tickerName(s.sym, locale) ?? ""}</div>
                      <div className="num mt-1 text-xs">
                        {vb ? <span className="text-pos">{i.bought} {usdShort(vb)}</span> : null}
                        {vb && vs ? " · " : null}
                        {vs ? <span className="text-neg">{i.sold} {usdShort(vs)}</span> : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Reveal>
        ) : null}

        <Reveal className="mt-14">
          <SectionHead title={i.tradesTitle} sub={i.tradesSub} />
          <div className="card scroll-x overflow-hidden">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{i.date}</th>
                  <th>{i.company}</th>
                  <th>{i.side}</th>
                  <th className="r">{i.shares}</th>
                  <th className="r">{i.price}</th>
                  <th className="r">{i.value}</th>
                  <th className="r">{i.filed}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, MAX_SHOWN).map(({ r, sym, cik }, k) => (
                  <tr key={k}>
                    <td className="num whitespace-nowrap">{r[0]}</td>
                    <td>
                      <Link prefetch={false} href={`/${locale}/ticker/${encodeURIComponent(sym)}#insiders`} className="flex items-center gap-2.5">
                        <Logo sym={sym} kind={logos[sym]} size={28} />
                        <span className="font-medium">{sym}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${r[5] === "P" ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}>{r[5] === "P" ? i.buys : i.sells}</span>
                      {r[9] ? (
                        <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted" title={i.planTip}>
                          {i.plan}
                        </span>
                      ) : null}
                    </td>
                    <td className="r num">{r[6].toLocaleString("en-US")}</td>
                    <td className="r num">${r[7].toFixed(2)}</td>
                    <td className="r num font-medium">{usdShort(r[8])}</td>
                    <td className="r num whitespace-nowrap">
                      <a className="link" href={`https://www.sec.gov/Archives/edgar/data/${cik}/${r[10].replace(/-/g, "")}/`} target="_blank" rel="noopener noreferrer">
                        {r[1]}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > MAX_SHOWN ? <p className="mt-3 text-xs text-faint">{fmt(i.more, { n: rows.length - MAX_SHOWN })}</p> : null}
          <p className="mt-3 text-xs text-faint">
            {i.plan}: {i.planTip}
          </p>
        </Reveal>

        {peerList.length ? (
          <Reveal className="mt-14">
            <SectionHead title={`${i.peers} · ${main.sym}`} href={`/${locale}/insiders?q=${encodeURIComponent(main.sym)}`} more={i.listLink} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {peerList.map((c) => (
                <Link key={c.id} prefetch={false} href={`/${locale}/insider/${c.id}`} className="tile flex items-center gap-3 p-4">
                  <Avatar id={`ins-${c.id}`} name={insiderName(c.who)} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{insiderName(c.who)}</div>
                    <div className="truncate text-[11px] text-muted">{roleOf(c.rel, c.title, locale)}</div>
                    <div className="num mt-1 text-xs">
                      <span className="text-pos">{i.buys} {c.b}</span> · <span className="text-neg">{i.sells} {c.s}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Reveal>
        ) : null}
      </Container>
    </div>
  );
}
