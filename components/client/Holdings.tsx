"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarStack, Logo } from "@/components/media";
import { type FeedRow, type I, loadFeed, loadIndex, loadSet, type P, type S } from "@/lib/clientdata";
import type { Cell } from "@/lib/exportkit";
import { amountRange } from "@/lib/format";
import { FollowButton } from "./Follow";

type L = Record<string, string>;
type Obj = Record<string, Cell>;
const KEY = "oth:v1";
const EXAMPLES = ["NVDA", "AAPL", "MSFT", "TSLA", "GOOGL", "AMZN"];

function loadList(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 60) : [];
  } catch {
    return [];
  }
}
function saveList(v: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // storage unavailable: the list lasts for this visit
  }
}

interface Data {
  feed: FeedRow[];
  p: Map<string, P>;
  s: Map<string, S>;
  sList: S[];
  inv: Map<string, I>;
  stats: Map<string, Obj>;
  holders: Map<string, Obj[]>;
}

export default function Holdings({ locale, t, follow, types, sectors }: { locale: "zh" | "en"; t: L; follow: L; types: Record<string, string>; sectors: Record<string, string> }) {
  const zh = locale === "zh";
  const [list, setList] = useState<string[] | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setList(loadList()), []);
  useEffect(() => {
    Promise.all([loadFeed(), loadIndex(locale), loadSet("tickers"), loadSet("holdings")])
      .then(([feed, idx, tk, hold]) => {
        const holders = new Map<string, Obj[]>();
        for (const h of hold) {
          if (!h.sym) continue;
          const k = String(h.sym);
          (holders.get(k) ?? holders.set(k, []).get(k)!).push(h);
        }
        for (const v of holders.values()) v.sort((a, b) => Number(b.w ?? 0) - Number(a.w ?? 0));
        setData({
          feed,
          p: new Map(idx.p.map((r) => [r[0], r])),
          s: new Map(idx.s.map((r) => [r[0], r])),
          sList: idx.s,
          inv: new Map(idx.i.map((r) => [r[0], r])),
          stats: new Map(tk.map((r) => [String(r.sym), r])),
          holders,
        });
      })
      .catch(() => setFailed(true));
  }, [locale]);

  const update = (v: string[]) => {
    setList(v);
    saveList(v);
  };

  // suggestions: ticker prefix first, then names containing the text
  const sugg = useMemo(() => {
    const s = q.trim();
    if (!data || !s) return [];
    const up = s.toUpperCase();
    const low = s.toLowerCase();
    const out: S[] = [];
    for (const r of data.sList) if (r[0].startsWith(up)) out.push(r);
    out.sort((a, b) => (a[0] === up ? -1 : b[0] === up ? 1 : b[4] - a[4]));
    if (out.length < 8)
      for (const r of [...data.sList].sort((a, b) => b[4] - a[4]))
        if (!out.includes(r) && (r[1].toLowerCase().includes(low) || r[2].toLowerCase().includes(low))) {
          out.push(r);
          if (out.length >= 8) break;
        }
    return out.slice(0, 8);
  }, [q, data]);

  const add = (syms: string[]) => {
    if (!data || !list) return;
    const ok: string[] = [];
    const bad: string[] = [];
    for (const raw of syms) {
      const s = raw.trim().toUpperCase();
      if (!s) continue;
      if (data.s.has(s)) ok.push(s);
      else bad.push(s);
    }
    if (ok.length) update([...list.filter((x) => !ok.includes(x)), ...ok]);
    setMsg(bad.length ? `${bad.join(", ")}: ${t.notFound}` : "");
    setQ("");
    setHi(0);
  };

  const submit = () => {
    const parts = q.split(/[\s,，;；]+/).filter(Boolean);
    if (parts.length > 1) return add(parts);
    if (sugg.length) return add([sugg[Math.min(hi, sugg.length - 1)][0]]);
    if (parts.length) add(parts);
  };

  const L = (p: string) => `/${locale}${p}`;
  const nf = (n: number) => n.toLocaleString(zh ? "zh-CN" : "en-US");

  // ---------------------------------------------------------------- analysis
  const view = useMemo(() => {
    if (!data || !list?.length) return null;
    const mine = new Set(list);
    const rows = data.feed.filter((r) => r.sym && mine.has(r.sym));
    const per = new Map<string, { b: number; s: number; buyers: Map<string, number>; sellers: Map<string, number>; recent: FeedRow[] }>();
    const officials = new Map<string, { syms: Map<string, { b: number; s: number }>; b: number; s: number }>();
    for (const r of rows) {
      const sym = r.sym!;
      const buy = r.type === "P";
      const sell = r.type !== "P" && r.type !== "E";
      const x = per.get(sym) ?? per.set(sym, { b: 0, s: 0, buyers: new Map(), sellers: new Map(), recent: [] }).get(sym)!;
      if (buy) (x.b++, x.buyers.set(r.m, (x.buyers.get(r.m) ?? 0) + 1));
      if (sell) (x.s++, x.sellers.set(r.m, (x.sellers.get(r.m) ?? 0) + 1));
      if (x.recent.length < 4) x.recent.push(r);
      const o = officials.get(r.m) ?? officials.set(r.m, { syms: new Map(), b: 0, s: 0 }).get(r.m)!;
      const os = o.syms.get(sym) ?? o.syms.set(sym, { b: 0, s: 0 }).get(sym)!;
      if (buy) (os.b++, o.b++);
      if (sell) (os.s++, o.s++);
    }
    const overlap = [...officials.entries()]
      .map(([id, o]) => ({ id, ...o }))
      .sort((a, b) => b.syms.size - a.syms.size || b.b - b.s - (a.b - a.s) || b.b + b.s - (a.b + a.s))
      .slice(0, 8);
    const invs = new Set<string>();
    for (const s of list) for (const h of data.holders.get(s) ?? []) invs.add(String(h.inv));
    return {
      per,
      overlap,
      nOfficials: officials.size,
      b: rows.filter((r) => r.type === "P").length,
      s: rows.filter((r) => r.type !== "P" && r.type !== "E").length,
      nInv: invs.size,
    };
  }, [data, list]);

  if (list === null) return <div className="skeleton h-40 rounded-2xl" />;

  const person = (id: string) => data?.p.get(id);

  return (
    <div className="flex flex-col gap-12">
      {/* input */}
      <section className="card p-5 sm:p-6">
        <div className="relative">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex gap-2"
          >
            <input
              ref={input}
              className="input min-w-0 flex-1 text-[16px]"
              placeholder={t.placeholder}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => Math.min(h + 1, sugg.length - 1)));
                if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)));
                if (e.key === "Escape") setQ("");
              }}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label={t.placeholder}
              role="combobox"
              aria-expanded={sugg.length > 0}
              aria-controls="hold-sugg"
            />
            <button type="submit" className="btn btn-primary shrink-0" disabled={!data || !q.trim()}>
              {t.add}
            </button>
          </form>
          {sugg.length ? (
            <ul id="hold-sugg" role="listbox" className="absolute top-full right-0 left-0 z-20 mt-2 overflow-hidden rounded-2xl border border-hair bg-[var(--bg-elev)] shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
              {sugg.map((r, i) => (
                <li key={r[0]} role="option" aria-selected={i === hi}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === hi ? "bg-surface-2" : ""}`}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => {
                      add([r[0]]);
                      input.current?.focus();
                    }}
                  >
                    <Logo sym={r[0]} kind={r[3] || undefined} size={28} />
                    <span className="w-16 shrink-0 font-semibold">{r[0]}</span>
                    <span className="truncate text-muted">{r[1]}</span>
                    {list.includes(r[0]) ? <span className="ml-auto text-xs text-accent">✓</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {msg ? <p className="mt-3 text-[13px] text-warn">{msg}</p> : null}

        {list.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {list.map((s) => {
              const r = data?.s.get(s);
              return (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-1 pl-1 text-[14px]">
                  <Logo sym={s} kind={r?.[3] || undefined} size={22} />
                  <span className="font-semibold">{s}</span>
                  <button type="button" onClick={() => update(list.filter((x) => x !== s))} aria-label={`${t.remove} ${s}`} className="flex size-6 items-center justify-center rounded-full text-faint hover:bg-surface-3 hover:text-text">
                    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
              );
            })}
            <button type="button" className="btn-ghost ml-1 text-[13px]" onClick={() => update([])}>
              {t.clear}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {t.examples}
            {EXAMPLES.map((s) => (
              <button key={s} type="button" className="chip" disabled={!data} onClick={() => add([s])}>
                {s}
              </button>
            ))}
            <button type="button" className="btn-ghost text-[13px]" disabled={!data} onClick={() => add(EXAMPLES)}>
              + {EXAMPLES.length}
            </button>
          </div>
        )}
        <p className="mt-4 flex items-center gap-1.5 text-[12px] text-faint">
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          {t.privacy}
        </p>
      </section>

      {failed ? <p className="card px-5 py-8 text-center text-neg">{follow.failed}</p> : null}

      {!list.length ? (
        <p className="py-6 text-center text-muted">{t.emptyTitle}</p>
      ) : !data || !view ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* overview */}
          <section>
            <h2 className="title-1 mb-6">{t.summaryTitle}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat v={nf(list.length)} label={t.stocks} />
              <Stat v={nf(view.nOfficials)} label={t.officialsTrading} />
              <Stat v={<><span className="text-pos">{nf(view.b)}</span><span className="mx-1 text-faint">/</span><span className="text-neg">{nf(view.s)}</span></>} label={`${t.buys} / ${t.sells} · ${t.lastYear}`} />
              <Stat v={nf(view.nInv)} label={t.investorsHolding} />
            </div>
          </section>

          {/* officials overlapping */}
          {view.overlap.length ? (
            <section>
              <h2 className="title-1">{t.overlapTitle}</h2>
              <p className="mt-2 mb-6 text-[15px] text-muted">{t.overlapSub}</p>
              <ul className="grid gap-3 md:grid-cols-2">
                {view.overlap.map((o) => {
                  const p = person(o.id);
                  return (
                    <li key={o.id} className="card flex items-start gap-3 p-4">
                      <Link href={L(`/member/${o.id}`)} prefetch={false} className="shrink-0">
                        <Avatar id={o.id} name={p?.[1] ?? o.id} party={p?.[4]} has={p?.[5] === 1} size={44} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={L(`/member/${o.id}`)} prefetch={false} className="min-w-0">
                            <div className="truncate text-[15px] font-semibold">{p?.[1] ?? o.id}</div>
                            <div className="truncate text-xs text-muted">{p?.[3]}</div>
                          </Link>
                          <FollowButton kind="m" id={o.id} labels={{ follow: follow.follow, following: follow.following, unfollow: follow.unfollow }} compact />
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className="mr-1 text-[12px] font-medium text-muted">{t.stocksOverlap.replace("{n}", String(o.syms.size))}</span>
                          {[...o.syms.entries()].map(([sym, c]) => (
                            <span key={sym} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold">
                              {sym}
                              {c.b ? <span className="text-pos">+{c.b}</span> : null}
                              {c.s ? <span className="text-neg">−{c.s}</span> : null}
                            </span>
                          ))}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* stock by stock */}
          <section>
            <h2 className="title-1 mb-6">{t.perStock}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {list.map((sym) => {
                const r = data.s.get(sym);
                const st = data.stats.get(sym);
                const x = view.per.get(sym);
                const holders = data.holders.get(sym) ?? [];
                const total = (x?.b ?? 0) + (x?.s ?? 0);
                const people = (m: Map<string, number>) =>
                  [...m.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([id]) => {
                      const p = person(id);
                      return { id, name: p?.[1] ?? id, party: p?.[4], has: p?.[5] === 1 };
                    });
                return (
                  <article key={sym} className="card flex flex-col gap-5 p-5">
                    <header className="flex items-center gap-3">
                      <Logo sym={sym} kind={r?.[3] || undefined} size={44} />
                      <div className="min-w-0 flex-1">
                        <Link href={L(`/ticker/${encodeURIComponent(sym)}`)} prefetch={false} className="text-[17px] font-semibold hover:underline">
                          {sym}
                        </Link>
                        <div className="truncate text-[13px] text-muted">
                          {r?.[1]}
                          {st?.sec ? ` · ${sectors[String(st.sec)] ?? st.sec}` : ""}
                        </div>
                      </div>
                      <FollowButton kind="s" id={sym} labels={{ follow: follow.follow, following: follow.following, unfollow: follow.unfollow }} compact />
                    </header>

                    <div>
                      <div className="mb-2 flex items-baseline justify-between text-[13px]">
                        <span className="font-medium text-muted">{t.lastYear}</span>
                        <span className="num">
                          <span className="text-pos">
                            {nf(x?.b ?? 0)} {t.buys}
                          </span>
                          <span className="mx-2 text-faint">·</span>
                          <span className="text-neg">
                            {nf(x?.s ?? 0)} {t.sells}
                          </span>
                        </span>
                      </div>
                      {total ? (
                        <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
                          <div className="bg-pos" style={{ width: `${((x?.b ?? 0) / total) * 100}%` }} />
                          <div className="ml-0.5 flex-1 bg-neg" />
                        </div>
                      ) : (
                        <p className="text-[13px] text-faint">{t.noTrades}</p>
                      )}
                      {x && (x.buyers.size || x.sellers.size) ? (
                        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-muted">
                          <div>
                            <div className="mb-1.5">
                              {t.buyers} {x.buyers.size ? `(${x.buyers.size})` : ""}
                            </div>
                            {x.buyers.size ? <AvatarStack people={people(x.buyers)} size={26} max={6} /> : <span className="text-faint">—</span>}
                          </div>
                          <div>
                            <div className="mb-1.5">
                              {t.sellers} {x.sellers.size ? `(${x.sellers.size})` : ""}
                            </div>
                            {x.sellers.size ? <AvatarStack people={people(x.sellers)} size={26} max={6} /> : <span className="text-faint">—</span>}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {x?.recent.length ? (
                      <div>
                        <div className="mb-1.5 text-[13px] font-medium text-muted">{t.recent}</div>
                        <ul className="divide-y divide-hair">
                          {x.recent.map((tr) => {
                            const p = person(tr.m);
                            const buy = tr.type === "P";
                            return (
                              <li key={tr.id}>
                                <Link href={L(`/trade/${encodeURIComponent(tr.id)}`)} prefetch={false} className="flex items-center gap-2.5 py-2 text-[13px] hover:opacity-80">
                                  <Avatar id={tr.m} name={p?.[1] ?? tr.m} party={p?.[4]} has={p?.[5] === 1} size={24} />
                                  <span className="min-w-0 flex-1 truncate">{p?.[1] ?? tr.m}</span>
                                  <span className={`shrink-0 font-semibold ${buy ? "text-pos" : tr.type === "E" ? "text-muted" : "text-neg"}`}>{types[tr.type] ?? tr.type}</span>
                                  <span className="num w-[92px] shrink-0 text-right text-muted">{amountRange(tr.amin, tr.amax)}</span>
                                  <span className="num hidden w-[74px] shrink-0 text-right text-faint sm:inline">{tr.fil}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}

                    <div>
                      <div className="mb-2 text-[13px] font-medium text-muted">{t.heldBy}</div>
                      {holders.length ? (
                        <div className="flex flex-wrap gap-2">
                          {holders.slice(0, 6).map((h) => {
                            const v = data.inv.get(String(h.inv));
                            return (
                              <Link key={String(h.inv)} href={L(`/investor/${h.inv}`)} prefetch={false} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-2.5 pl-1 text-[12px] hover:bg-surface-3">
                                <Avatar id={`inv-${h.inv}`} name={v?.[1] ?? String(h.inv)} has={v?.[4] === 1} size={22} ring={false} />
                                <span className="font-medium">{v?.[1] ?? String(h.inv)}</span>
                                {h.w != null ? (
                                  <span className="num text-muted">
                                    {(Number(h.w) * 100).toFixed(1)}%
                                  </span>
                                ) : null}
                              </Link>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[13px] text-faint">{t.notHeld}</p>
                      )}
                    </div>

                    <div className="mt-auto rounded-xl bg-surface-2 px-4 py-3">
                      <div className="text-[12px] text-muted">{t.recordNote}</div>
                      {st?.win != null && st?.x90 != null ? (
                        <div className="mt-1.5 flex gap-6">
                          <div>
                            <span className="num text-[17px] font-semibold">{Math.round(Number(st.win) * 100)}%</span>
                            <span className="ml-1.5 text-[12px] text-muted">{t.win}</span>
                          </div>
                          <div>
                            <span className={`num text-[17px] font-semibold ${Number(st.x90) >= 0 ? "text-pos" : "text-neg"}`}>
                              {Number(st.x90) >= 0 ? "+" : ""}
                              {(Number(st.x90) * 100).toFixed(1)}%
                            </span>
                            <span className="ml-1.5 text-[12px] text-muted">{t.excess}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-[13px] text-faint">{t.noRecord}</div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ v, label }: { v: React.ReactNode; label: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="num text-[28px] font-semibold tracking-tight sm:text-[34px]">{v}</div>
      <div className="mt-1 text-[12px] leading-snug text-muted sm:text-[13px]">{label}</div>
    </div>
  );
}
