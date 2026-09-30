"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TickerRow } from "@/lib/data";
import { dict, fmt, type Locale } from "@/lib/i18n";

type SortKey = "n" | "nm" | "last" | "inv";

export default function TickerList({ locale, rows }: { locale: Locale; rows: TickerRow[] }) {
  const t = dict(locale);
  const [q, setQ] = useState("");
  const [sec, setSec] = useState("");
  const [sort, setSort] = useState<SortKey>("n");
  const [limit, setLimit] = useState(150);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = rows.filter((r) => (!sec || r.sec === sec) && (!n || r.sym.toLowerCase().startsWith(n) || r.name.toLowerCase().includes(n) || (r.zh ?? "").includes(n)));
    const key = (r: TickerRow) => (sort === "last" ? r.last ?? "" : r[sort] ?? 0);
    return out.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : a.sym < b.sym ? -1 : 1));
  }, [rows, q, sec, sort]);
  const th = (k: SortKey, label: string) => (
    <th className="r">
      <button className={`hover:text-ink ${sort === k ? "text-ink font-semibold" : ""}`} onClick={() => setSort(k)}>
        {label}
        {sort === k ? " ↓" : ""}
      </button>
    </th>
  );
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <input className="input w-56" placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={sec} onChange={(e) => setSec(e.target.value)} aria-label={t.table.sector}>
          <option value="">{t.table.sector}: {t.common.all}</option>
          {Object.entries(t.sectors).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted">{fmt(t.common.results, { n: list.length })}</span>
      </div>
      <div className="card scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t.table.ticker}</th>
              <th>{t.table.name}</th>
              <th>{t.table.sector}</th>
              {th("n", t.table.nTrades)}
              {th("nm", t.table.nMembers)}
              <th className="r">{t.table.buysSells}</th>
              {th("last", t.table.lastTrade)}
              {th("inv", t.table.investorsHolding)}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((r) => (
              <tr key={r.sym}>
                <td>
                  <Link prefetch={false} href={`/${locale}/ticker/${r.sym}`} className="font-semibold link">
                    {r.sym}
                  </Link>
                </td>
                <td className="max-w-72 truncate" title={r.name}>{locale === "zh" && r.zh ? r.zh : r.name}</td>
                <td className="whitespace-nowrap text-muted">{t.sectors[r.sec as keyof typeof t.sectors] ?? r.sec}</td>
                <td className="r num">{r.n}</td>
                <td className="r num">{r.nm}</td>
                <td className="r num whitespace-nowrap">
                  <span className="text-pos">{r.nb}</span> / <span className="text-neg">{r.ns}</span>
                </td>
                <td className="r num text-muted whitespace-nowrap">{r.last ?? "—"}</td>
                <td className="r num">{r.inv || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && (
        <div className="mt-3 text-center">
          <button className="input" onClick={() => setLimit(limit + 300)}>
            {t.common.more}
          </button>
        </div>
      )}
    </div>
  );
}
