import "server-only";
// Builds the items of the interactive timeline (components/client/Timeline) from the three kinds of
// trades on the site: officials' disclosed trades, company insiders' Form 4 trades and the quarterly
// changes in famous investors' 13F holdings. Text is formatted here so the client only draws.
import type { TLItem, TLLabels } from "@/components/client/Timeline";
import { getMedia, insiderLabel, insiderTitle, tickerName, type InsiderFile, type InvestorPage, type Trade } from "./data";
import { amountRange, price, quarterLabel, shareRange, shares, usdShort } from "./format";
import { dict, fmt, type Locale } from "./i18n";
import { person } from "./people";

const SELLS = new Set(["SF", "SP", "S"]);
const mid = (lo?: number | null, hi?: number | null) => (lo == null ? 0 : hi == null ? lo * 1.5 : (lo + hi) / 2);

export function tlLabels(locale: Locale): TLLabels {
  const t = dict(locale);
  const { other, all, allStocks, trades, ranges, zoomIn, zoomOut, prev, next, hint, pick, details, person, stock, source, future, today, events, price, empty, more } = t.tl;
  return { buy: t.x.buy, sell: t.x.sell, other, all, allStocks, trades, ranges, zoomIn, zoomOut, prev, next, hint, pick, details, person, stock, source, future, today, events, price, empty, more };
}

/** Officials' trades. On a person's page the stock is the headline; on a stock page the person is. */
export function officialItems(trades: Trade[], locale: Locale, mode: "person" | "stock", lane = 0): TLItem[] {
  const t = dict(locale);
  const logos = getMedia().logos;
  const out: TLItem[] = [];
  for (const tr of trades) {
    if (!tr.tx) continue;
    const side = tr.type === "P" ? "b" : SELLS.has(tr.type) ? "s" : "x";
    const who = mode === "stock" ? person(tr.m, locale) : null;
    const rows: [string, string][] = [];
    if (tr.est?.smin != null || tr.est?.smid != null) rows.push([t.tl.shares, tr.est.sh_rep && tr.est.smid != null ? shares(tr.est.smid) : `≈ ${shareRange(tr.est.smin, tr.est.smax)}`]);
    if (tr.est?.p) rows.push([t.tl.price2, `${tr.est.conf === "reported" ? "" : "≈ "}${price(tr.est.p)}`]);
    rows.push([t.tl.type, t.types[tr.type]]);
    rows.push([t.tl.owner, t.owners[tr.own]]);
    if (tr.fil) rows.push([t.tl.filed, tr.fil]);
    if (tr.delay != null) rows.push([t.tl.delay, fmt(t.table.days, { n: tr.delay })]);
    const tags: string[] = [];
    if (tr.opt) tags.push(`${t.tl.option}${tr.opt.kind ? ` · ${tr.opt.kind}` : ""}${tr.opt.strike ? ` $${tr.opt.strike}` : ""}${tr.opt.exp ? ` · ${tr.opt.exp}` : ""}`);
    if (tr.ov) tags.push(t.x.oversightFlag);
    if (tr.amd) tags.push(t.tl.amended);
    const stockName = tr.sym ? `${tr.sym} ${tickerName(tr.sym, locale) ?? ""}`.trim() : (tr.asset ?? "—");
    out.push({
      id: tr.id,
      d: tr.tx,
      side,
      lane,
      sym: tr.sym ?? undefined,
      title: who ? who.name : stockName,
      sub: who ? who.role : tr.sym ? tr.asset : undefined,
      amount: amountRange(tr.amin, tr.amax),
      v: mid(tr.amin, tr.amax),
      rows,
      tags,
      href: `/${locale}/trade/${encodeURIComponent(tr.id)}`,
      link: who ? `/${locale}/member/${tr.m}` : tr.sym ? `/${locale}/ticker/${encodeURIComponent(tr.sym)}` : undefined,
      src: tr.src,
      avatar: who ? { id: who.id, name: who.en, party: who.party, has: who.has } : undefined,
      logo: !who && tr.sym ? { sym: tr.sym, kind: logos[tr.sym] } : undefined,
    });
  }
  return out;
}

/** Company insiders' open-market trades (exact shares and prices from Form 4). */
export function insiderItems(tx: InsiderFile["tx"], sym: string, cik: number, locale: Locale, mode: "person" | "stock", lane = 0): TLItem[] {
  const t = dict(locale);
  const i = t.insider;
  const logos = getMedia().logos;
  const photos = getMedia().people;
  return tx.map((r, k) => {
    const role = insiderTitle(r[4]) || [...r[3]].map((c) => i.rel[c as keyof typeof i.rel] ?? "").filter(Boolean).join(" · ");
    const name = insiderLabel(r[11], r[2], locale);
    return {
      id: `i-${sym}-${r[10]}-${k}`,
      d: r[0],
      side: r[5] === "P" ? "b" : "s",
      lane,
      sym,
      title: mode === "stock" ? name : `${sym} ${tickerName(sym, locale) ?? ""}`.trim(),
      sub: role,
      amount: usdShort(r[8]),
      v: r[8],
      rows: [
        [t.tl.shares, r[6].toLocaleString("en-US")],
        [t.tl.price2, `$${r[7].toFixed(2)}`],
        [t.tl.filed, r[1]],
        [t.tl.type, r[5] === "P" ? i.openBuy : i.openSell],
      ],
      tags: r[9] ? [i.plan] : [],
      link: mode === "stock" ? (r[11] ? `/${locale}/insider/${r[11]}` : undefined) : `/${locale}/ticker/${encodeURIComponent(sym)}`,
      src: `https://www.sec.gov/Archives/edgar/data/${cik}/${r[10].replace(/-/g, "")}/`,
      avatar: mode === "stock" ? { id: `ins-${r[11] ?? 0}`, name: insiderLabel(r[11], r[2], "en"), has: !!photos[`ins-${r[11] ?? 0}`] } : undefined,
      logo: mode === "person" ? { sym, kind: logos[sym] } : undefined,
    } satisfies TLItem;
  });
}

/** A famous investor's quarter-to-quarter changes, dated at the end of the quarter they happened in. */
export function investorItems(activity: InvestorPage["activity"], locale: Locale): TLItem[] {
  const t = dict(locale);
  const logos = getMedia().logos;
  const out: TLItem[] = [];
  for (const a of activity) {
    a.items.forEach((h, k) => {
      if (!h.chg || h.chg === "same") return;
      const buy = h.chg === "new" || h.chg === "add";
      const rows: [string, string][] = [[t.tl.type, t.chg[h.chg]]];
      if (h.dsh) rows.push([t.tl.shareChange, `${h.dsh > 0 ? "+" : "−"}${shares(Math.abs(h.dsh))}`]);
      if (h.sh) rows.push([t.tl.sharesHeld, shares(h.sh)]);
      if (h.cost?.p) rows.push([t.tl.quarterPrice, `≈ ${price(h.cost.p)}`]);
      rows.push([t.tl.quarter, quarterLabel(a.period, locale)], [t.tl.filed, a.filed]);
      // dollars that moved: the share change at the quarter's typical price, else the position's value
      const v = h.dsh && h.cost?.p ? Math.abs(h.dsh) * h.cost.p : h.val;
      out.push({
        id: `q-${a.period}-${h.cusip}-${k}`,
        d: a.period,
        side: buy ? "b" : "s",
        sym: h.sym,
        title: h.sym ? `${h.sym} ${tickerName(h.sym, locale) ?? h.name}`.trim() : h.name,
        sub: h.sym ? h.name : undefined,
        amount: `≈ ${usdShort(v)}`,
        v,
        rows,
        link: h.sym ? `/${locale}/ticker/${encodeURIComponent(h.sym)}` : undefined,
        src: a.url,
        logo: h.sym ? { sym: h.sym, kind: logos[h.sym] } : undefined,
      });
    });
  }
  return out;
}

/** Stocks to offer as filters on a person's timeline, most traded first. */
export function stockChips(items: TLItem[], locale: Locale): { sym: string; n: number; name?: string }[] {
  const n = new Map<string, number>();
  for (const it of items) if (it.sym) n.set(it.sym, (n.get(it.sym) ?? 0) + 1);
  return Array.from(n.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sym, k]) => ({ sym, n: k, name: tickerName(sym, locale) }));
}
