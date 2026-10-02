"use client";
// The follow list lives only in this browser (localStorage): no account, nothing sent anywhere.
import { useSyncExternalStore } from "react";

export interface Watch {
  /** followed officials (member ids) */
  m: string[];
  /** followed stocks (symbols) */
  s: string[];
  /** followed company insiders (SEC numbers) */
  i: string[];
  /** newest filing date already seen on the following page */
  seen: string;
}

const KEY = "otw:v1";
const EVENT = "otw-change";
const EMPTY: Watch = { m: [], s: [], i: [], seen: "" };
let cache: Watch | null = null;
let raw: string | null = null;

function read(): Watch {
  if (typeof window === "undefined") return EMPTY;
  let r: string | null = null;
  try {
    r = window.localStorage.getItem(KEY);
  } catch {
    r = null;
  }
  if (r === raw && cache) return cache;
  raw = r;
  try {
    const v = r ? (JSON.parse(r) as Partial<Watch>) : {};
    cache = { m: Array.isArray(v.m) ? v.m : [], s: Array.isArray(v.s) ? v.s : [], i: Array.isArray(v.i) ? v.i : [], seen: typeof v.seen === "string" ? v.seen : "" };
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(w: Watch) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    // private mode or storage full: keep it for this page view
    cache = w;
    raw = null;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const on = (e: Event) => {
    if (e instanceof StorageEvent && e.key !== KEY) return;
    cb();
  };
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener("storage", on);
  };
}

export function useWatch(): Watch {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function toggleWatch(kind: "m" | "s" | "i", id: string): boolean {
  const w = read();
  const on = w[kind].includes(id);
  write({ ...w, [kind]: on ? w[kind].filter((x) => x !== id) : [id, ...w[kind]] });
  return !on;
}

export function markSeen(date: string) {
  const w = read();
  if (date && date > w.seen) write({ ...w, seen: date });
}

/** Feed URL for the officials and stocks given (relative to the site). */
export function feedUrl(locale: string, m: string[], s: string[]): string {
  const q = new URLSearchParams();
  if (m.length) q.set("m", m.join(","));
  if (s.length) q.set("s", s.join(","));
  const qs = q.toString();
  return `/feed/${locale}.xml${qs ? `?${qs}` : ""}`;
}
