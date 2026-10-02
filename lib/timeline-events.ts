import "server-only";
// Everything dated that is worth seeing next to trades on a timeline: earnings releases (past and
// upcoming), the company's own major announcements, antitrust and subsidy actions that name it,
// sector-wide federal policy, and the macro calendar (Fed decisions, CPI, jobs, GDP).
import type { TLEvent } from "@/components/client/Timeline";
import { getEvents, type InsiderFile } from "./data";
import { POLICY_EVENTS } from "./events";
import { dict, fmt, type Locale } from "./i18n";

const MACRO_SINCE = "2023-01-01";

export function macroEvents(locale: Locale, since = MACRO_SINCE): TLEvent[] {
  const e = dict(locale).tl.ev;
  const m = getEvents().macro;
  const out: TLEvent[] = [];
  const pct = (x: number) => x.toFixed(2);
  for (const f of m.fomc ?? []) {
    if (f.d < since) continue;
    const v = { lo: pct(f.lo), hi: pct(f.hi), bp: Math.abs(f.chg) };
    out.push({ d: f.d, k: "m", label: fmt(f.chg > 0 ? e.fomcHike : f.chg < 0 ? e.fomcCut : e.fomcHold, v), sub: e.macroSub, href: f.src });
  }
  for (const d of m.fomc_future ?? []) out.push({ d, k: "m", label: e.fomcNext, sub: e.scheduled, href: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" });
  for (const d of m.cpi ?? []) if (d >= since) out.push({ d, k: "m", label: e.cpi, sub: e.macroSub, href: "https://www.bls.gov/schedule/news_release/cpi.htm" });
  for (const d of m.jobs ?? []) if (d >= since) out.push({ d, k: "m", label: e.jobs, sub: e.macroSub, href: "https://www.bls.gov/schedule/news_release/empsit.htm" });
  for (const d of m.gdp ?? []) if (d >= since) out.push({ d, k: "m", label: e.gdp, sub: e.macroSub, href: "https://www.bea.gov/news/schedule" });
  return out;
}

/** Events for one stock. `macro: false` leaves the market-wide calendar out (a person's page). */
export function stockEvents(sym: string, sector: string | undefined, ins: InsiderFile | null, locale: Locale, macro = true): TLEvent[] {
  const t = dict(locale);
  const e = t.tl.ev;
  const out: TLEvent[] = [];
  for (const d of ins?.earn ?? []) out.push({ d, k: "e", label: fmt(e.earnings, { sym }), sub: e.earningsSub });
  if (ins?.next) {
    const [d, when, how] = ins.next;
    out.push({ d, k: "f", label: fmt(e.next, { sym }), sub: how === "cal" ? fmt(e.nextCal, { when: when === "pre" ? e.pre : when === "post" ? e.post : "" }) : e.nextEst });
  }
  for (const [d, items, acc] of ins?.ev ?? []) {
    const names = items.split(",").map((i) => e.items[i as keyof typeof e.items]).filter(Boolean);
    if (!names.length) continue;
    out.push({ d, k: "n", label: names.join(locale === "zh" ? "；" : "; "), sub: e.k8, href: `https://www.sec.gov/Archives/edgar/data/${ins!.cik}/${acc.replace(/-/g, "")}/` });
  }
  for (const c of getEvents().company) {
    if (!c.syms.includes(sym)) continue;
    out.push({ d: c.d, k: "p", label: locale === "zh" ? c.zh : c.en, sub: e.kinds[c.kind], href: c.src });
  }
  for (const p of POLICY_EVENTS) {
    if (p.sectors && !(sector && p.sectors.includes(sector))) continue;
    out.push({ d: p.d, k: "p", label: locale === "zh" ? p.zh : p.en, sub: e.sector });
  }
  if (macro) out.push(...macroEvents(locale));
  return out.sort((a, b) => (a.d < b.d ? -1 : 1));
}
