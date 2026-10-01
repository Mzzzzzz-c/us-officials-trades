"use client";
// Cached loaders for the static files the browser reads: the search index and the export datasets.
import type { Cell } from "./exportkit";

export type P = [string, string, string, string, string, 0 | 1, number];
export type S = [string, string, string, 0 | 1 | 2 | 3, number];
export type I = [string, string, string, string, 0 | 1];
export interface SearchIndex {
  p: P[];
  s: S[];
  i: I[];
}

const memo = new Map<string, Promise<unknown>>();
function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = make().catch((e) => {
      memo.delete(key);
      throw e;
    });
    memo.set(key, p);
  }
  return p;
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

export const loadIndex = (locale: string) => once(`idx:${locale}`, () => json<SearchIndex>(`/api/search/${locale}`));

/** An export dataset as objects keyed by column name. */
export const loadSet = (name: string) =>
  once(`set:${name}`, async () => {
    const d = await json<{ cols: string[]; rows: Cell[][] }>(`/exports/${name}.json`);
    return d.rows.map((r) => Object.fromEntries(d.cols.map((k, i) => [k, r[i]])) as Record<string, Cell>);
  });

export interface FeedRow {
  id: string;
  m: string;
  ch: "H" | "S" | "E";
  sym: string | null;
  asset: string | null;
  type: string;
  act: string | null;
  fil: string;
  tx: string | null;
  amin: number | null;
  amax: number | null;
}
export const loadFeed = () => loadSet("feed") as unknown as Promise<FeedRow[]>;
