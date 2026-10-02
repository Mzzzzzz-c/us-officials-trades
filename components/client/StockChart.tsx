"use client";

import { useEffect, useRef, useState } from "react";

type Bar = [number, number, number, number, number, number];
export interface TradeMark {
  d: string; // YYYY-MM-DD
  b: number; // buys that day
  s: number; // sells that day
}
/** A dated event drawn on the chart: an earnings release ("e") or a policy event ("p"). */
export interface ChartEvent {
  d: string;
  k: "e" | "p";
  label: string;
}
export interface ChartLayers {
  earnings: string;
  policy: string;
  insiders: string;
  insiderBuy: string;
  insiderSell: string;
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
  insiders = [],
  events = [],
  layers,
  initialRange = "1y",
}: {
  /** the range shown first (a page whose marks are older than a year starts wider) */
  initialRange?: Range;
  /** company insiders' open-market buys and sells per day (SEC Form 4) */
  insiders?: TradeMark[];
  events?: ChartEvent[];
  /** labels for the optional layers; without them the layer toggles are not shown */
  layers?: ChartLayers;
  sym: string;
  marks: TradeMark[];
  fallback: [string, number][];
  labels: Record<Range, string>;
  buyLabel: string;
  sellLabel: string;
  locale?: string;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<Range>(initialRange);
  const [kind, setKind] = useState<"area" | "candle">("area");
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [tz, setTz] = useState(0);
  const [err, setErr] = useState(false);
  const [hover, setHover] = useState<{ t: string; p: number; b: number; s: number; ib: number; is: number; ev: string[] } | null>(null);
  const [showIns, setShowIns] = useState(true);
  const [showEarn, setShowEarn] = useState(true);
  const [showPol, setShowPol] = useState(true);

  useEffect(() => {
    let dead = false;
    setBars(null);
    setErr(false);
    fetch(`/api/chart?s=${encodeURIComponent(sym)}&r=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (dead) return;
        setTz(d.tz ?? 0);
        setBars(d.bars);
      })
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
                  if (kind === 2) return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
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
      // intraday bars are shown in New York time (the offset comes with the data)
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
      type Cell = { b: number; s: number; ib: number; is: number; ev: string[]; e: boolean; p: boolean };
      const agg = new Map<string, Cell>();
      if (!intraday) {
        // group trades so markers stay readable: by day (1 month), week (up to a year) or month (longer)
        const days = bars.map((b) => new Date(b[0] * 1000).toISOString().slice(0, 10));
        const span = range === "1m" ? 1 : range === "6m" || range === "1y" ? 7 : 30;
        const bucketOf = (i: number) => Math.floor(bars[i][0] / 86400 / span);
        const firstOf = new Map<number, string>();
        days.forEach((d, i) => {
          const b = bucketOf(i);
          if (!firstOf.has(b)) firstOf.set(b, d);
        });
        // index of the last bar on or before a date
        const at = (d: string) => {
          let lo = 0;
          let hi = days.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (days[mid] <= d) lo = mid;
            else hi = mid - 1;
          }
          return lo;
        };
        const cell = (k: string) => agg.get(k) ?? agg.set(k, { b: 0, s: 0, ib: 0, is: 0, ev: [], e: false, p: false }).get(k)!;
        const lastDay = days[days.length - 1];
        for (const m of marks) {
          if (m.d < days[0]) continue;
          const c = cell(firstOf.get(bucketOf(at(m.d))) ?? days[at(m.d)]);
          c.b += m.b;
          c.s += m.s;
        }
        if (showIns)
          for (const m of insiders) {
            if (m.d < days[0]) continue;
            const c = cell(firstOf.get(bucketOf(at(m.d))) ?? days[at(m.d)]);
            c.ib += m.b;
            c.is += m.s;
          }
        // events sit on their own day (the first trading day on or after it would be ideal; the bar before is close enough)
        for (const ev of events) {
          if (ev.d < days[0] || ev.d > lastDay) continue;
          if ((ev.k === "e" && !showEarn) || (ev.k === "p" && !showPol)) continue;
          const c = cell(days[at(ev.d)]);
          c.ev.push(ev.label);
          if (ev.k === "e") c.e = true;
          else c.p = true;
        }
        type Marker = import("lightweight-charts").SeriesMarker<import("lightweight-charts").Time>;
        const mk: Marker[] = [];
        const T = (d: string) => d as unknown as import("lightweight-charts").Time;
        for (const [d, a] of Array.from(agg.entries()).sort()) {
          // officials: arrows (direction and colour say buy or sell; a number only when there were several)
          if (a.b) mk.push({ time: T(d), position: "belowBar", color: pos, shape: "arrowUp", text: a.b > 1 ? String(a.b) : "" });
          if (a.s) mk.push({ time: T(d), position: "aboveBar", color: neg, shape: "arrowDown", text: a.s > 1 ? String(a.s) : "" });
          // company insiders: small dots
          if (a.ib) mk.push({ time: T(d), position: "belowBar", color: pos, shape: "circle", size: 0.6 });
          if (a.is) mk.push({ time: T(d), position: "aboveBar", color: neg, shape: "circle", size: 0.6 });
          // events: squares on the line itself
          if (a.e) mk.push({ time: T(d), position: "inBar", color: "#ff9f0a", shape: "square", size: 0.7 });
          if (a.p) mk.push({ time: T(d), position: "inBar", color: "#5e5ce6", shape: "square", size: 0.9 });
        }
        if (mk.length) lc.createSeriesMarkers(series, mk);
      }
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove((p) => {
        if (!p.time || !p.seriesData.size) return setHover(null);
        const v = p.seriesData.get(series) as { value?: number; close?: number } | undefined;
        const price = v?.value ?? v?.close;
        const t = typeof p.time === "number" ? new Date(p.time * 1000).toISOString().replace("T", " ").slice(0, 16) : String(p.time);
        const a = typeof p.time === "number" ? undefined : agg.get(String(p.time));
        if (price != null) setHover({ t, p: price, b: a?.b ?? 0, s: a?.s ?? 0, ib: a?.ib ?? 0, is: a?.is ?? 0, ev: a?.ev ?? [] });
      });
      ro = new ResizeObserver(() => chart?.applyOptions({ width: box.clientWidth }));
      ro.observe(box);
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      chart?.remove();
    };
  }, [bars, kind, marks, insiders, events, showIns, showEarn, showPol, range, buyLabel, sellLabel, locale, tz]);

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
                {layers && hover.ib ? <span className="text-pos"> · {layers.insiderBuy} {hover.ib}</span> : null}
                {layers && hover.is ? <span className="text-neg"> · {layers.insiderSell} {hover.is}</span> : null}
                {hover.ev.length ? <span className="font-medium text-ink"> · {hover.ev.slice(0, 2).join(" / ")}</span> : null}
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
      {marks.length || insiders.length || events.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
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
          {layers ? (
            <span className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
              {insiders.length ? (
                <button type="button" className="chip px-2.5 py-1 text-[12px]" aria-pressed={showIns} onClick={() => setShowIns(!showIns)}>
                  <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden>
                    <circle cx="3.5" cy="4" r="3" fill="var(--pos)" />
                    <circle cx="10.5" cy="4" r="3" fill="var(--neg)" />
                  </svg>
                  {layers.insiders}
                </button>
              ) : null}
              {events.some((e) => e.k === "e") ? (
                <button type="button" className="chip px-2.5 py-1 text-[12px]" aria-pressed={showEarn} onClick={() => setShowEarn(!showEarn)}>
                  <span className="inline-block size-2 rounded-[2px] bg-[#ff9f0a]" />
                  {layers.earnings}
                </button>
              ) : null}
              {events.some((e) => e.k === "p") ? (
                <button type="button" className="chip px-2.5 py-1 text-[12px]" aria-pressed={showPol} onClick={() => setShowPol(!showPol)}>
                  <span className="inline-block size-2.5 rounded-[2px] bg-[#5e5ce6]" />
                  {layers.policy}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
