"use client";

import { useMemo, useState } from "react";
import type { LabRow } from "@/lib/data";
import LineChart from "./LineChart";

const GROUPS: string[][] = [
  ["h30", "h90", "h180", "h365"],
  ["big", "huge"],
  ["proven", "cluster", "ov", "fast"],
  ["senate", "house", "dem", "rep", "exec"],
];

const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);

interface Labels {
  rules: Record<string, string>;
  notes: Record<string, string>;
  groups: string[];
  rule: string;
  cagr: string;
  spy: string;
  hit: string;
  x: string;
  n: string;
  copy: string;
  best: string;
  range: Record<string, string>;
  total: string;
  mdd: string;
}

/** Pick a copy rule, see its record: a table on one side, the chosen rule's curve on the other. */
export default function StrategyLab({ rows, labels }: { rows: LabRow[]; labels: Labels }) {
  const by = useMemo(() => Object.fromEntries(rows.map((r) => [r.k, r])), [rows]);
  // the rule that beat its own benchmark by the widest margin
  const best = useMemo(() => {
    let top: LabRow | null = null;
    for (const r of rows) {
      if (r.cagr == null || r.bcagr == null) continue;
      if (!top || r.cagr - r.bcagr > (top.cagr ?? 0) - (top.bcagr ?? 0)) top = r;
    }
    return top?.k;
  }, [rows]);
  const [sel, setSel] = useState<string>(best ?? rows[0]?.k);
  const cur = by[sel] ?? rows[0];
  if (!cur) return null;
  const excess = (r: LabRow) => (r.cagr != null && r.bcagr != null ? r.cagr - r.bcagr : r.total - r.bench);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="card overflow-hidden lg:col-span-3">
        <div className="scroll-x">
          <table className="tbl lab-table">
            <thead>
              <tr>
                <th>{labels.rule}</th>
                <th className="r">{labels.cagr}</th>
                <th className="r">{labels.spy}</th>
                <th className="r hidden sm:table-cell">{labels.x}</th>
                <th className="r hidden sm:table-cell">{labels.n}</th>
              </tr>
            </thead>
            {GROUPS.map((g, gi) => {
              const items = g.map((k) => by[k]).filter(Boolean) as LabRow[];
              if (!items.length) return null;
              return (
                <tbody key={gi}>
                  <tr className="lab-group">
                    <td colSpan={5}>{labels.groups[gi]}</td>
                  </tr>
                  {items.map((r) => {
                    const on = r.k === sel;
                    const ex = excess(r);
                    return (
                      <tr
                        key={r.k}
                        className={`lab-row ${on ? "on" : ""}`}
                        tabIndex={0}
                        aria-selected={on}
                        onClick={() => setSel(r.k)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSel(r.k);
                          }
                        }}
                      >
                        <td>
                          <div className="flex items-center gap-2 font-medium whitespace-nowrap">
                            {labels.rules[r.k] ?? r.k}
                            {r.k === best ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{labels.best}</span> : null}
                          </div>
                        </td>
                        <td className={`r num font-semibold ${ex > 0 ? "text-pos" : ex < 0 ? "text-neg" : ""}`}>{pct(r.cagr ?? r.total)}</td>
                        <td className="r num text-muted">{pct(r.bcagr ?? r.bench)}</td>
                        <td className={`r num hidden sm:table-cell ${(r.x ?? 0) > 0 ? "text-pos" : (r.x ?? 0) < 0 ? "text-neg" : ""}`}>{pct(r.x)}</td>
                        <td className="r num hidden text-muted sm:table-cell">{r.n.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
      <div className="lg:col-span-2">
        <div className="card sticky top-16 p-5">
          <div className="text-[13px] text-muted">{labels.rules[cur.k] ?? cur.k}</div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <div className={`text-[34px] font-semibold tracking-tight ${excess(cur) >= 0 ? "text-pos" : "text-neg"}`}>{pct(cur.cagr ?? cur.total)}</div>
              <div className="text-xs text-muted">
                {labels.copy} · {cur.cagr != null ? labels.cagr : labels.total}
              </div>
            </div>
            <div>
              <div className="text-[34px] font-semibold tracking-tight">{pct(cur.bcagr ?? cur.bench)}</div>
              <div className="text-xs text-muted">
                {labels.spy} · {cur.bcagr != null ? labels.cagr : labels.total}
              </div>
            </div>
          </div>
          {labels.notes[cur.k] ? <p className="mt-3 text-[13px] leading-relaxed text-muted">{labels.notes[cur.k]}</p> : null}
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-hair pt-4 text-center">
            <div>
              <dt className="text-[11px] text-muted">{labels.hit}</dt>
              <dd className="num mt-0.5 text-[17px] font-semibold">{cur.hit != null ? `${Math.round(cur.hit * 100)}%` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">{labels.mdd}</dt>
              <dd className="num mt-0.5 text-[17px] font-semibold">{pct(cur.mdd, 0)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">{labels.n}</dt>
              <dd className="num mt-0.5 text-[17px] font-semibold">{cur.n.toLocaleString()}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <LineChart
              key={cur.k}
              compact
              height={220}
              rangeLabels={labels.range}
              series={[
                { label: labels.copy, color: "var(--chart-1)", pts: cur.pts.map((p) => [p[0], p[1]]) },
                { label: labels.spy, color: "var(--chart-2)", pts: cur.pts.map((p) => [p[0], p[2]]) },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
