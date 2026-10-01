"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Logo } from "@/components/media";

type P = [string, string, string, string, string, 0 | 1, number];
type S = [string, string, string, 0 | 1 | 2 | 3, number];
type I = [string, string, string, string, 0 | 1];
interface Index {
  p: P[];
  s: S[];
  i: I[];
}

interface Hit {
  key: string;
  href: string;
  kind: "p" | "s" | "i";
  score: number;
  row: P | S | I;
}

export interface SearchLabels {
  placeholder: string;
  officials: string;
  stocks: string;
  investors: string;
  empty: string;
  hint: string;
  open: string;
}

const cache: Partial<Record<string, Promise<Index>>> = {};
function load(locale: string): Promise<Index> {
  cache[locale] ??= fetch(`/api/search/${locale}`).then((r) => r.json());
  return cache[locale]!;
}

const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[·•.\s]/g, "");

function score(q: string, fields: string[], exact?: string): number {
  if (exact && exact.toLowerCase() === q) return 100;
  let best = 0;
  for (const f of fields) {
    if (!f) continue;
    const n = norm(f);
    if (n === q) best = Math.max(best, 90);
    else if (n.startsWith(q)) best = Math.max(best, 70);
    else if (n.includes(q)) best = Math.max(best, 40);
  }
  return best;
}

/** Opens the search palette from anywhere (the hero's search field uses this). */
export function openSearch() {
  window.dispatchEvent(new Event("open-search"));
}

/** The magnifier in the global nav. */
export function SearchButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={openSearch} aria-label={label} title={`${label} (⌘K)`} className="-m-1 rounded-full p-1.5 text-muted transition-colors hover:text-ink">
      <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden>
        <circle cx="9" cy="9" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13.6 13.6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** A search field that opens the palette: looks like an input, behaves like a button. */
export function SearchField({ label, className = "" }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={openSearch} className={`search-field ${className}`}>
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden className="shrink-0 text-faint">
        <circle cx="9" cy="9" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13.6 13.6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="flex-1 truncate text-left">{label}</span>
      <kbd className="hidden rounded-md border border-hair px-1.5 py-0.5 text-[11px] text-faint sm:inline">⌘K</kbd>
    </button>
  );
}

/** Command-palette search over officials, stocks and investors (⌘K, Ctrl+K or "/"). */
export default function SearchPalette({ locale, labels }: { locale: string; labels: SearchLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState<Index | null>(null);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    load(locale).then(setIdx).catch(() => setIdx({ p: [], s: [], i: [] }));
    setTimeout(() => input.current?.focus(), 10);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open, locale]);

  const hits = useMemo<Hit[]>(() => {
    if (!idx) return [];
    const nq = norm(q.trim());
    const L = (x: string) => `/${locale}${x}`;
    if (!nq) {
      // nothing typed yet: the most active officials and most traded stocks
      const ps = [...idx.p].sort((a, b) => b[6] - a[6]).slice(0, 5);
      const ss = [...idx.s].sort((a, b) => b[4] - a[4]).slice(0, 5);
      return [
        ...ps.map((r) => ({ key: "p" + r[0], href: L(`/member/${r[0]}`), kind: "p" as const, score: 1, row: r })),
        ...ss.map((r) => ({ key: "s" + r[0], href: L(`/ticker/${r[0]}`), kind: "s" as const, score: 1, row: r })),
      ];
    }
    const out: Hit[] = [];
    for (const r of idx.p) {
      const sc = score(nq, [r[1], r[2], r[3]]);
      if (sc) out.push({ key: "p" + r[0], href: L(`/member/${r[0]}`), kind: "p", score: sc + Math.min(10, r[6] / 100), row: r });
    }
    for (const r of idx.s) {
      const sc = score(nq, [r[0], r[1], r[2]], r[0]);
      if (sc) out.push({ key: "s" + r[0], href: L(`/ticker/${r[0]}`), kind: "s", score: sc + Math.min(10, r[4] / 50), row: r });
    }
    for (const r of idx.i) {
      const sc = score(nq, [r[1], r[2], r[3]]);
      if (sc) out.push({ key: "i" + r[0], href: L(`/investor/${r[0]}`), kind: "i", score: sc + 5, row: r });
    }
    out.sort((a, b) => b.score - a.score);
    // keep groups together in a stable order: officials, stocks, investors
    const top = out.slice(0, 24);
    const order = { p: 0, s: 1, i: 2 } as const;
    return top.sort((a, b) => order[a.kind] - order[b.kind] || b.score - a.score);
  }, [idx, q, locale]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const go = useCallback(
    (h?: Hit) => {
      if (!h) return;
      setOpen(false);
      setQ("");
      router.push(h.href);
    },
    [router],
  );

  if (!open) return null;
  const groupLabel = { p: labels.officials, s: labels.stocks, i: labels.investors };
  let last: string | null = null;

  return (
    <>
      <div className="palette-backdrop" onClick={() => setOpen(false)} aria-hidden />
      <div className="palette" role="dialog" aria-modal="true" aria-label={labels.open}>
        <div className="relative border-b border-hair">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="absolute top-1/2 left-5 -translate-y-1/2 text-faint">
            <circle cx="9" cy="9" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13.6 13.6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(hits.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(hits[sel]);
              }
            }}
          />
        </div>
        <div ref={list} id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
          {idx && hits.length === 0 ? <div className="px-5 py-10 text-center text-muted">{labels.empty}</div> : null}
          {!idx ? (
            <div className="space-y-2 px-5 py-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-10" />
              ))}
            </div>
          ) : null}
          {hits.map((h, i) => {
            const head = h.kind !== last ? groupLabel[h.kind] : null;
            last = h.kind;
            return (
              <div key={h.key}>
                {head ? <div className="px-5 pt-3 pb-1 text-[12px] font-semibold text-faint">{head}</div> : null}
                <a
                  href={h.href}
                  data-i={i}
                  role="option"
                  aria-selected={i === sel}
                  className="palette-item mx-2 flex items-center gap-3 rounded-xl px-3 py-2"
                  onMouseMove={() => setSel(i)}
                  onClick={(e) => {
                    e.preventDefault();
                    go(h);
                  }}
                >
                  {h.kind === "p" ? <PersonHit r={h.row as P} /> : h.kind === "s" ? <StockHit r={h.row as S} /> : <InvestorHit r={h.row as I} />}
                </a>
              </div>
            );
          })}
        </div>
        <div className="hidden border-t border-hair px-5 py-2.5 text-[12px] text-faint sm:block">{labels.hint}</div>
      </div>
    </>
  );
}

function PersonHit({ r }: { r: P }) {
  return (
    <>
      <Avatar id={r[0]} name={r[2]} party={r[4]} has={r[5] === 1} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{r[1]}</div>
        <div className="truncate text-xs text-muted">
          {r[1] !== r[2] ? `${r[2]} · ` : ""}
          {r[3]}
        </div>
      </div>
    </>
  );
}

function StockHit({ r }: { r: S }) {
  return (
    <>
      <Logo sym={r[0]} kind={r[3] || undefined} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">
          {r[0]} <span className="font-normal text-muted">{r[1]}</span>
        </div>
        {r[2] ? <div className="truncate text-xs text-muted">{r[2]}</div> : null}
      </div>
    </>
  );
}

function InvestorHit({ r }: { r: I }) {
  return (
    <>
      <Avatar id={`inv-${r[0]}`} name={r[1] || r[3]} has={r[4] === 1} size={32} ring={false} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{r[1]}</div>
        <div className="truncate text-xs text-muted">{r[2]}</div>
      </div>
    </>
  );
}
