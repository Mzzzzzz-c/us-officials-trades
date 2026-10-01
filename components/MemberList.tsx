"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MemberRow } from "@/lib/data";
import { amountRange } from "@/lib/format";
import { dict, fmt, type Locale } from "@/lib/i18n";
import { roleLabel } from "@/lib/labels";
import { Avatar } from "./media";

type SortKey = "lastf" | "n" | "vmax" | "cagr";

/** Officials as a grid of portrait cards, with Apple-style filter chips. */
export default function MemberList({ locale, rows, executive = false, photos }: { locale: Locale; rows: MemberRow[]; executive?: boolean; photos: Record<string, 1> }) {
  const t = dict(locale);
  const [q, setQ] = useState("");
  const [chamber, setChamber] = useState("");
  const [party, setParty] = useState("");
  const [cur, setCur] = useState(executive ? "" : "1");
  const [sort, setSort] = useState<SortKey>("lastf");
  const [limit, setLimit] = useState(48);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = rows.filter(
      (m) =>
        (!chamber || m.chamber === chamber) &&
        (!party || m.party === party) &&
        (cur === "" || (cur === "1" ? m.current : !m.current)) &&
        (!n || `${m.name} ${m.zh ?? ""} ${m.state} ${m.agency ?? ""} ${m.agency_zh ?? ""} ${m.title ?? ""}`.toLowerCase().includes(n)),
    );
    const key = (m: MemberRow): string | number => (sort === "lastf" ? m.lastf ?? "" : sort === "n" ? m.n : sort === "vmax" ? m.vmax : m.cagr ?? -9);
    const pin = (m: MemberRow) => (!executive || sort !== "lastf" ? 0 : m.title === "President" ? 2 : m.title === "Vice President" ? 1 : 0);
    return out.sort((a, b) => pin(b) - pin(a) || (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  }, [rows, q, chamber, party, cur, sort, executive]);

  const role = (m: MemberRow) =>
    m.chamber === "E"
      ? roleLabel(m, locale)
      : `${t.chamber[m.chamber]} · ${m.state}${m.chamber === "H" && m.district != null ? `-${m.district || (locale === "zh" ? "全州" : "AL")}` : ""}`;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-3">
        <input className="input w-full sm:max-w-md" placeholder={t.x.searchOfficials} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-1">
          {!executive &&
            [["", t.x.all], ["H", t.chamber.H], ["S", t.chamber.S]].map(([k, label]) => (
              <button key={`c${k}`} type="button" className="chip" aria-pressed={chamber === k} onClick={() => setChamber(k)}>
                {label}
              </button>
            ))}
          {!executive ? <span className="mx-1 h-5 w-px shrink-0 bg-line" /> : null}
          {[["", t.x.allParties], ["D", t.party.D], ["R", t.party.R], ["I", t.party.I]].map(([k, label]) => (
            <button key={`p${k}`} type="button" className="chip" aria-pressed={party === k} onClick={() => setParty(k)}>
              {k ? <span className={`h-2 w-2 rounded-full ${k === "D" ? "bg-dem" : k === "R" ? "bg-rep" : "bg-ind"}`} /> : null}
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          {[["1", t.x.current], ["0", t.common.former], ["", t.x.all]].map(([k, label]) => (
            <button key={`s${k}`} type="button" className="chip" aria-pressed={cur === k} onClick={() => setCur(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="seg">
            {(
              [
                ["lastf", t.x.sortRecent],
                ["n", t.x.sortTrades],
                ["vmax", t.x.sortVolume],
                ["cagr", t.x.sortReturn],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">{fmt(t.common.results, { n: list.length })}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {list.slice(0, limit).map((m) => (
          <Link key={m.id} prefetch={false} href={`/${locale}/member/${m.id}`} className="tile flex flex-col items-center px-4 pt-6 pb-4 text-center">
            <Avatar id={m.id} name={m.name} party={m.party} has={!!photos[m.id]} size={88} />
            <div className="mt-4 line-clamp-1 text-[16px] font-semibold tracking-tight">{locale === "zh" && m.zh ? m.zh : m.name}</div>
            {locale === "zh" && m.zh ? <div className="line-clamp-1 text-[11px] text-faint">{m.name}</div> : null}
            <div className="mt-1 line-clamp-2 min-h-[2.5em] text-xs leading-snug text-muted">{role(m)}</div>
            <div className="mt-4 grid w-full grid-cols-3 gap-1 border-t border-hair pt-3">
              <Mini label={t.x.trades} value={m.n.toLocaleString()} />
              <Mini
                label={`${t.x.buy}/${t.x.sell}`}
                value={
                  <>
                    <span className="text-pos">{m.nb}</span>/<span className="text-neg">{m.ns}</span>
                  </>
                }
              />
              <Mini
                label={t.x.copyCagr}
                value={
                  m.cagr != null ? (
                    <span className={m.cagr >= 0 ? "text-pos" : "text-neg"}>{`${m.cagr >= 0 ? "+" : ""}${(m.cagr * 100).toFixed(0)}%`}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )
                }
              />
            </div>
            <div className="mt-2 flex w-full items-center justify-between text-[11px] text-faint">
              <span className="num">{amountRange(m.vmin, m.vmax)}</span>
              {m.ov ? <span className="rounded-full bg-warn-soft px-1.5 py-0.5 font-semibold text-warn">{t.x.oversightFlag} {m.ov}</span> : <span className="num">{m.lastf ?? ""}</span>}
            </div>
          </Link>
        ))}
      </div>
      {list.length > limit && (
        <div className="mt-10 text-center">
          <button className="btn btn-quiet" onClick={() => setLimit(limit + 48)}>
            {t.common.more}
          </button>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="num text-[14px] font-semibold">{value}</div>
      <div className="truncate text-[10px] text-faint">{label}</div>
    </div>
  );
}
