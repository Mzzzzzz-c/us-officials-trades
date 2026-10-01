"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface LiveQuote {
  s: string;
  p: number;
  pc: number | null;
  ch: number | null;
  hi?: number;
  lo?: number;
  h52?: number;
  l52?: number;
  t: number;
  st: "open" | "pre" | "post" | "closed";
  spark?: number[];
  xp?: number;
  xch?: number;
}

interface Ctx {
  quotes: Record<string, LiveQuote>;
  register: (syms: string[]) => void;
}

const QuoteCtx = createContext<Ctx>({ quotes: {}, register: () => {} });

/** Collects every symbol shown on the page, fetches them in one request and refreshes while the market is open. */
export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const wanted = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const syms = Array.from(wanted.current);
    if (!syms.length) return;
    const out: Record<string, LiveQuote> = {};
    for (let i = 0; i < syms.length; i += 60) {
      try {
        const r = await fetch(`/api/quotes?s=${encodeURIComponent(syms.slice(i, i + 60).join(","))}`);
        if (r.ok) Object.assign(out, (await r.json()).q);
      } catch {
        // offline or blocked: keep the static prices
      }
    }
    setQuotes((prev) => ({ ...prev, ...out }));
    const open = Object.values(out).some((q) => q.st !== "closed");
    if (loop.current) clearTimeout(loop.current);
    loop.current = setTimeout(load, open ? 30_000 : 300_000);
  }, []);

  const register = useCallback(
    (syms: string[]) => {
      let added = false;
      for (const s of syms) {
        if (s && !wanted.current.has(s)) {
          wanted.current.add(s);
          added = true;
        }
      }
      if (added) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 60);
      }
    },
    [load],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (loop.current) clearTimeout(loop.current);
    },
    [],
  );

  const value = useMemo(() => ({ quotes, register }), [quotes, register]);
  return <QuoteCtx.Provider value={value}>{children}</QuoteCtx.Provider>;
}

export function useQuote(sym?: string | null): LiveQuote | undefined {
  const { quotes, register } = useContext(QuoteCtx);
  useEffect(() => {
    if (sym) register([sym]);
  }, [sym, register]);
  return sym ? quotes[sym] : undefined;
}

export function useQuotes(syms: string[]): Record<string, LiveQuote> {
  const { quotes, register } = useContext(QuoteCtx);
  const key = syms.join(",");
  useEffect(() => {
    register(key ? key.split(",") : []);
  }, [key, register]);
  return quotes;
}

function fmtPrice(p: number): string {
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: p < 1 ? 4 : 2 });
}

function usePrevFlash(v?: number) {
  const prev = useRef<number | undefined>(undefined);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (v != null && prev.current != null && v !== prev.current) {
      setCls(v > prev.current ? "flash-up" : "flash-down");
      const t = setTimeout(() => setCls(""), 1300);
      prev.current = v;
      return () => clearTimeout(t);
    }
    prev.current = v;
  }, [v]);
  return cls;
}

/** Price with daily change; starts from the static close and switches to the live quote. */
export function LivePrice({
  sym,
  fallback,
  fallbackPrev,
  size = "sm",
  showChange = true,
  align = "right",
}: {
  sym: string;
  fallback?: number;
  fallbackPrev?: number;
  size?: "sm" | "md" | "lg" | "xl";
  showChange?: boolean;
  align?: "left" | "right";
}) {
  const q = useQuote(sym);
  const p = q?.p ?? fallback;
  const pc = q?.pc ?? fallbackPrev;
  const ch = q?.ch ?? (p != null && pc ? p / pc - 1 : null);
  const flash = usePrevFlash(q?.p);
  if (p == null) return <span className="text-faint">—</span>;
  const tone = ch == null ? "text-muted" : ch > 0.00005 ? "text-pos" : ch < -0.00005 ? "text-neg" : "text-muted";
  const sz = { sm: "text-sm", md: "text-base", lg: "text-2xl font-semibold", xl: "text-5xl font-semibold tracking-tight" }[size];
  return (
    <span className={`inline-flex flex-col ${align === "right" ? "items-end" : "items-start"}`}>
      <span className={`num ${sz} ${flash}`}>{fmtPrice(p)}</span>
      {showChange && ch != null ? (
        <span className={`num ${size === "xl" ? "text-lg font-medium" : size === "lg" ? "text-sm font-medium" : "text-xs"} ${tone}`}>
          {size === "xl" || size === "lg" ? `${ch >= 0 ? "+" : ""}${(p - (pc ?? p)).toFixed(2)} ` : ""}
          {ch >= 0 ? "+" : ""}
          {(ch * 100).toFixed(2)}%
        </span>
      ) : null}
    </span>
  );
}

/** A small pill with the day's change. */
export function LiveChange({ sym, fallback, fallbackPrev, pill = true }: { sym: string; fallback?: number; fallbackPrev?: number; pill?: boolean }) {
  const q = useQuote(sym);
  const p = q?.p ?? fallback;
  const pc = q?.pc ?? fallbackPrev;
  const ch = q?.ch ?? (p != null && pc ? p / pc - 1 : null);
  if (ch == null) return <span className="text-xs text-faint">—</span>;
  const up = ch > 0.00005;
  const down = ch < -0.00005;
  if (!pill) return <span className={`num text-xs ${up ? "text-pos" : down ? "text-neg" : "text-muted"}`}>{`${ch >= 0 ? "+" : ""}${(ch * 100).toFixed(2)}%`}</span>;
  return (
    <span className={`num inline-block min-w-[62px] rounded-md px-1.5 py-0.5 text-center text-xs font-semibold text-white ${up ? "bg-pos" : down ? "bg-neg" : "bg-faint"}`}>
      {`${ch >= 0 ? "+" : ""}${(ch * 100).toFixed(2)}%`}
    </span>
  );
}

/** Market state: a pulsing dot while US markets trade. */
export function MarketState({ labels }: { labels: { open: string; pre: string; post: string; closed: string } }) {
  const q = useQuote("SPY");
  if (!q) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      {q.st === "open" ? <span className="live-dot" /> : <span className="h-[7px] w-[7px] rounded-full bg-faint" />}
      {labels[q.st]}
    </span>
  );
}

/** Return since an entry price, updating with the live quote. */
export function LiveSince({ sym, entry, fallback }: { sym: string; entry?: number | null; fallback?: number }) {
  const q = useQuote(sym);
  const p = q?.p ?? fallback;
  if (!entry || p == null) return <span className="text-faint">—</span>;
  const r = p / entry - 1;
  return <span className={`num ${r > 0.0005 ? "text-pos" : r < -0.0005 ? "text-neg" : "text-muted"}`}>{`${r >= 0 ? "+" : ""}${(r * 100).toFixed(1)}%`}</span>;
}

/** Day and 52-week ranges as thin bars with a marker at the current price. */
export function QuoteRanges({ sym, labels }: { sym: string; labels: { day: string; wk52: string } }) {
  const q = useQuote(sym);
  if (!q) return null;
  const bar = (lo?: number, hi?: number) => {
    if (lo == null || hi == null || hi <= lo) return null;
    const x = Math.max(0, Math.min(1, (q.p - lo) / (hi - lo)));
    return (
      <div>
        <div className="relative mt-2 h-1.5 rounded-full bg-surface-3">
          <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-[var(--bg-elev)]" style={{ left: `${x * 100}%` }} />
        </div>
        <div className="num mt-1.5 flex justify-between text-[11px] text-faint">
          <span>${lo.toFixed(2)}</span>
          <span>${hi.toFixed(2)}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <div className="text-xs text-muted">{labels.day}</div>
        {bar(q.lo, q.hi)}
      </div>
      <div>
        <div className="text-xs text-muted">{labels.wk52}</div>
        {bar(q.l52, q.h52)}
      </div>
    </div>
  );
}

/** Pre-market or after-hours price, shown under the regular price while those sessions trade. */
export function ExtendedPrice({ sym, labels }: { sym: string; labels: { pre: string; post: string } }) {
  const q = useQuote(sym);
  if (!q || q.xp == null || (q.st !== "pre" && q.st !== "post")) return null;
  const ch = q.xch ?? 0;
  return (
    <span className="num text-xs text-muted">
      {q.st === "pre" ? labels.pre : labels.post} {fmtPrice(q.xp)}{" "}
      <span className={ch > 0.00005 ? "text-pos" : ch < -0.00005 ? "text-neg" : ""}>
        {ch >= 0 ? "+" : ""}
        {(ch * 100).toFixed(2)}%
      </span>
    </span>
  );
}
