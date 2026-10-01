"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface LineSeries {
  label: string;
  color: string;
  pts: [string, number][]; // date, growth of $1
  dashed?: boolean;
}

const RANGES = [
  { k: "1y", days: 365 },
  { k: "3y", days: 365 * 3 },
  { k: "all", days: 0 },
];

/** Growth-of-$1 curves with a hover crosshair; values are rebased to the start of the chosen window. */
export default function LineChart({
  series,
  height = 320,
  rangeLabels,
  defaultRange = "all",
  compact = false,
}: {
  series: LineSeries[];
  height?: number;
  rangeLabels?: Record<string, string>;
  defaultRange?: string;
  compact?: boolean;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(720);
  const [range, setRange] = useState(defaultRange);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const last = series[0]?.pts.at(-1)?.[0];
    const days = RANGES.find((r) => r.k === range)?.days ?? 0;
    const cut = last && days ? new Date(new Date(last).getTime() - days * 864e5).toISOString().slice(0, 10) : "";
    return series.map((s) => {
      const pts = s.pts.filter((p) => p[0] >= cut);
      const base = pts[0]?.[1] || 1;
      return { ...s, pts: pts.map((p) => [p[0], p[1] / base] as [string, number]) };
    });
  }, [series, range]);

  const pad = { l: compact ? 4 : 8, r: compact ? 4 : 52, t: 12, b: compact ? 8 : 28 };
  const all = data.flatMap((s) => s.pts.map((p) => p[1]));
  const lo = Math.min(...all, 1);
  const hi = Math.max(...all, 1);
  const span = hi - lo || 1;
  const n = Math.max(...data.map((s) => s.pts.length), 2);
  const X = (i: number) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / span) * (height - pad.t - pad.b);
  const path = (pts: [string, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");

  // y ticks at "nice" percentage steps
  const ticks: number[] = [];
  if (!compact) {
    const raw = span / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  }
  const first = data[0];
  const years: { i: number; y: string }[] = [];
  if (first && !compact) {
    let prev = "";
    first.pts.forEach((p, i) => {
      const y = p[0].slice(0, 4);
      if (y !== prev) {
        if (prev) years.push({ i, y });
        prev = y;
      }
    });
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const pctTxt = (v: number) => `${v >= 1 ? "+" : ""}${((v - 1) * 100).toFixed(1)}%`;
  const hx = hover != null ? X(hover) : null;

  return (
    <div>
      {rangeLabels ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4">
            {data.map((s) => {
              const v = hover != null ? s.pts[Math.min(hover, s.pts.length - 1)]?.[1] : s.pts.at(-1)?.[1];
              return (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-sm text-muted">{s.label}</span>
                  <span className="num text-sm font-semibold" style={{ color: s.color }}>
                    {v != null ? pctTxt(v) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="seg">
            {RANGES.map((r) => (
              <button key={r.k} type="button" aria-pressed={range === r.k} onClick={() => setRange(r.k)}>
                {rangeLabels[r.k] ?? r.k}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div ref={box} className="relative w-full select-none" style={{ height }}>
        <svg width={w} height={height} className="block touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img">
          <defs>
            <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={first?.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={first?.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--hair)" strokeDasharray={Math.abs(v - 1) < 1e-9 ? "" : "3 4"} />
              <text x={w - pad.r + 8} y={Y(v) + 4} fontSize="11" fill="var(--faint)" className="num">
                {pctTxt(v)}
              </text>
            </g>
          ))}
          {years.map((y) => (
            <text key={y.y} x={X(y.i)} y={height - 8} fontSize="11" fill="var(--faint)" textAnchor="middle">
              {y.y}
            </text>
          ))}
          {first && first.pts.length > 1 ? <path d={`${path(first.pts)}L${X(first.pts.length - 1)},${height - pad.b}L${pad.l},${height - pad.b}Z`} fill="url(#lc-fill)" /> : null}
          {[...data].reverse().map((s) => (
            <path key={s.label} d={path(s.pts)} fill="none" stroke={s.color} strokeWidth={s === first ? 2.25 : 1.75} strokeDasharray={s.dashed ? "5 5" : undefined} strokeLinejoin="round" />
          ))}
          {hx != null ? (
            <g>
              <line x1={hx} x2={hx} y1={pad.t} y2={height - pad.b} stroke="var(--faint)" strokeWidth="1" />
              {data.map((s) => {
                const p = s.pts[Math.min(hover!, s.pts.length - 1)];
                return p ? <circle key={s.label} cx={hx} cy={Y(p[1])} r="4" fill="var(--bg-elev)" stroke={s.color} strokeWidth="2" /> : null;
              })}
            </g>
          ) : null}
        </svg>
        {hover != null && first?.pts[hover] ? (
          <div
            className="pointer-events-none absolute top-0 rounded-lg bg-elev px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max((hx ?? 0) - 60, 0), w - 150), boxShadow: "var(--shadow)" }}
          >
            <div className="num text-faint">{first.pts[hover][0]}</div>
            {data.map((s) => {
              const p = s.pts[Math.min(hover, s.pts.length - 1)];
              return (
                <div key={s.label} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{s.label}</span>
                  <span className="num font-semibold" style={{ color: s.color }}>
                    {p ? pctTxt(p[1]) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
