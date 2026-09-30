"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MemberRow } from "@/lib/data";
import { amountRange } from "@/lib/format";
import { dict, fmt, type Locale } from "@/lib/i18n";
import { PartyDot } from "./ui";

type SortKey = "lastf" | "n" | "vmax" | "late";

export default function MemberList({ locale, rows }: { locale: Locale; rows: MemberRow[] }) {
  const t = dict(locale);
  const [q, setQ] = useState("");
  const [chamber, setChamber] = useState("");
  const [party, setParty] = useState("");
  const [cur, setCur] = useState("1");
  const [sort, setSort] = useState<SortKey>("lastf");
  const [limit, setLimit] = useState(100);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = rows.filter(
      (m) =>
        (!chamber || m.chamber === chamber) &&
        (!party || m.party === party) &&
        (cur === "" || (cur === "1" ? m.current : !m.current)) &&
        (!n || `${m.name} ${m.zh ?? ""} ${m.state}`.toLowerCase().includes(n)),
    );
    const key = (m: MemberRow) => (sort === "lastf" ? m.lastf ?? "" : sort === "n" ? m.n : sort === "vmax" ? m.vmax : m.late);
    return out.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  }, [rows, q, chamber, party, cur, sort]);

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
        <select className="input" value={chamber} onChange={(e) => setChamber(e.target.value)} aria-label={t.filters.chamber}>
          <option value="">{t.filters.chamber}: {t.common.all}</option>
          <option value="H">{t.chamber.H}</option>
          <option value="S">{t.chamber.S}</option>
        </select>
        <select className="input" value={party} onChange={(e) => setParty(e.target.value)} aria-label={t.filters.party}>
          <option value="">{t.filters.party}: {t.common.all}</option>
          <option value="D">{t.party.D}</option>
          <option value="R">{t.party.R}</option>
          <option value="I">{t.party.I}</option>
        </select>
        <select className="input" value={cur} onChange={(e) => setCur(e.target.value)}>
          <option value="1">{t.common.current}</option>
          <option value="0">{t.common.former}</option>
          <option value="">{t.common.all}</option>
        </select>
        <span className="ml-auto text-xs text-muted">{fmt(t.common.results, { n: list.length })}</span>
      </div>
      <div className="card scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t.table.member}</th>
              <th>{t.table.chamber}</th>
              <th>{t.table.state}</th>
              {th("n", t.table.nTrades)}
              <th className="r">{t.table.buysSells}</th>
              {th("vmax", t.table.volume)}
              {th("lastf", t.table.lastFiled)}
              {th("late", t.table.late)}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((m) => (
              <tr key={m.id}>
                <td>
                  <Link prefetch={false} href={`/${locale}/member/${m.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                    <PartyDot party={m.party} />
                    <span className="font-medium">{locale === "zh" && m.zh ? m.zh : m.name}</span>
                  </Link>
                  {locale === "zh" && m.zh ? <div className="text-[11px] text-faint">{m.name}</div> : null}
                </td>
                <td className="whitespace-nowrap">{t.chamber[m.chamber]}</td>
                <td className="whitespace-nowrap">
                  {m.state}
                  {m.chamber === "H" && m.district != null ? `-${m.district || "AL"}` : ""}
                </td>
                <td className="r num">{m.n}</td>
                <td className="r num whitespace-nowrap">
                  <span className="text-pos">{m.nb}</span> / <span className="text-neg">{m.ns}</span>
                </td>
                <td className="r num whitespace-nowrap">{amountRange(m.vmin, m.vmax)}</td>
                <td className="r num whitespace-nowrap text-muted">{m.lastf ?? "—"}</td>
                <td className={`r num ${m.late ? "text-warn" : "text-faint"}`}>{m.late}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && (
        <div className="mt-3 text-center">
          <button className="input" onClick={() => setLimit(limit + 200)}>
            {t.common.more}
          </button>
        </div>
      )}
    </div>
  );
}
