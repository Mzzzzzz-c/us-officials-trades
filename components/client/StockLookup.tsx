"use client";

// "Is anyone trading my stock?" Type a ticker or a company name, get the answer in one card,
// ready to share.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "../media";
import { PosterButton } from "./Share";

type Row = [string, string, string | null, string, number, number, number, number, number, string | null, number, number, number, number, number | null, number | null];
export interface LookupLabels {
  placeholder: string;
  hint: string;
  none: string;
  year: string;
  buys: string;
  sells: string;
  officials: string;
  quiet: string;
  buying: string;
  selling: string;
  mixed: string;
  record: string;
  open: string;
  poster: string;
  examples: string;
}

const f = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export default function StockLookup({ locale, labels, share, logos, examples }: { locale: "zh" | "en"; labels: LookupLabels; share: React.ComponentProps<typeof PosterButton>["labels"]; logos: Record<string, number>; examples: string[] }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pick, setPick] = useState<Row | null>(null);
  const [hi, setHi] = useState(0);
  const loading = useRef(false);

  const load = () => {
    if (rows || loading.current) return;
    loading.current = true;
    fetch("/exports/tickers.json")
      .then((r) => r.json())
      .then((d: { rows: Row[] }) => setRows(d.rows))
      .catch(() => (loading.current = false));
  };
  const name = (r: Row) => (locale === "zh" && r[2]) || r[1];
  const found = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n || !rows) return [];
    const starts = rows.filter((r) => r[0].toLowerCase().startsWith(n));
    const rest = rows.filter((r) => !r[0].toLowerCase().startsWith(n) && (r[1].toLowerCase().includes(n) || (r[2] ?? "").includes(q.trim())));
    return [...starts, ...rest].slice(0, 6);
  }, [q, rows]);
  useEffect(() => setHi(0), [q]);

  const choose = (r: Row) => {
    setPick(r);
    setQ("");
  };
  const byExample = (sym: string) => {
    load();
    const go = (list: Row[]) => {
      const r = list.find((x) => x[0] === sym);
      if (r) setPick(r);
    };
    if (rows) go(rows);
    else
      fetch("/exports/tickers.json")
        .then((r) => r.json())
        .then((d: { rows: Row[] }) => {
          setRows(d.rows);
          go(d.rows);
        })
        .catch(() => {});
  };

  const b = pick?.[12] ?? 0, s = pick?.[13] ?? 0;
  const verdict = !pick ? "" : b + s === 0 ? labels.quiet : b > s * 1.5 ? labels.buying : s > b * 1.5 ? labels.selling : labels.mixed;
  const tone = b + s === 0 ? "var(--muted)" : b > s * 1.5 ? "var(--pos)" : s > b * 1.5 ? "var(--neg)" : "var(--warn)";

  return (
    <div>
      <div className="relative">
        <div className="search-field">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden className="shrink-0 text-faint">
            <circle cx="9" cy="9" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13.6 13.6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
            value={q}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            onFocus={load}
            onChange={(e) => {
              load();
              setQ(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setHi((x) => Math.min(found.length - 1, x + 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setHi((x) => Math.max(0, x - 1)));
              else if (e.key === "Enter" && found[hi]) choose(found[hi]);
              else if (e.key === "Escape") setQ("");
            }}
          />
        </div>
        {q.trim() ? (
          <ul className="float absolute top-full right-0 left-0 z-20 mt-2 overflow-hidden rounded-2xl p-1.5" role="listbox">
            {found.length ? (
              found.map((r, k) => (
                <li key={r[0]}>
                  <button type="button" role="option" aria-selected={k === hi} onMouseEnter={() => setHi(k)} onClick={() => choose(r)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${k === hi ? "bg-surface-2" : ""}`}>
                    <Logo sym={r[0]} kind={logos[r[0]]} size={28} />
                    <span className="font-semibold">{r[0]}</span>
                    <span className="truncate text-muted">{name(r)}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-3 text-sm text-muted">{rows ? labels.none : "…"}</li>
            )}
          </ul>
        ) : null}
      </div>
      {!pick ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <span>{labels.examples}</span>
          {examples.map((sym) => (
            <button key={sym} type="button" className="chip py-1" onClick={() => byExample(sym)}>
              <Logo sym={sym} kind={logos[sym]} size={18} />
              <span className="font-semibold">{sym}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card fade-up mt-4 p-5 sm:p-6" key={pick[0]}>
          <div className="flex flex-wrap items-center gap-4">
            <Logo sym={pick[0]} kind={logos[pick[0]]} size={52} />
            <div className="min-w-0 flex-1">
              <div className="text-[22px] leading-tight font-semibold tracking-tight">{pick[0]}</div>
              <div className="truncate text-sm text-muted">{name(pick)}</div>
            </div>
            <span className="rounded-full px-3 py-1 text-[13px] font-semibold text-white" style={{ background: tone }}>
              {verdict}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4">
            <div>
              <div className="num text-[30px] leading-none font-semibold text-pos">{b}</div>
              <div className="mt-1 text-xs text-muted">{labels.year} · {labels.buys}</div>
            </div>
            <div>
              <div className="num text-[30px] leading-none font-semibold text-neg">{s}</div>
              <div className="mt-1 text-xs text-muted">{labels.year} · {labels.sells}</div>
            </div>
            <div>
              <div className="num text-[30px] leading-none font-semibold">{pick[7]}</div>
              <div className="mt-1 text-xs text-muted">{labels.officials}</div>
            </div>
          </div>
          {b + s > 0 ? (
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="bg-pos transition-[width] duration-700" style={{ width: `${(b / (b + s)) * 100}%` }} />
              <div className="ml-0.5 flex-1 bg-neg" />
            </div>
          ) : null}
          {pick[14] != null && pick[15] != null ? <p className="mt-3 text-[13px] text-muted">{f(labels.record, { w: `${Math.round(pick[14] * 100)}%`, x: `${pick[15] >= 0 ? "+" : ""}${(pick[15] * 100).toFixed(1)}%` })}</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href={`/${locale}/ticker/${encodeURIComponent(pick[0])}#timeline`} className="btn btn-primary text-[14px]">
              {labels.open} ›
            </Link>
            <PosterButton src={`/${locale}/poster/ticker/${encodeURIComponent(pick[0])}`} path={`/${locale}/ticker/${encodeURIComponent(pick[0])}`} text={`${pick[0]} ${name(pick)}`} labels={share} label={labels.poster} />
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-faint">{labels.hint}</p>
    </div>
  );
}
