import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PriceChart, { type Marker } from "@/components/PriceChart";
import TradeTable, { type MemberLite } from "@/components/TradeTable";
import { PartyDot, Section } from "@/components/ui";
import { getLatestPrices, getSeries, getTicker, getTickers, investorMap, memberMap, slim } from "@/lib/data";
import { amountRange, price, quarterLabel, shares, usdShort } from "@/lib/format";
import { dict, isLocale } from "@/lib/i18n";

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
  const { px, asof } = getLatestPrices();
  const series = getSeries(sym)?.w ?? [];
  const members: Record<string, MemberLite> = {};
  for (const tr of d.trades) {
    const m = mm.get(tr.m);
    if (m) members[tr.m] = { name: m.name, zh: m.zh, party: m.party, chamber: m.chamber, state: m.state, agency: m.agency, agency_zh: m.agency_zh };
  }
  const name = (id: string) => {
    const m = mm.get(id);
    return m ? (locale === "zh" && m.zh ? m.zh : m.name) : id;
  };
  const markers: Marker[] = d.trades
    .filter((tr) => tr.tx && !tr.opt && (tr.type === "P" || tr.type === "SF" || tr.type === "SP" || tr.type === "S"))
    .map((tr) => ({
      date: tr.tx!,
      kind: tr.type === "P" ? "buy" : "sell",
      price: tr.ent?.off,
      label: `${tr.tx} · ${name(tr.m)} · ${t.types[tr.type]} · ${amountRange(tr.amin, tr.amax)}`,
    }));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {d.sym} <span className="text-lg font-normal text-muted">{locale === "zh" && d.zh ? d.zh : d.name}</span>
          </h1>
          {locale === "zh" && d.zh ? <div className="text-xs text-faint">{d.name}</div> : null}
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            <span>{t.sectors[d.sec as keyof typeof t.sectors] ?? d.sec}</span>
            {d.exch ? <span>· {t.ticker.exchange}: {d.exch}</span> : null}
            {d.sic && locale === "en" ? <span>· {t.ticker.industry}: {d.sic}</span> : null}
          </div>
        </div>
        {px[sym] != null && (
          <div className="text-right">
            <div className="text-xs text-muted">{t.ticker.lastPrice}</div>
            <div className="text-xl font-semibold num">{price(px[sym])}</div>
            <div className="text-[11px] text-faint num">{asof}</div>
          </div>
        )}
      </div>

      {series.length > 1 && (
        <Section title={t.ticker.priceChart}>
          <PriceChart series={series} markers={markers} ariaLabel={`${d.sym} ${t.ticker.priceChart}`} buyLabel={t.ticker.buyMarker} sellLabel={t.ticker.sellMarker} />
        </Section>
      )}

      {d.members.length > 0 && (
        <Section title={t.ticker.membersTrading}>
          <div className="card scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t.table.member}</th>
                  <th className="r">{t.table.buysSells}</th>
                  <th className="r">{t.table.volume}</th>
                  <th className="r">{t.ticker.stillHolding}</th>
                </tr>
              </thead>
              <tbody>
                {d.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link prefetch={false} href={`/${locale}/member/${m.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <PartyDot party={mm.get(m.id)?.party} />
                        {name(m.id)}
                      </Link>
                    </td>
                    <td className="r num">
                      <span className="text-pos">{m.nb}</span> / <span className="text-neg">{m.ns}</span>
                    </td>
                    <td className="r num">{amountRange(m.vmin, m.vmax)}</td>
                    <td className="r">{m.held == null ? "—" : m.held ? t.common.yes : t.common.no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {d.investors.length > 0 && (
        <Section title={t.ticker.investors}>
          <div className="card scroll-x">
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
                        <Link prefetch={false} className="link" href={`/${locale}/investor/${iv.id}`}>
                          {p ? (locale === "zh" ? p.zh : p.en) : iv.id}
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
        </Section>
      )}

      {d.trades.length > 0 && (
        <Section title={`${t.ticker.trades} (${d.trades.length})`}>
          <TradeTable locale={locale} trades={d.trades.map(slim)} members={members} px={{ SPY: px.SPY, [sym]: px[sym] }} showTicker={false} filters={d.trades.length > 30} />
        </Section>
      )}
    </div>
  );
}
