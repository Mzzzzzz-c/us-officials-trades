"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type FeedRow, loadFeed } from "@/lib/clientdata";
import { markSeen, toggleWatch, useWatch, type Watch } from "@/lib/watch";

export function StarIcon({ filled, size = 16 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 2.6l2.27 4.6 5.08.74-3.68 3.58.87 5.06L10 14.19l-4.54 2.39.87-5.06L2.65 7.94l5.08-.74L10 2.6z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Follow / Following toggle for an official ("m") or a stock ("s"). */
export function FollowButton({ kind, id, labels, compact = false }: { kind: "m" | "s"; id: string; labels: { follow: string; following: string; unfollow: string }; compact?: boolean }) {
  const w = useWatch();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const on = mounted && w[kind].includes(id);
  const click = () => {
    // the first follow starts the "new since" clock today, so the whole past year isn't "new"
    if (!w.seen) markSeen(new Date().toISOString().slice(0, 10));
    toggleWatch(kind, id);
  };
  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={on}
      title={on ? labels.unfollow : labels.follow}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium transition-colors ${compact ? "px-3 py-1 text-[13px]" : "px-4 py-2 text-[15px]"} ${
        on ? "bg-accent-soft text-accent" : "bg-surface-2 text-text hover:bg-surface-3"
      }`}
    >
      <StarIcon filled={on} size={compact ? 14 : 16} />
      {on ? labels.following : labels.follow}
    </button>
  );
}

/** Rows of the feed that concern what the visitor follows. */
export function followedRows(feed: FeedRow[], w: Watch): FeedRow[] {
  const m = new Set(w.m), s = new Set(w.s);
  return feed.filter((r) => m.has(r.m) || (r.sym != null && s.has(r.sym)));
}

function useNewCount(): number {
  const w = useWatch();
  const [n, setN] = useState(0);
  const any = w.m.length + w.s.length > 0;
  useEffect(() => {
    if (!any || !w.seen) {
      setN(0);
      return;
    }
    let live = true;
    loadFeed()
      .then((feed) => live && setN(followedRows(feed, w).filter((r) => r.fil > w.seen).length))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [any, w]);
  return n;
}

/** Star in the menu bar, with the number of new filings for what the visitor follows. */
export function FollowNav({ href, label }: { href: string; label: string }) {
  const n = useNewCount();
  return (
    <Link href={href} prefetch={false} aria-label={n ? `${label} (${n})` : label} title={label} className="relative inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text">
      <StarIcon size={17} />
      {n ? (
        <span className="num absolute -top-0.5 -right-0.5 min-w-[16px] rounded-full bg-[#ff3b30] px-1 text-center text-[10px] leading-4 font-semibold text-white">
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}

/** A quiet banner on the home page when there is something new. */
export function FollowStrip({ href, text, cta }: { href: string; text: string; cta: string }) {
  const n = useNewCount();
  if (!n) return null;
  return (
    <Link href={href} prefetch={false} className="fade-up mt-6 flex items-center justify-between gap-4 rounded-2xl bg-accent-soft px-5 py-3.5 text-[15px] text-accent">
      <span className="flex items-center gap-2 font-medium">
        <StarIcon filled size={16} /> {text.replace("{n}", String(n))}
      </span>
      <span className="font-semibold">{cta}</span>
    </Link>
  );
}
