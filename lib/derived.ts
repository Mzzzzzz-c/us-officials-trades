import "server-only";
// Summaries written by scripts/build-exports.mjs before each build (weekly reviews, committees).
import fs from "node:fs";
import path from "node:path";

export interface TradeCardLite {
  id: string;
  m: string;
  sym: string | null;
  asset: string | null;
  type: "P" | "S" | "SF" | "SP" | "E";
  act?: string | null;
  fil: string;
  tx: string | null;
  amin: number | null;
  amax: number | null;
  delay: number | null;
}
export interface Week {
  from: string;
  to: string;
  partial: boolean;
  n: number;
  officials: number;
  nb: number;
  ns: number;
  late: number;
  vmin: number;
  vmax: number;
  biggest: TradeCardLite[];
  active: { m: string; n: number; nb: number; ns: number; vmin: number; vmax: number }[];
  bought: { sym: string; nb: number; ns: number; nm: number; ms: string[] }[];
  sold: { sym: string; nb: number; ns: number; nm: number; ms: string[] }[];
  slowest: TradeCardLite[];
}
export interface Committee {
  id: string;
  name: string;
  members: { id: string; title: string | null; n: number; nov: number }[];
  n: number;
  nov: number;
  nb: number;
  ns: number;
  vmin: number;
  vmax: number;
  last: string | null;
  stocks: { sym: string; nb: number; ns: number; nm: number }[];
  recent: TradeCardLite[];
}

const cache = new Map<string, unknown>();
function read<T>(name: string, fallback: T): T {
  if (cache.has(name)) return cache.get(name) as T;
  let v = fallback;
  try {
    v = JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "public", "exports", name), "utf8")) as T;
  } catch {
    // the file is generated before every build; without it the pages show their empty state
  }
  cache.set(name, v);
  return v;
}

export const getWeekly = () => read<{ end: string; weeks: Week[] }>("weekly.json", { end: "", weeks: [] });
export const getCommittees = () => read<Committee[]>("committees.json", []);
