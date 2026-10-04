"use client";

// One position's life as a small step chart: how much was held after each trade. Dots are the
// trades (hover or tap for the date, action and estimated holding; open the trade from there).
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

export interface TrackStep {
  id: string;
  tx: string;
  act: string;
  /** estimated shares held after this step (range) */
  lo: number | null;
  hi: number | null;
  /** same-day trades merged into this step */
  n: number;
  /** the holding after this step, as text */
  sh: string;
}

const BUY = new Set(["open", "add"]);
const tone = (act: string) => (BUY.has(act) ? "var(--pos)" : act === "exchange" || act === "other" ? "var(--faint)" : "var(--neg)");
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

export default function PositionTrack({ steps, held, today, acts, labels, hrefBase }: { steps: TrackStep[]; held: boolean; today: string; acts: Record<string, string>; labels: { holding: string; open: string; now: string }; hrefBase: string }) {
  const [on, setOn] = useState<number | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const W = 320, H = 64, PAD = 9;
  const geo = useMemo(() => {
    const t0 = ms(steps[0].tx);
    const t1 = Math.max(held ? ms(today) : ms(steps[steps.length - 1].tx), t0 + 864e5);
    const mid = steps.map((s) => (s.hi == null && s.lo == null ? null : ((s.lo ?? 0) + (s.hi ?? s.lo ?? 0)) / 2));
    const top = Math.max(1, ...mid.map((m) => m ?? 0));
    const X = (t: number) => PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD);
    const Y = (v: number | null) => H - PAD - ((v ?? 0) / top) * (H - 2 * PAD - 4);
    const pts = steps.map((s, i) => ({ x: X(ms(s.tx)), y: Y(mid[i]) }));
    // a step line: the holding stays level until the next trade
    let line = `M${pts[0].x.toFixed(1)} ${(H - PAD).toFixed(1)}L${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) line += `H${pts[i].x.toFixed(1)}V${pts[i].y.toFixed(1)}`;
    const endX = held ? W - PAD : pts[pts.length - 1].x;
    line += `H${endX.toFixed(1)}`;
    const area = `${line}V${H - PAD}H${pts[0].x.toFixed(1)}Z`;
    return { pts, line, area, endX, endY: pts[pts.length - 1].y };
  }, [steps, held, today]);
  const s = on != null ? steps[on] : null;
  const last = steps[steps.length - 1];

  return (
    <div ref={box} className="mt-3" onMouseLeave={() => setOn(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-16 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label={labels.holding}>
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--hair)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={geo.area} fill="var(--accent)" opacity={0.1} />
        <path d={geo.line} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* the dots sit in an overlay so they stay round whatever the card's width */}
      <div className="pointer-events-none relative -mt-16 h-16">
        {held ? <span className="absolute block size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${(geo.endX / W) * 100}%`, top: `${(geo.endY / H) * 100}%` }} /> : null}
        {geo.pts.map((p, i) => (
          <button
            key={steps[i].id}
            type="button"
            aria-label={`${steps[i].tx} ${acts[steps[i].act] ?? steps[i].act}`}
            onMouseEnter={() => setOn(i)}
            onFocus={() => setOn(i)}
            onClick={() => setOn(on === i ? null : i)}
            className="pointer-events-auto absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
          >
            <span className="block rounded-full transition-transform duration-200" style={{ width: 10, height: 10, background: tone(steps[i].act), boxShadow: "0 0 0 2px var(--solid)", transform: on === i ? "scale(1.5)" : undefined }} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex min-h-[20px] flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px]">
        {s ? (
          <>
            <span className="flex items-center gap-2">
              <span className="num text-muted">{s.tx}</span>
              <span className="font-semibold" style={{ color: tone(s.act) }}>
                {acts[s.act] ?? s.act}
                {s.n > 1 ? ` ×${s.n}` : ""}
              </span>
              <span className="text-muted">
                {labels.holding} <span className="num font-medium text-ink">{s.sh}</span>
              </span>
            </span>
            <Link prefetch={false} className="link font-medium" href={`${hrefBase}/${encodeURIComponent(s.id)}`}>
              {labels.open} ›
            </Link>
          </>
        ) : (
          <>
            <span className="num text-faint">{steps[0].tx.slice(0, 7)}</span>
            <span className="text-muted">
              {held ? `${labels.now} ` : ""}
              <span className="num font-medium text-ink">{last.sh}</span>
            </span>
            <span className="num text-faint">{held ? today.slice(0, 7) : last.tx.slice(0, 7)}</span>
          </>
        )}
      </div>
    </div>
  );
}
