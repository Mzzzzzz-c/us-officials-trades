// Small static charts (server-rendered SVG/HTML): no client JavaScript needed.

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

/** Monthly buys (up) and sells (down), one column pair per month. */
export function MonthlyBars({ rows, buyLabel, sellLabel, height = 220 }: { rows: [string, number, number, number, number][]; buyLabel: string; sellLabel: string; height?: number }) {
  if (!rows.length) return null;
  const W = 1000;
  const mid = height * 0.58;
  const max = Math.max(...rows.map((r) => Math.max(r[1], r[2] * 0.72)), 1);
  const bw = W / rows.length;
  const up = (v: number) => (v / max) * (mid - 14);
  const years = rows.map((r, i) => ({ i, y: r[0].slice(0, 4), m: r[0].slice(5) })).filter((x) => x.m === "01");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" preserveAspectRatio="none">
      {rows.map((r, i) => (
        <g key={r[0]}>
          <title>{`${r[0]} · ${buyLabel} ${r[1]} · ${sellLabel} ${r[2]}`}</title>
          <rect x={i * bw + bw * 0.12} y={mid - up(r[1])} width={bw * 0.76} height={up(r[1])} rx={Math.min(3, bw * 0.3)} fill="var(--pos)" opacity="0.9" />
          <rect x={i * bw + bw * 0.12} y={mid + 1} width={bw * 0.76} height={up(r[2])} rx={Math.min(3, bw * 0.3)} fill="var(--neg)" opacity="0.75" />
        </g>
      ))}
      <line x1="0" x2={W} y1={mid + 0.5} y2={mid + 0.5} stroke="var(--hair)" />
      {years.map((y) => (
        <text key={y.y} x={y.i * bw} y={height - 4} fontSize="12" fill="var(--faint)">
          {y.y}
        </text>
      ))}
    </svg>
  );
}

/** Strategy vs benchmark, one pair of bars per year. */
export function YearBars({ years, sLabel, bLabel }: { years: { y: string; s: number; b: number }[]; sLabel: string; bLabel: string }) {
  if (!years.length) return null;
  const max = Math.max(...years.flatMap((y) => [Math.abs(y.s), Math.abs(y.b)]), 0.05);
  return (
    <div className="space-y-3">
      {years.map((y) => (
        <div key={y.y} className="grid grid-cols-[44px_1fr] items-center gap-3">
          <div className="num text-sm text-muted">{y.y}</div>
          <div className="space-y-1">
            {[
              [y.s, "var(--chart-1)", sLabel],
              [y.b, "var(--chart-2)", bLabel],
            ].map(([v, color, label]) => (
              <div key={String(label)} className="flex items-center gap-2" title={`${label} ${pct(v as number)}`}>
                <div className="relative h-2.5 flex-1">
                  <div className="absolute top-0 left-1/2 h-full w-px bg-line" />
                  <div
                    className="absolute top-0 h-full rounded-full"
                    style={{
                      background: color as string,
                      width: `${(Math.abs(v as number) / max) * 50}%`,
                      left: (v as number) >= 0 ? "50%" : `${50 - (Math.abs(v as number) / max) * 50}%`,
                    }}
                  />
                </div>
                <span className={`num w-14 text-right text-xs ${(v as number) >= 0 ? "text-pos" : "text-neg"}`}>{pct(v as number)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Buy vs sell dollars per row, with the net figure. */
export function FlowBars({
  rows,
  labelOf,
  buyLabel,
  sellLabel,
}: {
  rows: { sec: string; buy: number; sell: number }[];
  labelOf: (s: string) => string;
  buyLabel: string;
  sellLabel: string;
}) {
  const max = Math.max(...rows.map((r) => Math.max(r.buy, r.sell)), 1);
  const short = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`);
  return (
    <div className="space-y-3.5">
      {rows.map((r) => {
        const net = r.buy - r.sell;
        return (
          <div key={r.sec} className="grid grid-cols-[92px_1fr_72px] items-center gap-3 sm:grid-cols-[120px_1fr_84px]">
            <div className="truncate text-sm">{labelOf(r.sec)}</div>
            <div className="flex h-5 items-center">
              <div className="flex h-full w-1/2 justify-end">
                <div className="h-full rounded-l-md bg-neg/80" style={{ width: `${(r.sell / max) * 100}%` }} title={`${sellLabel} ${short(r.sell)}`} />
              </div>
              <div className="h-7 w-px bg-line" />
              <div className="h-full w-1/2">
                <div className="h-full rounded-r-md bg-pos/85" style={{ width: `${(r.buy / max) * 100}%` }} title={`${buyLabel} ${short(r.buy)}`} />
              </div>
            </div>
            <div className={`num text-right text-sm font-semibold ${net >= 0 ? "text-pos" : "text-neg"}`}>
              {net >= 0 ? "+" : "−"}
              {short(Math.abs(net))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Simple vertical histogram. */
export function Histogram({ bins, highlightFrom }: { bins: { label: string; n: number }[]; highlightFrom?: number }) {
  const max = Math.max(...bins.map((b) => b.n), 1);
  return (
    <div className="flex h-48 items-end gap-2">
      {bins.map((b, i) => (
        <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <div className="num text-xs text-muted">{b.n.toLocaleString()}</div>
          <div
            className={`w-full rounded-t-lg ${highlightFrom != null && i >= highlightFrom ? "bg-warn" : "bg-accent"}`}
            style={{ height: `${Math.max(2, (b.n / max) * 78)}%`, opacity: highlightFrom != null && i >= highlightFrom ? 0.85 : 0.9 }}
          />
          <div className="text-center text-[11px] leading-tight text-faint">{b.label}</div>
        </div>
      ))}
    </div>
  );
}
