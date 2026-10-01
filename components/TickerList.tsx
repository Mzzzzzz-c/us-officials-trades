"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TickerRow } from "@/lib/data";
import { dict, fmt, type Locale } from "@/lib/i18n";
import { LiveChange, LivePrice } from "./client/Quotes";
import { Logo } from "./media";

type SortKey = "n" | "nm" | "last" | "inv";

export default function TickerList({
  locale,
  rows,
  logos,
  px,
  pc,
}: {
  locale: Locale;
  rows: TickerRow[];
  logos: Record<string, 1 | 2 | 3>;
  px: Record<string, number>;
  pc: Record<string, number>;
}) {
  const t = dict(locale);
  const [q, setQ] = useState("");
  const [sec, setSec] = useState("");
  const [sort, setSort] = useState<SortKey>("n");
  const [limit, setLimit] = useState(60);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = rows.filter((r) => (!sec || r.sec === sec) && (!n || r.sym.toLowerCase().startsWith(n) || r.name.toLowerCase().includes(n) || (r.zh ?? "").includes(n)));
    const key = (r: TickerRow) => (sort === "last" ? r.last ?? "" : r[sort] ?? 0);
    return out.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : a.sym < b.sym ? -1 : 1));
  }, [rows, q, sec, sort]);
  const sorts: [SortKey, string][] = [
    ["n", t.table.nTrades],
    ["nm", t.table.nMembers],
    ["last", t.table.lastTrade],
    ["inv", t.table.investorsHolding],
  ];
  return (
    <div>
      <div className="mb-8 flex flex-col gap-3">
        <input className="input w-full sm:max-w-md" placeholder={t.x.stockSearch} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          <button type="button" className="chip" aria-pressed={sec === ""} onClick={() => setSec("")}>
            {t.x.all}
          </button>
          {Object.entries(t.sectors).map(([k, v]) => (
            <button key={k} type="button" className="chip" aria-pressed={sec === k} onClick={() => setSec(k)}>
              {v}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="seg">
            {sorts.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">{fmt(t.common.results, { n: list.length })}</span>
        </div>
      </div>
      <div className="card divide-y divide-hair overflow-hidden">
        {list.slice(0, limit).map((r) => (
          <Link key={r.sym} prefetch={false} href={`/${locale}/ticker/${r.sym}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
            <Logo sym={r.sym} kind={logos[r.sym]} size={40} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{r.sym}</div>
              <div className="truncate text-xs text-muted">{locale === "zh" && r.zh ? r.zh : r.name}</div>
            </div>
            <div className="hidden w-28 text-xs text-muted md:block">{t.sectors[r.sec as keyof typeof t.sectors] ?? r.sec}</div>
            <div className="hidden w-32 text-right sm:block">
              <div className="num text-sm">
                <span className="font-semibold">{r.n}</span> <span className="text-xs text-faint">{t.x.trades}</span>
              </div>
              <div className="num text-xs">
                <span className="text-pos">{r.nb}</span> / <span className="text-neg">{r.ns}</span> · {fmt(t.x.nOfficials, { n: r.nm })}
              </div>
            </div>
            <div className="w-20 text-right">
              <LivePrice sym={r.sym} fallback={px[r.sym]} fallbackPrev={pc[r.sym]} showChange={false} />
            </div>
            <div className="w-[70px] text-right">
              <LiveChange sym={r.sym} fallback={px[r.sym]} fallbackPrev={pc[r.sym]} />
            </div>
          </Link>
        ))}
      </div>
      {list.length > limit && (
        <div className="mt-10 text-center">
          <button className="btn btn-quiet" onClick={() => setLimit(limit + 60)}>
            {t.common.more}
          </button>
        </div>
      )}
    </div>
  );
}
