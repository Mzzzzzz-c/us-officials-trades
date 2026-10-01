"use client";

import { useEffect, useRef, useState } from "react";

type Bar = [number, number, number, number, number, number];
export interface TradeMark {
  d: string; // YYYY-MM-DD
  b: number; // buys that day
  s: number; // sells that day
}

const RANGES = ["1d", "5d", "1m", "6m", "1y", "5y", "max"] as const;
type Range = (typeof RANGES)[number];

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Interactive price chart (TradingView Lightweight Charts) with officials' buys and sells marked. */
export default function StockChart({
  sym,
  marks,
  fallback,
  labels,
  buyLabel,
  sellLabel,
  locale = "en",
}: {
  sym: string;
  marks: TradeMark[];
  fallback: [string, number][];
  labels: Record<Range, string>;
  buyLabel: string;
  sellLabel: string;
  locale?: string;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<Range>("1y");
  const [kind, setKind] = useState<"area" | "candle">("area");
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [err, setErr] = useState(false);
  const [hover, setHover] = useState<{ t: string; p: number; b: number; s: number } | null>(null);

  useEffect(() => {
    let dead = false;
    setBars(null);
    setErr(false);
    fetch(`/api/chart?s=${encodeURIComponent(sym)}&r=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !dead && setBars(d.bars))
      .catch(() => {
        if (dead) return;
        setErr(true);
        // weekly closes from our own data as a fallback
        const cut = { "1d": 7, "5d": 14, "1m": 35, "6m": 190, "1y": 370, "5y": 1830, max: 100000 }[range];
        const since = Date.now() / 1000 - cut * 864e2;
        setBars(fallback.map(([d, c]) => [Date.parse(d) / 1000, c, c, c, c, 0] as Bar).filter((b) => b[0] >= since));
      });
    return () => {
      dead = true;
    };
  }, [sym, range, fallback]);

  useEffect(() => {
    const box = el.current;
    if (!box || !bars || !bars.length) return;
    let chart: import("lightweight-charts").IChartApi | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    (async () => {
      const lc = await import("lightweight-charts");
      if (cancelled) return;
      const text = cssVar("--muted", "#6e6e73");
      const hair = cssVar("--hair", "rgba(0,0,0,.08)");
      const accent = cssVar("--accent", "#0071e3");
      const pos = cssVar("--pos", "#1f9d55");
      const neg = cssVar("--neg", "#e0352b");
      const intraday = range === "1d" || range === "5d";
      chart = lc.createChart(box, {
        width: box.clientWidth,
        height: box.clientHeight,
        layout: { background: { type: lc.ColorType.Solid, color: "transparent" }, textColor: text, fontSize: 11, attributionLogo: false },
        // a fixed locale: some systems report tags like "en-US@posix" that Intl rejects
        localization: { locale: "en-US", priceFormatter: (p: number) => `$${p.toFixed(p < 10 ? 3 : 2)}` },
        grid: { vertLines: { visible: false }, horzLines: { color: hair } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
        timeScale: {
          borderVisible: false,
          timeVisible: intraday,
          secondsVisible: false,
          // Chinese readers get 2026年 / 3月 / 15日 instead of English month names
          tickMarkFormatter:
            locale === "zh"
              ? (t: import("lightweight-charts").Time, kind: number) => {
                  const d = typeof t === "number" ? new Date(t * 1000) : new Date(String(t));
                  if (kind === 0) return `${d.getUTCFullYear()}年`;
                  if (kind === 1) return `${d.getUTCMonth() + 1}月`;
                  if (kind === 2) return `${d.getUTCDate()}日`;
                  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
                }
              : undefined,
        },
        crosshair: { mode: lc.CrosshairMode.Magnet, vertLine: { color: text, width: 1, style: lc.LineStyle.Dashed, labelVisible: false }, horzLine: { color: text, labelBackgroundColor: accent } },
        handleScale: { mouseWheel: false, pinch: true },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      });
      const up = bars[bars.length - 1][4] >= bars[0][1];
      const line = up ? pos : neg;
      const tz = 0;
      const time = (t: number) => (intraday ? ((t + tz) as import("lightweight-charts").UTCTimestamp) : (new Date(t * 1000).toISOString().slice(0, 10) as unknown as import("lightweight-charts").Time));
      let series: import("lightweight-charts").ISeriesApi<"Area"> | import("lightweight-charts").ISeriesApi<"Candlestick">;
      if (kind === "candle") {
        const s = chart.addSeries(lc.CandlestickSeries, { upColor: pos, downColor: neg, borderVisible: false, wickUpColor: pos, wickDownColor: neg, priceLineVisible: false });
        s.setData(bars.map((b) => ({ time: time(b[0]), open: b[1], high: b[2], low: b[3], close: b[4] })));
        series = s;
      } else {
        const s = chart.addSeries(lc.AreaSeries, {
          lineColor: line,
          topColor: line + "38",
          bottomColor: line + "00",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerRadius: 4,
        });
        s.setData(bars.map((b) => ({ time: time(b[0]), value: b[4] })));
        series = s;
      }
      const agg = new Map<string, { b: number; s: number }>();
      if (!intraday && marks.length) {
        // group trades so markers stay readable: by day (1 month), week (up to a year) or month (longer)
        const days = bars.map((b) => new Date(b[0] * 1000).toISOString().slice(0, 10));
        const bucket = range === "1m" ? 1 : range === "6m" || range === "1y" ? 5 : 21;
        for (const m of marks) {
          if (m.d < days[0]) continue;
          let lo = 0;
          let hi = days.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (days[mid] <= m.d) lo = mid;
            else hi = mid - 1;
          }
          const k = days[Math.max(0, lo - (lo % bucket))];
          const a = agg.get(k) ?? { b: 0, s: 0 };
          a.b += m.b;
          a.s += m.s;
          agg.set(k, a);
        }
        const mk: import("lightweight-charts").SeriesMarker<import("lightweight-charts").Time>[] = [];
        for (const [d, a] of Array.from(agg.entries()).sort()) {
          // the arrow's direction and colour say buy or sell; a number only when there were several
          if (a.b) mk.push({ time: d as unknown as import("lightweight-charts").Time, position: "belowBar", color: pos, shape: "arrowUp", text: a.b > 1 ? String(a.b) : "" });
          if (a.s) mk.push({ time: d as unknown as import("lightweight-charts").Time, position: "aboveBar", color: neg, shape: "arrowDown", text: a.s > 1 ? String(a.s) : "" });
        }
        lc.createSeriesMarkers(series, mk);
      }
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove((p) => {
        if (!p.time || !p.seriesData.size) return setHover(null);
        const v = p.seriesData.get(series) as { value?: number; close?: number } | undefined;
        const price = v?.value ?? v?.close;
        const t = typeof p.time === "number" ? new Date(p.time * 1000).toISOString().replace("T", " ").slice(0, 16) : String(p.time);
        const a = typeof p.time === "number" ? undefined : agg.get(String(p.time));
        if (price != null) setHover({ t, p: price, b: a?.b ?? 0, s: a?.s ?? 0 });
      });
      ro = new ResizeObserver(() => chart?.applyOptions({ width: box.clientWidth }));
      ro.observe(box);
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      chart?.remove();
    };
  }, [bars, kind, marks, range, buyLabel, sellLabel, locale]);

  const chg = bars && bars.length > 1 ? bars[bars.length - 1][4] / bars[0][1] - 1 : null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
              {labels[r]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-sm text-muted">
            {hover ? (
              <>
                {hover.t} · <span className="font-semibold text-ink">${hover.p.toFixed(2)}</span>
                {hover.b ? <span className="text-pos"> · {buyLabel} {hover.b}</span> : null}
                {hover.s ? <span className="text-neg"> · {sellLabel} {hover.s}</span> : null}
              </>
            ) : chg != null ? (
              <span className={chg >= 0 ? "text-pos" : "text-neg"}>
                {labels[range]} {chg >= 0 ? "+" : ""}
                {(chg * 100).toFixed(2)}%
              </span>
            ) : null}
          </span>
          <div className="seg">
            <button type="button" aria-pressed={kind === "area"} onClick={() => setKind("area")} aria-label="line">
              <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
                <path d="M1 11l4-5 3 3 6-8" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
            <button type="button" aria-pressed={kind === "candle"} onClick={() => setKind("candle")} aria-label="candles">
              <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
                <path d="M4 1v12M12 1v12" stroke="currentColor" strokeWidth="1.2" />
                <rect x="2" y="4" width="4" height="5" fill="currentColor" />
                <rect x="10" y="3" width="4" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div className="relative h-[340px] w-full sm:h-[420px]">
        {!bars ? <div className="skeleton absolute inset-0" /> : null}
        <div ref={el} className="absolute inset-0" />
      </div>
      {marks.length ? (
        <div className="mt-3 flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M5 1l4 7H1z" fill="var(--pos)" />
            </svg>
            {buyLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M5 9L1 2h8z" fill="var(--neg)" />
            </svg>
            {sellLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
