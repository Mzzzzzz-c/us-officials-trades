export interface Marker {
  date: string;
  kind: "buy" | "sell";
  price?: number;
  label: string;
}

const W = 800;
const H = 280;
const PAD = { l: 52, r: 14, t: 14, b: 28 };

function niceTicks(lo: number, hi: number, log: boolean): number[] {
  if (log) {
    const out: number[] = [];
    const steps = [1, 2, 5];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      for (const s of steps) {
        const v = s * 10 ** e;
        if (v >= lo && v <= hi) out.push(v);
      }
    }
    return out.length > 7 ? out.filter((_, i) => i % 2 === 0) : out;
  }
  const span = hi - lo;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 5) ?? mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}

function fmtTick(v: number): string {
  if (v >= 1000) return `$${Math.round(v).toLocaleString("en-US")}`;
  if (v >= 10) return `$${Math.round(v)}`;
  return `$${v.toFixed(v >= 1 ? 1 : 2)}`;
}

export default function PriceChart({ series, markers, ariaLabel, buyLabel, sellLabel }: { series: [string, number][]; markers: Marker[]; ariaLabel: string; buyLabel: string; sellLabel: string }) {
  if (series.length < 2) return null;
  const t0 = Date.parse(series[0][0]);
  const t1 = Date.parse(series[series.length - 1][0]);
  const vals = series.map((p) => p[1]);
  for (const m of markers) if (m.price) vals.push(m.price);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const log = lo > 0 && hi / lo > 6;
  if (!log) {
    const pad = (hi - lo) * 0.06 || hi * 0.05;
    lo = Math.max(0, lo - pad);
    hi = hi + pad;
  } else {
    lo *= 0.92;
    hi *= 1.08;
  }
  const X = (d: string) => PAD.l + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const Y = (v: number) =>
    log
      ? PAD.t + (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (H - PAD.t - PAD.b)
      : PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = series.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join("");
  const ticks = niceTicks(lo, hi, log);
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  const years = [];
  for (let y = y0 + 1; y <= y1; y++) years.push(y);
  const priceAt = (d: string) => {
    let best = series[0][1];
    for (const p of series) {
      if (p[0] > d) break;
      best = p[1];
    }
    return best;
  };
  const inRange = markers.filter((m) => Date.parse(m.date) >= t0 && Date.parse(m.date) <= t1);

  return (
    <figure className="card p-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="w-full h-auto">
        <g>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">
                {fmtTick(v)}
              </text>
            </g>
          ))}
          {years.map((y) => {
            const x = X(`${y}-01-01`);
            return (
              <g key={y}>
                <line x1={x} x2={x} y1={PAD.t} y2={H - PAD.b} stroke="var(--border)" strokeDasharray="2 3" />
                <text x={x} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--faint)">
                  {y}
                </text>
              </g>
            );
          })}
        </g>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
        {inRange.map((m, i) => {
          const x = X(m.date);
          const y = Y(m.price ?? priceAt(m.date));
          const d = m.kind === "buy" ? `M${x} ${y + 3}l-5 9h10z` : `M${x} ${y - 3}l-5 -9h10z`;
          return (
            <path key={i} d={d} fill={m.kind === "buy" ? "var(--pos)" : "var(--neg)"} fillOpacity="0.85" stroke="var(--surface)" strokeWidth="0.8">
              <title>{m.label}</title>
            </path>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <svg width="10" height="10" aria-hidden><path d="M5 1l-4 8h8z" fill="var(--pos)" /></svg>
          {buyLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="10" height="10" aria-hidden><path d="M5 9l-4 -8h8z" fill="var(--neg)" /></svg>
          {sellLabel}
        </span>
      </figcaption>
    </figure>
  );
}
