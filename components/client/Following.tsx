"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Logo } from "@/components/media";
import { type FeedRow, loadFeed, loadIndex, type P, type S } from "@/lib/clientdata";
import { amountRange } from "@/lib/format";
import { feedUrl, markSeen, toggleWatch, useWatch } from "@/lib/watch";
import { FollowButton, followedRows, StarIcon } from "./Follow";

type L = Record<string, string>;
interface Insider {
  id: number;
  filed: string;
  en: string;
  zh: string;
  title: string;
  rel: string;
  syms: string[];
  logo: number;
  photo: number;
  /** [trade date, filed, symbol, P|S, shares, price, value] */
  tx: [string, string, string, "P" | "S", number, number, number][];
}
const money = (n: number) => (n >= 999.5e6 ? `$${(n / 1e9).toFixed(2)}B` : n >= 999.5e3 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1000 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);

export default function Following({
  locale,
  t,
  types,
  site,
  popular,
}: {
  locale: "zh" | "en";
  t: L;
  types: Record<string, string>;
  site: string;
  popular: { m: string[]; s: string[] };
}) {
  const w = useWatch();
  const [mounted, setMounted] = useState(false);
  const [feed, setFeed] = useState<FeedRow[] | null>(null);
  const [idx, setIdx] = useState<{ p: Map<string, P>; s: Map<string, S> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState(40);
  const [ins, setIns] = useState<Insider[] | null>(null);
  // what counted as "seen" when the page opened; marking seen below must not hide the badges
  const seenAtOpen = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);
  const insiderKey = w.i.join(",");
  useEffect(() => {
    if (!insiderKey) {
      setIns([]);
      return;
    }
    let live = true;
    fetch(`/api/insiders?ids=${insiderKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { people: Insider[] }) => live && setIns(d.people))
      .catch(() => live && setIns([]));
    return () => {
      live = false;
    };
  }, [insiderKey]);
  useEffect(() => {
    Promise.all([loadFeed(), loadIndex(locale)])
      .then(([f, i]) => {
        setFeed(f);
        setIdx({ p: new Map(i.p.map((r) => [r[0], r])), s: new Map(i.s.map((r) => [r[0], r])) });
      })
      .catch(() => setFailed(true));
  }, [locale]);

  const rows = useMemo(() => (feed ? followedRows(feed, w) : []), [feed, w]);
  useEffect(() => {
    if (!mounted || !feed) return;
    if (seenAtOpen.current === null) seenAtOpen.current = w.seen;
    const newest = rows[0]?.fil;
    if (newest) markSeen(newest);
  }, [mounted, feed, rows, w.seen]);

  const L = (p: string) => `/${locale}${p}`;
  const any = w.m.length + w.s.length + w.i.length > 0;
  if (!mounted) return <div className="skeleton h-40 rounded-2xl" />;

  const person = (id: string) => idx?.p.get(id);
  const stock = (sym: string) => idx?.s.get(sym);
  const seen = seenAtOpen.current ?? w.seen;

  return (
    <div className="flex flex-col gap-12">
      {!any ? (
        <section className="card px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <StarIcon size={22} />
          </div>
          <h2 className="title-2">{t.empty}</h2>
          <p className="mt-2 text-muted">{t.emptySub}</p>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-2">
          <WatchList title={t.officials} empty={!w.m.length}>
            {w.m.map((id) => {
              const p = person(id);
              return (
                <Chip key={id} href={L(`/member/${id}`)} onRemove={() => toggleWatch("m", id)} removeLabel={t.unfollow}>
                  <Avatar id={id} name={p?.[1] ?? id} party={p?.[4]} has={p?.[5] === 1} size={28} />
                  <span className="truncate font-medium">{p?.[1] ?? id}</span>
                </Chip>
              );
            })}
          </WatchList>
          <WatchList title={t.stocks} empty={!w.s.length}>
            {w.s.map((sym) => {
              const s = stock(sym);
              return (
                <Chip key={sym} href={L(`/ticker/${encodeURIComponent(sym)}`)} onRemove={() => toggleWatch("s", sym)} removeLabel={t.unfollow}>
                  <Logo sym={sym} kind={s?.[3] || undefined} size={24} />
                  <span className="font-semibold">{sym}</span>
                  {s ? <span className="truncate text-muted">{s[1]}</span> : null}
                </Chip>
              );
            })}
          </WatchList>
        </section>
      )}

      {w.i.length ? (
        <section>
          <h2 className="title-1">{t.insiders}</h2>
          <p className="mt-2 mb-6 text-[15px] text-muted">{t.insidersSub}</p>
          {!ins ? (
            <div className="skeleton h-[120px] rounded-2xl" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {ins.map((p) => {
                const name = (locale === "zh" && p.zh) || p.en || p.filed;
                return (
                  <div key={p.id} className="card p-4">
                    <div className="flex items-center gap-3">
                      <Avatar id={`ins-${p.id}`} name={p.filed} has={p.photo === 1} size={44} />
                      <Link prefetch={false} href={L(`/insider/${p.id}`)} className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{name}</div>
                        <div className="truncate text-xs text-muted">
                          {p.syms.join(" · ")}
                          {p.title ? ` · ${p.title}` : ""}
                        </div>
                      </Link>
                      <FollowButton kind="i" id={String(p.id)} labels={{ follow: t.follow, following: t.following, unfollow: t.unfollow }} compact />
                    </div>
                    <ul className="mt-3 divide-y divide-hair text-[13px]">
                      {p.tx.map((r, k) => (
                        <li key={k} className="flex items-center gap-3 py-1.5">
                          <span className="num w-[84px] shrink-0 text-muted">{r[0]}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r[3] === "P" ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}>{r[3] === "P" ? types.P : types.S}</span>
                          <Link prefetch={false} href={L(`/ticker/${encodeURIComponent(r[2])}#insiders`)} className="font-semibold">
                            {r[2]}
                          </Link>
                          <span className="num ml-auto font-medium">{money(r[6])}</span>
                          {r[1] > seen ? <span className="size-1.5 shrink-0 rounded-full bg-accent" /> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {w.m.length + w.s.length > 0 ? (
        <section>
          <h2 className="title-1">{t.updates}</h2>
          <p className="mt-2 mb-6 text-[15px] text-muted">{t.updatesSub}</p>
          {failed ? (
            <p className="card px-5 py-8 text-center text-neg">{t.failed}</p>
          ) : !feed || !idx ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="skeleton h-[72px] rounded-2xl" />
              ))}
            </div>
          ) : !rows.length ? (
            <p className="card px-5 py-8 text-center text-muted">{t.none}</p>
          ) : (
            <>
              <ul className="card divide-y divide-hair overflow-hidden">
                {rows.slice(0, limit).map((r) => {
                  const p = person(r.m);
                  const s = r.sym ? stock(r.sym) : undefined;
                  const buy = r.type === "P";
                  const fresh = !!seen && r.fil > seen;
                  return (
                    <li key={r.id}>
                      <Link href={L(`/trade/${encodeURIComponent(r.id)}`)} prefetch={false} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:gap-4 sm:px-5">
                        <Avatar id={r.m} name={p?.[1] ?? r.m} party={p?.[4]} has={p?.[5] === 1} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold">{p?.[1] ?? r.m}</span>
                            {fresh ? <span className="shrink-0 rounded-full bg-[#ff3b30] px-1.5 text-[10px] leading-4 font-semibold text-white">{t.isNew}</span> : null}
                          </div>
                          <div className="truncate text-xs text-muted">{p?.[3]}</div>
                        </div>
                        <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold sm:inline ${buy ? "bg-pos-soft text-pos" : r.type === "E" ? "bg-surface-2 text-muted" : "bg-neg-soft text-neg"}`}>
                          {types[r.type] ?? r.type}
                        </span>
                        <div className="flex w-[34%] min-w-0 items-center gap-2.5 sm:w-[30%]">
                          {r.sym ? <Logo sym={r.sym} kind={s?.[3] || undefined} size={30} /> : null}
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-semibold">
                              <span className={`mr-1 sm:hidden ${buy ? "text-pos" : "text-neg"}`}>{buy ? "+" : "−"}</span>
                              {r.sym ?? r.asset}
                            </div>
                            <div className="num truncate text-xs text-muted">{amountRange(r.amin, r.amax)}</div>
                          </div>
                        </div>
                        <div className="num hidden w-[92px] shrink-0 text-right text-xs text-muted md:block">
                          <div>
                            {t.filed} {r.fil.slice(5)}
                          </div>
                          {r.tx ? (
                            <div className="text-faint">
                              {t.traded} {r.tx.slice(5)}
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {rows.length > limit ? (
                <div className="mt-4 text-center">
                  <button type="button" className="btn btn-quiet" onClick={() => setLimit(limit + 60)}>
                    {t.more}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {idx ? <Popular t={t} idx={idx} popular={popular} L={L} /> : null}

      <section className="card p-5 sm:p-6">
        <h2 className="title-2 flex items-center gap-2">
          <RssIcon /> {t.rssTitle}
        </h2>
        <p className="mt-2 mb-4 text-[14px] text-muted">{t.rssSub}</p>
        <div className="flex flex-col gap-3">
          <CopyRow label={t.rssAll} url={`${site}${feedUrl(locale, [], [])}`} t={t} />
          {any ? <CopyRow label={t.rssMine} url={`${site}${feedUrl(locale, w.m, w.s)}`} t={t} /> : null}
        </div>
      </section>
    </div>
  );
}

function WatchList({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
      {empty ? <p className="text-[14px] text-faint">—</p> : <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function Chip({ href, children, onRemove, removeLabel }: { href: string; children: React.ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full bg-surface-2 text-[14px]">
      <Link href={href} prefetch={false} className="flex min-w-0 items-center gap-2 py-1 pr-1 pl-1">
        {children}
      </Link>
      <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel} className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-3 hover:text-text">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}

function Popular({ t, idx, popular, L }: { t: L; idx: { p: Map<string, P>; s: Map<string, S> }; popular: { m: string[]; s: string[] }; L: (p: string) => string }) {
  const labels = { follow: t.follow, following: t.following, unfollow: t.unfollow };
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="title-2 mb-4">{t.popularOfficials}</h2>
        <ul className="card divide-y divide-hair">
          {popular.m.map((id) => {
            const p = idx.p.get(id);
            if (!p) return null;
            return (
              <li key={id} className="flex items-center gap-3 px-4 py-3">
                <Link href={L(`/member/${id}`)} prefetch={false} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar id={id} name={p[1]} party={p[4]} has={p[5] === 1} size={36} />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{p[1]}</div>
                    <div className="truncate text-xs text-muted">{p[3]}</div>
                  </div>
                </Link>
                <FollowButton kind="m" id={id} labels={labels} compact />
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h2 className="title-2 mb-4">{t.popularStocks}</h2>
        <ul className="card divide-y divide-hair">
          {popular.s.map((sym) => {
            const s = idx.s.get(sym);
            if (!s) return null;
            return (
              <li key={sym} className="flex items-center gap-3 px-4 py-3">
                <Link href={L(`/ticker/${encodeURIComponent(sym)}`)} prefetch={false} className="flex min-w-0 flex-1 items-center gap-3">
                  <Logo sym={sym} kind={s[3] || undefined} size={32} />
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold">{sym}</div>
                    <div className="truncate text-xs text-muted">{s[1]}</div>
                  </div>
                </Link>
                <FollowButton kind="s" id={sym} labels={labels} compact />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function CopyRow({ label, url, t }: { label: string; url: string; t: L }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="w-32 shrink-0 text-[13px] font-medium text-muted">{label}</div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input readOnly value={url} className="input num min-w-0 flex-1 text-[13px]" onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button
          type="button"
          className="btn btn-quiet shrink-0 text-[14px]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setDone(true);
              setTimeout(() => setDone(false), 1600);
            } catch {
              // clipboard blocked: the field is selectable
            }
          }}
        >
          {done ? t.copied : t.copy}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost shrink-0 text-[14px]">
          {t.rss}
        </a>
      </div>
    </div>
  );
}

function RssIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="text-[#ff9500]">
      <rect width="20" height="20" rx="5" fill="currentColor" />
      <circle cx="6" cy="14" r="1.7" fill="#fff" />
      <path d="M4.5 9.2a6.3 6.3 0 0 1 6.3 6.3M4.5 5a10.5 10.5 0 0 1 10.5 10.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
