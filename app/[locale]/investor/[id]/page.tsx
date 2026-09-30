import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Note, Pct, Section, Stat } from "@/components/ui";
import { getInvestor, getInvestors, getLatestPrices, getTickers, type InvestorHolding } from "@/lib/data";
import { priceRange, quarterLabel, shares, since, usdShort } from "@/lib/format";
import { dict, isLocale, type Locale } from "@/lib/i18n";

export const dynamicParams = true;

export function generateStaticParams() {
  return getInvestors().map((i) => ({ id: i.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const d = getInvestor(id);
  if (!d) return {};
  const p = d.profile;
  return { title: locale === "zh" ? `${p.zh} · ${p.firm_zh} 13F` : `${p.en} · ${p.firm_en} 13F` };
}

const CHG_TONE: Record<string, string> = {
  new: "bg-pos-soft text-pos",
  add: "bg-pos-soft text-pos",
  trim: "bg-neg-soft text-neg",
  exit: "bg-neg text-white",
  same: "bg-surface-2 text-muted",
};

export default async function InvestorPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const d = getInvestor(id);
  if (!d) notFound();
  const t = dict(locale);
  const p = d.profile;
  const { px } = getLatestPrices();
  const tickers = getTickers();
  const known = new Set(tickers.map((x) => x.sym));
  const zhNames: Record<string, string> = {};
  if (locale === "zh") for (const x of tickers) if (x.zh) zhNames[x.sym] = x.zh;
  const latest = d.quarters[0];
  const note = locale === "zh" ? p.note_zh : p.note_en;

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {locale === "zh" ? p.zh : p.en}
        {p.inferred ? (
          <span className="ml-2 align-middle rounded bg-warn-soft px-2 py-0.5 text-xs font-normal text-warn">{t.investors.inferred}</span>
        ) : null}
      </h1>
      <div className="mt-1 text-sm text-muted">
        {locale === "zh" ? p.firm_zh : p.firm_en} ·{" "}
        <a className="link" href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${p.cik}&type=13F-HR`} target="_blank" rel="noopener noreferrer">
          SEC CIK {p.cik} ↗
        </a>
      </div>
      {note ? <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{note}</p> : null}

      {latest && (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t.investors.latestQuarter} value={<span className="text-base">{quarterLabel(latest.period, locale)}</span>} />
          <Stat label={t.investors.filedOn} value={<span className="text-base">{latest.filed}</span>} />
          <Stat label={t.investors.totalValue} value={usdShort(latest.value)} />
          <Stat label={t.table.holdings} value={latest.n} />
        </div>
      )}

      <Section title={t.investors.holdingsTitle}>
        <HoldingTable locale={locale} rows={d.holdings} px={px} known={known} zh={zhNames} />
        <Note>{t.investors.costNote}</Note>
      </Section>

      {d.exits.length > 0 && (
        <Section title={t.investors.exitsTitle}>
          <HoldingTable locale={locale} rows={d.exits} px={px} known={known} zh={zhNames} exits />
        </Section>
      )}

      <Section title={t.investors.quarters}>
        <div className="card scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t.table.period}</th>
                <th>{t.investors.filedOn}</th>
                <th className="r">{t.investors.totalValue}</th>
                <th className="r">{t.table.holdings}</th>
                <th className="r">{t.common.source}</th>
              </tr>
            </thead>
            <tbody>
              {d.quarters.map((q) => (
                <tr key={q.period}>
                  <td>{quarterLabel(q.period, locale)}</td>
                  <td className="num text-muted">{q.filed}</td>
                  <td className="r num">{usdShort(q.value)}</td>
                  <td className="r num">{q.n}</td>
                  <td className="r">
                    <a className="link" href={q.url} target="_blank" rel="noopener noreferrer">
                      EDGAR ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {d.activity.length > 0 && (
        <Section title={t.investors.activityTitle}>
          <div className="space-y-2">
            {d.activity.map((a, i) => (
              <details key={a.period} className="card" open={i === 0}>
                <summary className="flex items-center justify-between px-4 py-3">
                  <span className="font-medium">{quarterLabel(a.period, locale)}</span>
                  <span className="text-xs text-muted">
                    {t.investors.filedOn} {a.filed} · {a.items.length}
                  </span>
                </summary>
                <div className="border-t border-line">
                  <HoldingTable locale={locale} rows={a.items} px={px} known={known} zh={zhNames} compact />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function HoldingTable({ locale, rows, px, known, zh, exits = false, compact = false }: { locale: Locale; rows: InvestorHolding[]; px: Record<string, number>; known: Set<string>; zh: Record<string, string>; exits?: boolean; compact?: boolean }) {
  const t = dict(locale);
  return (
    <div className={compact ? "scroll-x" : "card scroll-x"}>
      <table className="tbl">
        <thead>
          <tr>
            <th>{t.table.ticker}</th>
            <th className="hidden sm:table-cell">{t.table.name}</th>
            <th className="r">{t.table.shares}</th>
            {!exits && <th className="r">{t.table.value}</th>}
            {!exits && <th className="r">{t.table.weight}</th>}
            <th className="r">{t.table.change}</th>
            {!exits && <th className="r">{t.table.estCost}</th>}
            {!exits && <th className="r">{t.table.sinceFiling}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => {
            const now = h.sym ? px[h.sym] : undefined;
            const r = h.fol ? since(h.fol.p, now) : null;
            const s = h.fol?.sp ? since(h.fol.sp, px.SPY) : null;
            return (
              <tr key={`${h.cusip}-${h.pc ?? ""}-${i}`}>
                <td className="whitespace-nowrap">
                  {h.sym && known.has(h.sym) ? (
                    <Link prefetch={false} className="font-semibold link" href={`/${locale}/ticker/${h.sym}`}>
                      {h.sym}
                    </Link>
                  ) : (
                    <span className="font-semibold">{h.sym ?? "—"}</span>
                  )}
                  {h.pc ? <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] text-muted">{h.pc}</span> : null}
                </td>
                <td className="hidden max-w-64 truncate text-muted sm:table-cell" title={`${h.name} ${h.cls ?? ""}`}>
                  {(h.sym && zh[h.sym]) || h.name}
                </td>
                <td className="r num">{exits ? shares(-(h.dsh ?? 0)) : shares(h.sh)}</td>
                {!exits && <td className="r num">{usdShort(h.val)}</td>}
                {!exits && <td className="r num">{(h.w * 100).toFixed(h.w >= 0.1 ? 1 : 2)}%</td>}
                <td className="r whitespace-nowrap">
                  {h.chg ? <span className={`rounded px-1.5 py-0.5 text-xs ${CHG_TONE[h.chg] ?? ""}`}>{t.chg[h.chg]}</span> : "—"}
                  {h.pct != null && (h.chg === "add" || h.chg === "trim") ? (
                    <div className="text-[11px] text-faint num">
                      {h.pct > 0 ? "+" : ""}
                      {(h.pct * 100).toFixed(1)}%
                    </div>
                  ) : null}
                </td>
                {!exits && <td className="r num whitespace-nowrap">{h.cost ? priceRange(h.cost.lo, h.cost.hi) : "—"}</td>}
                {!exits && (
                  <td className="r whitespace-nowrap">
                    <Pct v={r} />
                    {r != null && s != null ? <div className="text-[11px] text-faint num">SPY {(s * 100).toFixed(1)}%</div> : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
