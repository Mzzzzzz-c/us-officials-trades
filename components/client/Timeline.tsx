"use client";

// Interactive trade timeline: price on top (when there is one), every trade as a dot on a time axis
// below it, events as small markers under the axis. Hover a dot for the basics, click it for the
// details; drag to move through time, use the buttons (or Ctrl + wheel) to zoom, arrow keys to step
// from trade to trade.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, Logo } from "../media";
import { PosterButton } from "./Share";

export interface TLItem {
  id: string;
  /** YYYY-MM-DD */
  d: string;
  side: "b" | "s" | "x";
  /** index into `lanes` */
  lane?: number;
  /** main line: the stock on a person's page, the person on a stock page */
  title: string;
  sub?: string;
  /** stock symbol when the trade is in a listed stock (used by the stock filter) */
  sym?: string;
  amount: string;
  /** dollar size used for the dot */
  v: number;
  /** label / value pairs shown in the detail card */
  rows: [string, string][];
  tags?: string[];
  /** page with everything about this trade */
  href?: string;
  /** the person or stock page */
  link?: string;
  /** original filing */
  src?: string;
  avatar?: { id: string; name: string; party?: string; has?: boolean };
  logo?: { sym: string; kind?: number };
}

export interface TLEvent {
  d: string;
  /** e earnings, f expected earnings, m macro data, p policy, n company announcement */
  k: "e" | "f" | "m" | "p" | "n";
  label: string;
  sub?: string;
  href?: string;
}

/** A guided entry point: a headline that, when chosen, moves the timeline to the trades behind it. */
export interface TLStory {
  kicker: string;
  title: string;
  sub: string;
  ids: string[];
  tone?: "b" | "s";
}

export interface TLLabels {
  buy: string;
  sell: string;
  other: string;
  all: string;
  allStocks: string;
  trades: string; // "{n} 笔"
  ranges: Record<"6m" | "1y" | "2y" | "5y" | "all", string>;
  zoomIn: string;
  zoomOut: string;
  prev: string;
  next: string;
  hint: string;
  pick: string;
  details: string;
  person: string;
  stock: string;
  source: string;
  future: string;
  today: string;
  events: Record<TLEvent["k"], string>;
  price: string;
  empty: string;
  more: string; // "还有 {n} 笔"
}

const DAY = 864e5;
// one shared empty list: a fresh [] on every render would look like new events each time
const NO_EVENTS: TLEvent[] = [];
const RANGE_DAYS = { "6m": 183, "1y": 365, "2y": 730, "5y": 1826 } as const;
const EVENT_COLOR: Record<TLEvent["k"], string> = { e: "var(--accent)", f: "var(--accent)", m: "#bf5af2", p: "var(--warn)", n: "var(--muted)" };
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmtN = (s: string, n: number | string) => s.replace("{n}", String(n));

interface Bucket {
  key: string;
  x: number;
  lane: number;
  side: TLItem["side"];
  items: TLItem[];
  v: number;
}

export default function Timeline({
  items,
  events = NO_EVENTS,
  lanes,
  price,
  priceSym,
  stocks,
  labels,
  locale,
  today,
  poster,
  stories,
}: {
  stories?: TLStory[];
  items: TLItem[];
  events?: TLEvent[];
  /** lane names, top to bottom; items without a lane go to the first */
  lanes: string[];
  /** weekly closes [date, close] drawn above the trades (a stock page) */
  price?: [string, number][];
  priceSym?: string;
  /** a person's page: stocks to filter by; picking one loads its price */
  stocks?: { sym: string; n: number; name?: string }[];
  labels: TLLabels;
  locale: string;
  today: string;
  /** the poster of this timeline: image path, page path and share text */
  poster?: { src: string; path: string; text: string; label: string; labels: React.ComponentProps<typeof PosterButton>["labels"] };
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);
  const [side, setSide] = useState<"" | "b" | "s">("");
  const [stock, setStock] = useState("");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; y: number; b?: Bucket; e?: TLEvent; more?: TLEvent[] } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [selEvent, setSelEvent] = useState<TLEvent | null>(null);
  const [loaded, setLoaded] = useState<{ sym: string; pts: [number, number][] } | null>(null);
  const drag = useRef<{ x: number; t0: number; t1: number; moved: boolean } | null>(null);
  const sheetDrag = useRef<number | null>(null);
  const [sheetY, setSheetY] = useState(0);

  const now = ms(today);
  const shown = useMemo(() => items.filter((i) => (!side || i.side === side) && (!stock || i.sym === stock)).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)), [items, side, stock]);
  const evs = useMemo(() => events.filter((e) => !off.has(e.k === "f" ? "e" : e.k)), [events, off]);
  const kinds = useMemo(() => Array.from(new Set(events.map((e) => (e.k === "f" ? "e" : e.k)))) as TLEvent["k"][], [events]);

  // the whole span: first trade to today, plus room for events still to come
  const domain = useMemo(() => {
    const first = items.length ? Math.min(...items.map((i) => ms(i.d))) : now - 365 * DAY;
    const lastEv = events.reduce((a, e) => Math.max(a, ms(e.d)), now);
    // room for what is coming, but never more than a quarter of the history shown
    const ahead = Math.min(100 * DAY, Math.max(14 * DAY, (now - first) * 0.25));
    const end = Math.min(lastEv, now + ahead) + 6 * DAY;
    return [Math.min(first, now - 45 * DAY) - 10 * DAY, Math.max(end, now + 8 * DAY)] as [number, number];
  }, [items, events, now]);
  const [view, setView] = useState<[number, number]>(domain);
  const [range, setRange] = useState<keyof TLLabels["ranges"] | "">("all");

  const applyRange = useCallback(
    (r: keyof TLLabels["ranges"]) => {
      setRange(r);
      setView(r === "all" ? domain : [Math.max(domain[0], domain[1] - RANGE_DAYS[r] * DAY), domain[1]]);
    },
    [domain],
  );
  // start on the last two years when the history is long and busy enough to be crowded; only once,
  // so the range the reader picks afterwards stays
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const twoY = items.filter((i) => ms(i.d) >= now - 730 * DAY).length;
    const narrow = (box.current?.clientWidth ?? 900) < 520;
    if (domain[1] - domain[0] > 900 * DAY && twoY >= 6) applyRange(narrow ? "1y" : "2y");
    else applyRange("all");
  }, [domain, items, now, applyRange]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(300, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(300, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // a person's page: load the price of the stock that was picked
  useEffect(() => {
    if (!stock || price) return;
    let dead = false;
    fetch(`/api/chart?s=${encodeURIComponent(stock)}&r=max`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { bars: number[][] }) => !dead && setLoaded({ sym: stock, pts: d.bars.map((b) => [b[0] * 1000, b[4]] as [number, number]) }))
      .catch(() => !dead && setLoaded(null));
    return () => {
      dead = true;
    };
  }, [stock, price]);

  const pricePts = useMemo<[number, number][] | null>(() => {
    if (price?.length) return price.map(([d, c]) => [ms(d), c]);
    return stock && loaded?.sym === stock ? loaded.pts : null;
  }, [price, stock, loaded]);
  const pSym = price?.length ? priceSym : stock;

  // ---------------------------------------------------------------- geometry
  const padL = 8;
  const padR = pricePts ? 54 : 8;
  const iw = Math.max(100, w - padL - padR);
  const PH = pricePts ? (w < 520 ? 150 : 200) : 0;
  // each lane: a label row, then buys above and sells below its centre line
  const HEAD = 18;
  const LH = w < 520 ? 104 : 116;
  const mid = (k: number) => laneTop(k) + HEAD + (LH - HEAD) / 2;
  const laneTop = (k: number) => PH + (PH ? 14 : 4) + k * LH;
  const axisY = laneTop(lanes.length) + 4;
  const evY = axisY + 30;
  const wide = useMemo(() => events.some((e) => e.k === "m" || e.k === "p"), [events]);
  const evRow = (e: TLEvent) => evY + (wide && (e.k === "m" || e.k === "p") ? 20 : 0);
  const H = evY + (events.length ? (wide ? 44 : 24) : 6);
  const X = useCallback((t: number) => padL + ((t - view[0]) / (view[1] - view[0])) * iw, [view, iw]);

  // events too close to draw apart share one marker (the first), and the tooltip says how many more
  const evMarks = useMemo(() => {
    const out: { e: TLEvent; x: number; ey: number; more: TLEvent[] }[] = [];
    const last = new Map<number, { x: number; k: number }>();
    for (const e of [...evs].sort((a, b) => (a.d < b.d ? -1 : 1))) {
      const t = ms(e.d);
      if (t < view[0] || t > view[1]) continue;
      const x = X(t), ey = evRow(e);
      const prev = last.get(ey);
      if (prev && x - prev.x < 13) {
        out[prev.k].more.push(e);
        continue;
      }
      last.set(ey, { x, k: out.length });
      out.push({ e, x, ey, more: [] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evs, view, X, wide, evY]);
  const priceView = useMemo(() => {
    if (!pricePts) return null;
    const pts = pricePts.filter(([t]) => t >= view[0] - 14 * DAY && t <= view[1] + 14 * DAY);
    if (pts.length < 2) return null;
    let lo = Infinity, hi = -Infinity;
    for (const [, c] of pts) {
      if (c < lo) lo = c;
      if (c > hi) hi = c;
    }
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad;
    hi += pad;
    const Y = (c: number) => 10 + (1 - (c - lo) / (hi - lo)) * (PH - 20);
    const d = pts.map(([t, c], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(c).toFixed(1)}`).join("");
    const at = (t: number) => {
      // the close on or before t
      let lo2 = 0, hi2 = pts.length - 1;
      while (lo2 < hi2) {
        const mid = (lo2 + hi2 + 1) >> 1;
        if (pts[mid][0] <= t) lo2 = mid;
        else hi2 = mid - 1;
      }
      return pts[lo2][0] <= t + 7 * DAY ? pts[lo2][1] : null;
    };
    return { d, Y, lo, hi, at, last: pts[pts.length - 1], first: pts[0] };
  }, [pricePts, view, X, PH]);

  // slots wide enough that neighbouring dots never touch
  const bin = w < 520 ? 26 : 22;
  const buckets = useMemo(() => {
    const map = new Map<string, Bucket>();
    for (const it of shown) {
      const t = ms(it.d);
      if (t < view[0] || t > view[1]) continue;
      const lane = Math.min(lanes.length - 1, it.lane ?? 0);
      const slot = Math.round(X(t) / bin);
      const key = `${lane}:${it.side}:${slot}`;
      const b = map.get(key) ?? { key, x: slot * bin, lane, side: it.side, items: [], v: 0 };
      b.items.push(it);
      b.v += it.v;
      map.set(key, b);
    }
    return Array.from(map.values()).sort((a, b) => a.x - b.x || a.lane - b.lane);
  }, [shown, view, X, lanes.length, bin]);
  // sizes are relative within a lane: officials report ranges in thousands, insiders sell millions
  const vmax = useMemo(() => lanes.map((_, k) => Math.max(1, ...buckets.filter((b) => b.lane === k).map((b) => b.v))), [buckets, lanes]);
  const radius = (b: Bucket) => Math.min(bin / 2 - 1.5, Math.max(b.items.length > 1 ? 7.5 : 4.5, 4.5 + 7 * Math.sqrt(b.v / vmax[b.lane])));
  const cy = (b: Bucket) => mid(b.lane) + (b.side === "b" ? -1 : b.side === "s" ? 1 : 0) * ((LH - HEAD) / 4);
  const color = (s: TLItem["side"]) => (s === "b" ? "var(--pos)" : s === "s" ? "var(--neg)" : "var(--faint)");

  const biggest = useMemo(() => buckets.reduce<Bucket | null>((a, b) => (!a || b.v / vmax[b.lane] > a.v / vmax[a.lane] ? b : a), null), [buckets, vmax]);
  const selected = useMemo(() => buckets.find((b) => b.key === sel) ?? null, [buckets, sel]);
  // the selection is a set of trade ids, so it survives zooming (buckets regroup)
  const [selIds, setSelIds] = useState<string[]>([]);
  const selItems = useMemo(() => (selIds.length ? shown.filter((i) => selIds.includes(i.id)) : []), [shown, selIds]);
  const [hint, setHint] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      setHint(!window.localStorage.getItem("tl:seen"));
    } catch {
      setHint(false);
    }
  }, []);
  const pick = (b: Bucket | null) => {
    setSel(b?.key ?? null);
    setSelIds(b ? b.items.map((i) => i.id) : []);
    setSelEvent(null);
    if (b && hint) {
      setHint(false);
      try {
        window.localStorage.setItem("tl:seen", "1");
      } catch {
        // private mode: the hint simply shows again next time
      }
    }
  };
  /** Move to the trades of a story and open them. */
  const focus = (ids: string[]) => {
    const ts = items.filter((i) => ids.includes(i.id)).map((i) => ms(i.d));
    if (!ts.length) return;
    setSide("");
    setStock("");
    const lo = Math.min(...ts), hi = Math.max(...ts);
    const span = Math.max(50 * DAY, (hi - lo) * 1.8);
    const mid = (lo + hi) / 2;
    const a = Math.max(domain[0], Math.min(domain[1] - span, mid - span / 2));
    setRange("");
    setView([a, a + span]);
    setSel(null);
    setSelIds(ids);
    setSelEvent(null);
    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const [story, setStory] = useState(-1);

  const step = (dir: 1 | -1) => {
    if (!buckets.length) return;
    const k = selected ? buckets.indexOf(selected) : dir === 1 ? -1 : buckets.length;
    const nb = buckets[Math.min(buckets.length - 1, Math.max(0, k + dir))];
    pick(nb);
  };

  const zoom = (f: number, cx = 0.5) => {
    const span = view[1] - view[0];
    const ns = Math.min(domain[1] - domain[0], Math.max(21 * DAY, span * f));
    let a = view[0] + (span - ns) * cx;
    a = Math.max(domain[0], Math.min(domain[1] - ns, a));
    setRange("");
    setView([a, a + ns]);
  };

  // Ctrl/⌘ + wheel zooms; a plain wheel keeps scrolling the page
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(e.deltaY > 0 ? 1.25 : 0.8, Math.min(1, Math.max(0, (e.clientX - r.left - padL) / iw)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, t0: view[0], t1: view[1], moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    if (Math.abs(dx) < 4 && !g.moved) return;
    g.moved = true;
    setHover(null);
    const span = g.t1 - g.t0;
    let a = g.t0 - (dx / iw) * span;
    a = Math.max(domain[0], Math.min(domain[1] - span, a));
    setRange("");
    setView([a, a + span]);
  };
  const onUp = () => {
    // a drag that ends over a dot must not count as a click on it
    setTimeout(() => (drag.current = null), 0);
  };

  // ---------------------------------------------------------------- axis ticks
  const ticks = useMemo(() => {
    const span = (view[1] - view[0]) / DAY;
    const stepM = span > 2200 ? 12 : span > 1100 ? 6 : span > 500 ? 3 : span > 200 ? 2 : 1;
    const out: { x: number; label: string; major: boolean }[] = [];
    const d = new Date(view[0]);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCMonth(Math.ceil(d.getUTCMonth() / stepM) * stepM);
    while (d.getTime() <= view[1]) {
      if (d.getTime() >= view[0]) {
        const jan = d.getUTCMonth() === 0;
        const mon = locale === "zh" ? `${d.getUTCMonth() + 1}月` : d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
        out.push({ x: X(d.getTime()), label: jan || stepM >= 12 ? (locale === "zh" ? `${d.getUTCFullYear()}年` : String(d.getUTCFullYear())) : mon, major: jan });
      }
      d.setUTCMonth(d.getUTCMonth() + stepM);
    }
    // months on a phone sit close together: keep a label only when it clears the previous one
    let lastX = -1e9;
    return out.map((t) => {
      const show = t.major || t.x - lastX >= 46;
      if (show) lastX = t.x;
      return { ...t, show };
    });
  }, [view, X, locale]);

  const sideName = (s: TLItem["side"]) => (s === "b" ? labels.buy : s === "s" ? labels.sell : labels.other);
  const nowX = X(now);
  const tipLeft = hover ? Math.min(Math.max(8, hover.x - 130), Math.max(8, w - 268)) : 0;

  const detail = (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {selItems.slice(0, 40).map((it) => (
            <div key={it.id} className="card p-4">
              <div className="flex items-center gap-3">
                {it.avatar ? <Avatar id={it.avatar.id} name={it.avatar.name} party={it.avatar.party} has={it.avatar.has} size={40} /> : it.logo ? <Logo sym={it.logo.sym} kind={it.logo.kind} size={40} /> : null}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{it.title}</div>
                  {it.sub ? <div className="truncate text-[12px] text-muted">{it.sub}</div> : null}
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white" style={{ background: color(it.side) }}>
                  {sideName(it.side)}
                </span>
              </div>
              <div className="num mt-3 text-[22px] font-semibold tracking-tight">{it.amount}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                {it.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-hair pb-1">
                    <dt className="text-muted">{k}</dt>
                    <dd className="num text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              {it.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {it.tags.map((g) => (
                    <span key={g} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                      {g}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                {it.href ? (
                  <Link prefetch={false} className="link font-medium" href={it.href}>
                    {labels.details} ›
                  </Link>
                ) : null}
                {it.link ? (
                  <Link prefetch={false} className="link" href={it.link}>
                    {it.avatar ? labels.person : labels.stock} ›
                  </Link>
                ) : null}
                {it.src ? (
                  <a className="link" href={it.src} target="_blank" rel="noopener noreferrer">
                    {labels.source} ↗
                  </a>
                ) : null}
              </div>
            </div>
          ))}
          {selItems.length > 40 ? <p className="text-xs text-faint sm:col-span-2">{fmtN(labels.more, selItems.length - 40)}</p> : null}
        </div>
  );
  if (!items.length) return <p className="card px-5 py-8 text-center text-sm text-muted">{labels.empty}</p>;

  return (
    <div>
      {stories?.length ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {stories.map((st, k) => (
            <button
              key={k}
              type="button"
              aria-pressed={story === k}
              onClick={() => {
                setStory(k);
                focus(st.ids);
              }}
              className={`sheen rounded-2xl p-4 text-left transition-all duration-300 ${story === k ? "bg-[var(--solid)] shadow-[inset_0_0_0_1.5px_var(--accent),var(--shadow-sm)]" : "bg-surface-2 hover:bg-surface-3"}`}
            >
              <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: st.tone === "s" ? "var(--neg)" : st.tone === "b" ? "var(--pos)" : "var(--accent)" }}>
                <span className="num flex size-5 items-center justify-center rounded-full text-[11px] text-white" style={{ background: st.tone === "s" ? "var(--neg)" : st.tone === "b" ? "var(--pos)" : "var(--accent)" }}>
                  {k + 1}
                </span>
                {st.kicker}
              </div>
              <div className="mt-2 text-[16px] leading-snug font-semibold tracking-tight">{st.title}</div>
              <div className="mt-1 text-[13px] leading-snug text-muted">{st.sub}</div>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="seg">
          {(Object.keys(labels.ranges) as (keyof TLLabels["ranges"])[]).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => applyRange(r)}>
              {labels.ranges[r]}
            </button>
          ))}
        </div>
        <div className="seg">
          <button type="button" onClick={() => zoom(0.6)} aria-label={labels.zoomIn} title={labels.zoomIn}>
            ＋
          </button>
          <button type="button" onClick={() => zoom(1.6)} aria-label={labels.zoomOut} title={labels.zoomOut}>
            －
          </button>
        </div>
        <div className="seg">
          {(
            [
              ["", labels.all],
              ["b", labels.buy],
              ["s", labels.sell],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={side === k} onClick={() => setSide(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="seg">
            <button type="button" onClick={() => step(-1)} aria-label={labels.prev} title={labels.prev}>
              ‹
            </button>
            <button type="button" onClick={() => step(1)} aria-label={labels.next} title={labels.next}>
              ›
            </button>
          </div>
          {poster ? <PosterButton src={poster.src} path={poster.path} text={poster.text} label={poster.label} labels={poster.labels} /> : null}
        </div>
      </div>

      {stocks && stocks.length > 1 ? (
        <div className="no-scrollbar -mx-1 mb-3 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" className="chip" aria-pressed={stock === ""} onClick={() => setStock("")}>
            {labels.allStocks}
          </button>
          {stocks.slice(0, 24).map((s) => (
            <button key={s.sym} type="button" className="chip" aria-pressed={stock === s.sym} onClick={() => setStock(stock === s.sym ? "" : s.sym)} title={s.name}>
              <span className="font-semibold">{s.sym}</span>
              <span className="opacity-60">{s.n}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={box}
        className="relative select-none"
        style={{ touchAction: "pan-y", cursor: drag.current?.moved ? "grabbing" : "grab" }}
        tabIndex={0}
        role="group"
        aria-label={labels.hint}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") (e.preventDefault(), step(1));
          else if (e.key === "ArrowLeft") (e.preventDefault(), step(-1));
          else if (e.key === "+" || e.key === "=") zoom(0.6);
          else if (e.key === "-") zoom(1.6);
          else if (e.key === "Escape") pick(null);
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => {
          onUp();
          setHover(null);
        }}
      >
        <svg width={w} height={H} className={`block ${hover?.b ? "tl-dim" : ""}`} role="img" aria-label={labels.hint}>
          {/* months */}
          {ticks.map((t, k) => (
            // (labels too close to the one before are left out below)
            <g key={k}>
              <line x1={t.x} x2={t.x} y1={0} y2={axisY} stroke="var(--hair)" strokeWidth={1} strokeDasharray={t.major ? undefined : "2 4"} />
              {t.show ? <text x={t.x + 4} y={axisY + 16} fontSize={11} fill={t.major ? "var(--text)" : "var(--faint)"} fontWeight={t.major ? 600 : 400}>
                {t.label}
              </text> : null}
            </g>
          ))}
          {/* what has not happened yet */}
          {nowX < padL + iw ? (
            <g>
              <rect x={Math.max(padL, nowX)} y={0} width={padL + iw - Math.max(padL, nowX)} height={axisY} fill="var(--surface-2)" opacity={0.7} />
              {nowX >= padL ? <line x1={nowX} x2={nowX} y1={0} y2={axisY} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" /> : null}
              {nowX >= padL + 40 ? (
                <text x={nowX - 5} y={PH ? PH + 10 : 10} fontSize={10} fill="var(--accent)" textAnchor="end">
                  {labels.today}
                </text>
              ) : null}
              {padL + iw - nowX > 70 ? (
                <text x={nowX + 6} y={PH ? PH + 10 : 10} fontSize={10} fill="var(--faint)">
                  {labels.future} →
                </text>
              ) : null}
            </g>
          ) : null}

          {/* price */}
          {priceView ? (
            <g>
              <path d={priceView.d} fill="none" stroke="var(--text)" strokeWidth={1.6} strokeLinejoin="round" opacity={0.85} />
              {[priceView.hi, (priceView.hi + priceView.lo) / 2, priceView.lo].map((v, k) => (
                <text key={k} x={padL + iw + 6} y={priceView.Y(v) + 4} fontSize={10} fill="var(--faint)">
                  ${v >= 100 ? v.toFixed(0) : v.toFixed(2)}
                </text>
              ))}
              <text x={padL + 2} y={12} fontSize={11} fill="var(--muted)" fontWeight={600}>
                {pSym} · {labels.price}
              </text>
              {/* each trade on the price line */}
              {buckets.map((b) => {
                const t = view[0] + ((b.x - padL) / iw) * (view[1] - view[0]);
                const c = priceView.at(t);
                if (c == null || (stock === "" && !price)) return null;
                return <circle key={`p${b.key}`} cx={b.x} cy={priceView.Y(c)} r={b.key === sel ? 5 : 3} fill={color(b.side)} stroke="var(--surface)" strokeWidth={1.5} />;
              })}
            </g>
          ) : null}

          {/* lanes */}
          {lanes.map((name, k) => (
            <g key={name}>
              <line x1={padL} x2={padL + iw} y1={mid(k)} y2={mid(k)} stroke="var(--hair)" strokeWidth={1} />
              {lanes.length > 1 || PH ? (
                <text x={padL + 2} y={laneTop(k) + 12} fontSize={11} fill="var(--muted)" fontWeight={600}>
                  {name}
                </text>
              ) : null}
            </g>
          ))}
          <line x1={padL} x2={padL + iw} y1={axisY} y2={axisY} stroke="var(--hair)" strokeWidth={1} />

          {/* the guide through the hovered or selected dot */}
          {(hover?.b ?? selected) ? (
            <line x1={(hover?.b ?? selected)!.x} x2={(hover?.b ?? selected)!.x} y1={0} y2={axisY} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2 3" />
          ) : null}

          {/* trades */}
          {buckets.map((b) => {
            const r = radius(b);
            const on = b.key === sel || (selIds.length > 0 && b.items.some((i) => selIds.includes(i.id)));
            return (
              <g
                key={b.key}
                className={`tl-g ${on || hover?.b === b ? "is-hot" : ""}`}
                transform={`translate(${b.x} ${cy(b)})`}
                style={{ cursor: "pointer" }}
                onPointerEnter={() => !drag.current?.moved && setHover({ x: b.x, y: cy(b) - r, b })}
                onPointerLeave={() => setHover(null)}
                onClick={() => {
                  if (drag.current?.moved) return;
                  setHover(null);
                  pick(on ? null : b);
                }}
              >
                {/* a taller invisible target than the dot, no wider than its slot so neighbours stay clickable */}
                <rect x={-bin / 2} y={-Math.max(16, r + 4)} width={bin} height={2 * Math.max(16, r + 4)} fill="transparent" />
                {hint && b === biggest ? <circle className="tl-ring" r={r} fill="none" stroke={color(b.side)} strokeWidth={2} /> : null}
                <circle className="tl-dot" style={{ animationDelay: `${Math.round(((b.x - padL) / iw) * 700)}ms` }} r={r} fill={color(b.side)} fillOpacity={on ? 1 : 0.82} stroke={on ? "var(--text)" : "var(--solid)"} strokeWidth={on ? 2.5 : 1.5} />
                {b.items.length > 1 ? (
                  <text y={3.5} textAnchor="middle" fontSize={r > 9 ? 10 : 9} fontWeight={700} fill="#fff" style={{ pointerEvents: "none" }}>
                    {b.items.length > 99 ? "99+" : b.items.length}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* events */}
          {evMarks.map(({ e, x, ey, more }, k) => {
            const c = EVENT_COLOR[e.k];
            const on = selEvent === e;
            return (
              <g
                key={`${e.k}${e.d}${k}`}
                transform={`translate(${x} ${ey})`}
                style={{ cursor: "pointer" }}
                onPointerEnter={() => !drag.current?.moved && setHover({ x, y: ey - 8, e, more })}
                onPointerLeave={() => setHover(null)}
                onClick={() => {
                  if (drag.current?.moved) return;
                  setHover(null);
                  setSelEvent(on ? null : e);
                  setSel(null);
                  setSelIds([]);
                }}
              >
                {e.k === "e" || e.k === "f" ? <line y1={-(ey - axisY)} y2={-6} stroke={c} strokeWidth={1} opacity={0.35} /> : null}
                <rect x={-9} y={-9} width={18} height={18} fill="transparent" />
                <rect x={-4.5} y={-4.5} width={9} height={9} rx={e.k === "m" ? 4.5 : 1.5} transform={e.k === "p" || e.k === "n" ? "rotate(45)" : undefined} fill={e.k === "f" ? "var(--surface)" : c} stroke={on ? "var(--text)" : c} strokeWidth={on ? 2 : 1.5} />
              </g>
            );
          })}
        </svg>

        {hover ? (
          <div className="pointer-events-none absolute z-10 w-[260px] float rounded-2xl p-3 text-left" style={{ left: tipLeft, top: hover.y > 150 ? undefined : hover.y + 28, bottom: hover.y > 150 ? H - hover.y + 10 : undefined }}>
            {hover.b ? (
              <>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                  <span className="num">{hover.b.items[0].d === hover.b.items[hover.b.items.length - 1].d ? hover.b.items[0].d : `${hover.b.items[0].d} – ${hover.b.items[hover.b.items.length - 1].d}`}</span>
                  <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: color(hover.b.side) }}>
                    {sideName(hover.b.side)}
                    {hover.b.items.length > 1 ? ` · ${fmtN(labels.trades, hover.b.items.length)}` : ""}
                  </span>
                </div>
                {hover.b.items.slice(0, 3).map((it) => (
                  <div key={it.id} className="mt-2 flex items-center gap-2">
                    {it.avatar ? <Avatar id={it.avatar.id} name={it.avatar.name} party={it.avatar.party} has={it.avatar.has} size={28} /> : it.logo ? <Logo sym={it.logo.sym} kind={it.logo.kind} size={28} /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{it.title}</div>
                      <div className="num truncate text-[12px] text-muted">
                        {it.amount}
                        {it.rows.slice(0, 2).map(([k, v]) => ` · ${k} ${v}`)}
                      </div>
                    </div>
                  </div>
                ))}
                {hover.b.items.length > 3 ? <div className="mt-2 text-[11px] text-faint">{fmtN(labels.more, hover.b.items.length - 3)}</div> : null}
                <div className="mt-2 text-[11px] text-faint">{labels.pick}</div>
              </>
            ) : hover.e ? (
              <>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                  <span className="num">{hover.e.d}</span>
                  <span className="font-semibold" style={{ color: EVENT_COLOR[hover.e.k] }}>
                    {labels.events[hover.e.k]}
                  </span>
                </div>
                <div className="mt-1.5 text-[13px] font-semibold leading-snug">{hover.e.label}</div>
                {hover.e.sub ? <div className="mt-1 text-[12px] leading-snug text-muted">{hover.e.sub}</div> : null}
                {(hover.more ?? []).slice(0, 3).map((m, k) => (
                  <div key={k} className="mt-1.5 border-t border-hair pt-1.5 text-[12px] leading-snug">
                    <span className="num text-muted">{m.d}</span> {m.label}
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--pos)" }} />
          {labels.buy}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--neg)" }} />
          {labels.sell}
        </span>
      {kinds.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className="chip py-1 text-[12px]"
              aria-pressed={!off.has(k)}
              onClick={() => {
                const n = new Set(off);
                if (n.has(k)) n.delete(k);
                else n.add(k);
                setOff(n);
              }}
            >
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: EVENT_COLOR[k] }} />
              {labels.events[k]}
            </button>
          ))}
        </div>
      ) : null}
      </div>
      <p className="mt-2 text-[11px] text-faint">{labels.hint}</p>

      {/* ---------------------------------------------------------------- details */}
      {selEvent ? (
        <div className="well mt-4 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="num text-muted">{selEvent.d}</span>
            <span className="font-semibold" style={{ color: EVENT_COLOR[selEvent.k] }}>
              {labels.events[selEvent.k]}
            </span>
          </div>
          <div className="mt-1 text-[15px] font-semibold">{selEvent.label}</div>
          {selEvent.sub ? <p className="mt-1 text-[13px] text-muted">{selEvent.sub}</p> : null}
          {selEvent.href ? (
            <a className="link mt-2 inline-block text-[13px]" href={selEvent.href} target="_blank" rel="noopener noreferrer">
              {labels.source} ↗
            </a>
          ) : null}
        </div>
      ) : null}
      {selItems.length ? (
        w < 520 && mounted ? (
          createPortal(
            <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
              <button type="button" aria-label="close" className="absolute inset-0 bg-black/30" onClick={() => pick(null)} />
              <div
                className="sheet float relative max-h-[72vh] w-full overflow-y-auto rounded-t-[28px] px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]"
                style={{ transform: sheetY ? `translateY(${sheetY}px)` : undefined }}
              >
                <div
                  className="sticky top-0 z-10 -mx-4 flex cursor-grab touch-none flex-col items-center px-4 pt-1 pb-3"
                  onPointerDown={(e) => {
                    sheetDrag.current = e.clientY;
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={(e) => sheetDrag.current != null && setSheetY(Math.max(0, e.clientY - sheetDrag.current))}
                  onPointerUp={() => {
                    if (sheetY > 90) pick(null);
                    sheetDrag.current = null;
                    setSheetY(0);
                  }}
                >
                  <span className="h-1.5 w-10 rounded-full bg-surface-3" />
                  <span className="mt-2 text-[12px] text-muted">{fmtN(labels.trades, selItems.length)}</span>
                </div>
                {detail}
              </div>
            </div>,
            document.body,
          )
        ) : (
          detail
        )
      ) : null}
    </div>
  );
}
