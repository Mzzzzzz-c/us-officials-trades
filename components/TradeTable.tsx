"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { Trade } from "@/lib/data";
import { amountRange, price, priceRange, shareRange, since } from "@/lib/format";
import { dict, fmt, type Locale } from "@/lib/i18n";
import { ConfBadge, PartyDot, Pct, TypeBadge } from "./ui";

export interface MemberLite {
  name: string;
  zh?: string;
  party: string;
  chamber: "H" | "S";
  state: string;
}

interface Props {
  locale: Locale;
  trades: Trade[];
  members?: Record<string, MemberLite>;
  px: Record<string, number>;
  showMember?: boolean;
  showTicker?: boolean;
  filters?: boolean;
  pageSize?: number;
}

const SELL = new Set(["SF", "SP", "S"]);
const MIN_AMOUNTS = [0, 15001, 50001, 100001, 250001, 1000001];

export default function TradeTable({ locale, trades, members = {}, px, showMember = true, showTicker = true, filters = false, pageSize = 50 }: Props) {
  const t = dict(locale);
  const [q, setQ] = useState("");
  const [chamber, setChamber] = useState("");
  const [party, setParty] = useState("");
  const [kind, setKind] = useState("");
  const [minAmt, setMinAmt] = useState(0);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return trades.filter((tr) => {
      const m = members[tr.m];
      if (chamber && tr.ch !== chamber) return false;
      if (party && m?.party !== party) return false;
      if (kind === "buy" && tr.type !== "P") return false;
      if (kind === "sell" && !SELL.has(tr.type)) return false;
      if (minAmt && (tr.amin ?? 0) < minAmt) return false;
      if (needle) {
        const hay = `${tr.sym ?? ""} ${tr.asset ?? ""} ${m?.name ?? ""} ${m?.zh ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [trades, members, q, chamber, party, kind, minAmt]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * pageSize, (cur + 1) * pageSize);
  const L = (href: string) => `/${locale}${href}`;
  const reset = () => setPage(0);
  const spyNow = px.SPY;

  return (
    <div>
      {filters && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <input
            className="input w-56"
            placeholder={t.filters.searchPlaceholder}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              reset();
            }}
          />
          <select className="input" value={chamber} onChange={(e) => { setChamber(e.target.value); reset(); }} aria-label={t.filters.chamber}>
            <option value="">{t.filters.chamber}: {t.common.all}</option>
            <option value="H">{t.chamber.H}</option>
            <option value="S">{t.chamber.S}</option>
          </select>
          <select className="input" value={party} onChange={(e) => { setParty(e.target.value); reset(); }} aria-label={t.filters.party}>
            <option value="">{t.filters.party}: {t.common.all}</option>
            <option value="D">{t.party.D}</option>
            <option value="R">{t.party.R}</option>
            <option value="I">{t.party.I}</option>
          </select>
          <select className="input" value={kind} onChange={(e) => { setKind(e.target.value); reset(); }} aria-label={t.filters.type}>
            <option value="">{t.filters.type}: {t.common.all}</option>
            <option value="buy">{t.filters.buysOnly}</option>
            <option value="sell">{t.filters.sellsOnly}</option>
          </select>
          <select className="input" value={minAmt} onChange={(e) => { setMinAmt(Number(e.target.value)); reset(); }} aria-label={t.filters.minAmount}>
            {MIN_AMOUNTS.map((a) => (
              <option key={a} value={a}>
                {t.filters.minAmount}: {a ? amountRange(a, null) : t.common.all}
              </option>
            ))}
          </select>
          <span className="text-muted text-xs ml-auto">{fmt(t.common.results, { n: rows.length.toLocaleString() })}</span>
        </div>
      )}
      <div className="card scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t.table.filed}</th>
              {showMember && <th>{t.table.member}</th>}
              {showTicker && <th>{t.table.ticker}</th>}
              <th>{t.table.type}</th>
              <th>{t.table.tx}</th>
              <th className="r">{t.table.amount}</th>
              <th className="r">{t.table.estPrice}</th>
              <th className="r" title={t.trade.follower}>{t.table.followSince}</th>
              <th className="r">{t.table.delay}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((tr) => {
              const m = members[tr.m];
              const now = tr.sym ? px[tr.sym] : undefined;
              const chg = since(tr.ent?.fol, now);
              const spy = since(tr.ent?.sfol, spyNow);
              const isOpen = open === tr.id;
              const late = (tr.delay ?? 0) > 45;
              return (
                <Fragment key={tr.id}>
                  <tr onClick={() => setOpen(isOpen ? null : tr.id)} className="cursor-pointer">
                    <td className="num whitespace-nowrap text-muted">{tr.fil ?? "—"}</td>
                    {showMember && (
                      <td className="min-w-36">
                        <Link prefetch={false} href={L(`/member/${tr.m}`)} className="inline-flex items-center gap-1.5 hover:underline" onClick={(e) => e.stopPropagation()}>
                          <PartyDot party={m?.party} />
                          <span>{m ? (locale === "zh" && m.zh ? m.zh : m.name) : tr.m}</span>
                        </Link>
                        {m && (
                          <div className="text-[11px] text-faint">
                            {t.chamber[m.chamber]} · {m.state}
                          </div>
                        )}
                      </td>
                    )}
                    {showTicker && (
                      <td className="max-w-64">
                        {tr.sym ? (
                          <Link prefetch={false} href={L(`/ticker/${tr.sym}`)} className="font-medium link" onClick={(e) => e.stopPropagation()}>
                            {tr.sym}
                          </Link>
                        ) : null}
                        <div className="text-[11px] text-faint truncate" title={tr.asset}>
                          {tr.opt ? `${t.trade.option} · ` : ""}
                          {tr.asset}
                        </div>
                      </td>
                    )}
                    <td>
                      <TypeBadge type={tr.type} label={t.types[tr.type] ?? tr.type} />
                      {tr.act && tr.act !== "other" ? <div className="text-[11px] text-faint mt-0.5">{t.acts[tr.act as keyof typeof t.acts]}</div> : null}
                    </td>
                    <td className="num whitespace-nowrap">{tr.tx ?? "—"}</td>
                    <td className="r num whitespace-nowrap">{amountRange(tr.amin, tr.amax)}</td>
                    <td className="r num whitespace-nowrap">
                      {tr.est?.p ? price(tr.est.p) : <span className="text-faint">—</span>}
                      {tr.est && tr.est.conf !== "none" ? (
                        <div>
                          <ConfBadge conf={tr.est.conf} label={t.conf[tr.est.conf]} title={tr.est.why ? t.why[tr.est.why as keyof typeof t.why] : undefined} />
                        </div>
                      ) : null}
                    </td>
                    <td className="r whitespace-nowrap">
                      <Pct v={chg} />
                      {spy != null && chg != null ? <div className="text-[11px] text-faint num">SPY {spy > 0 ? "+" : ""}{(spy * 100).toFixed(1)}%</div> : null}
                    </td>
                    <td className={`r num whitespace-nowrap ${late ? "text-warn font-medium" : "text-muted"}`}>
                      {tr.delay != null ? fmt(t.table.days, { n: tr.delay }) : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface-2">
                      <td colSpan={9} className="text-[13px]">
                        <Details tr={tr} locale={locale} now={now} spyNow={spyNow} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-muted py-8">
                  {fmt(t.common.results, { n: 0 })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <button className="input disabled:opacity-40" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            {t.common.prev}
          </button>
          <span className="text-muted">{fmt(t.common.page, { n: cur + 1, total: pages })}</span>
          <button className="input disabled:opacity-40" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
            {t.common.next}
          </button>
        </div>
      )}
    </div>
  );
}

function Details({ tr, locale, now, spyNow }: { tr: Trade; locale: Locale; now?: number; spyNow?: number }) {
  const t = dict(locale);
  const e = tr.est;
  const L = (href: string) => `/${locale}${href}`;
  return (
    <div className="grid gap-x-8 gap-y-1.5 py-1 sm:grid-cols-2">
      <Row k={t.table.owner} v={t.owners[tr.own]} />
      {tr.sub ? <Row k={t.trade.subholding} v={tr.sub} /> : null}
      {e?.d ? <Row k={t.trade.tradingDay} v={e.d} /> : null}
      {e?.lo != null ? <Row k={t.trade.priceRange} v={priceRange(e.lo, e.hi)} /> : null}
      {e?.smin != null ? <Row k={t.table.estShares} v={shareRange(e.smin, e.smax)} /> : null}
      {e ? (
        <Row
          k={t.table.conf}
          v={
            <>
              {t.conf[e.conf]}
              {e.why ? <span className="text-faint"> · {t.why[e.why as keyof typeof t.why] ?? e.why}</span> : null}
            </>
          }
        />
      ) : null}
      {tr.ent ? <Row k={t.table.officialSince} v={<Pct v={since(tr.ent.off, now)} />} /> : null}
      {tr.ent?.fol ? (
        <Row
          k={t.table.followSince}
          v={
            <>
              <Pct v={since(tr.ent.fol, now)} /> <span className="text-faint">({tr.ent.fold})</span> · SPY <Pct v={since(tr.ent.sfol, spyNow)} />
            </>
          }
        />
      ) : null}
      {tr.opt ? (
        <Row
          k={t.trade.option}
          v={[tr.opt.kind ? t.trade[tr.opt.kind as "call" | "put"] ?? tr.opt.kind : null, tr.opt.strike ? `${t.trade.strike} ${price(tr.opt.strike)}` : null, tr.opt.exp ? `${t.trade.expiry} ${tr.opt.exp}` : null]
            .filter(Boolean)
            .join(" · ")}
        />
      ) : null}
      {tr.amd ? <Row k={t.trade.amended} v={t.common.yes} /> : null}
      {tr.desc ? <div className="sm:col-span-2 text-muted"><span className="text-faint">{t.trade.description}: </span>{tr.desc}</div> : null}
      <div className="sm:col-span-2 flex gap-4 pt-1">
        <Link prefetch={false} className="link" href={L(`/trade/${tr.id}`)}>
          {t.trade.title} →
        </Link>
        <a className="link" href={tr.src} target="_blank" rel="noopener noreferrer">
          {t.common.viewSource} ↗
        </a>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-faint shrink-0">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}
