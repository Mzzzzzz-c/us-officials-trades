import "server-only";
import type { SignalItem } from "@/components/client/SignalBoard";
import type { Insights, TradeCard } from "./data";
import { amountRange } from "./format";
import { dict, fmt, type Locale } from "./i18n";
import { person, stock } from "./people";

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

function item(c: TradeCard, locale: Locale): SignalItem | null {
  if (!c.sym) return null;
  const t = dict(locale);
  const act = c.act && t.acts[c.act as keyof typeof t.acts] ? t.acts[c.act as keyof typeof t.acts] : t.types[c.type as keyof typeof t.types] ?? c.type;
  const flags: string[] = [];
  if (c.ov) flags.push(t.x.oversightFlag);
  if (c.cl) flags.push(t.x.sigCluster);
  return {
    id: c.id,
    href: `/${locale}/trade/${c.id}`,
    person: person(c.m, locale),
    stock: stock(c.sym, locale),
    act,
    buy: c.type === "P",
    amount: amountRange(c.amin, c.amax),
    fil: c.fil,
    fol: c.fol,
    rec: c.rec ? fmt(t.x.recShort, { n: c.rec[0], x: pct(c.rec[1]), w: `${Math.round(c.rec[2] * 100)}%` }) : undefined,
    flags,
  };
}

/** The four kinds of fresh buys shown on the home and insights pages. */
export function signalGroups(ins: Insights | null, locale: Locale): { key: string; label: string; items: SignalItem[] }[] {
  const sg = ins?.signals;
  if (!sg) return [];
  const t = dict(locale);
  const make = (cards: TradeCard[]) => cards.map((c) => item(c, locale)).filter((x): x is SignalItem => !!x);
  return [
    { key: "proven", label: t.x.sigProven, items: make(sg.proven) },
    { key: "cluster", label: t.x.sigCluster, items: make(sg.cluster) },
    { key: "big", label: t.x.sigBig, items: make(sg.big) },
    { key: "ov", label: t.x.sigOv, items: make(sg.ov) },
  ];
}
