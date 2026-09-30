import "server-only";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------- types (mirror pipeline/otrack/build.py)

export type TradeType = "P" | "SF" | "SP" | "S" | "E";
export type Conf = "high" | "medium" | "low" | "reported" | "none";

export interface Est {
  d?: string; // trading day used
  p?: number; // typical / reported price (as traded that day)
  lo?: number;
  hi?: number;
  f?: number | null; // split factor: price_that_day = adjusted * f
  smin?: number;
  smax?: number;
  smid?: number;
  sh_rep?: boolean; // share count stated by the filer
  conf: Conf;
  why?: string;
}

export interface Entry {
  off: number; // official entry, today's share basis
  soff?: number; // SPY at official entry
  fold?: string; // follower entry date
  fol?: number; // follower entry (open)
  sfol?: number; // SPY open on follower entry date
}

export interface Trade {
  id: string;
  m: string;
  ch: "H" | "S" | "E";
  doc?: string;
  src: string;
  tx?: string;
  fil?: string;
  nd?: string;
  own: "SELF" | "SP" | "JT" | "DC";
  asset?: string;
  sym?: string | null;
  at?: string | null;
  type: TradeType;
  amin?: number | null;
  amax?: number | null;
  opt?: { kind?: string; strike?: number; exp?: string };
  desc?: string;
  sub?: string;
  amd?: boolean;
  delay?: number;
  est?: Est;
  ent?: Entry;
  h?: Record<string, [number | null, number | null, number | null, number | null]>;
  act?: string;
}

export interface MemberRow {
  id: string;
  name: string;
  zh?: string;
  party: string;
  chamber: "H" | "S" | "E";
  state: string;
  district?: number;
  current?: boolean;
  title?: string;
  agency?: string;
  title_zh?: string;
  agency_zh?: string;
  n: number;
  nb: number;
  ns: number;
  last?: string;
  lastf?: string;
  vmin: number;
  vmax: number;
  late: number;
  scanned: number;
}

export interface Committee {
  id: string;
  name: string;
  title?: string | null;
}

export interface PositionStep {
  id: string;
  tx: string;
  act: string;
  lo: number | null;
  hi: number | null;
}

export interface Position {
  m: string;
  sym: string;
  steps: PositionStep[];
  flags: string[];
  first: string;
  last: string;
  held: boolean;
}

export interface PerfCell {
  n: number;
  off: number | null;
  off_med: number | null;
  nf: number;
  fol: number | null;
  win: number | null;
}

export interface ScannedFiling {
  m: string;
  ch: "H" | "S" | "E";
  doc?: string;
  fil?: string;
  url: string;
  why: string;
}

export interface MemberPage {
  profile: {
    id: string;
    name: string;
    zh?: string;
    first?: string;
    last?: string;
    party: string;
    chamber: "H" | "S" | "E";
    state: string;
    district?: number;
    current?: boolean;
    since?: string;
    committees: Committee[];
    title?: string;
    agency?: string;
    title_zh?: string;
    agency_zh?: string;
    docs?: { kind: string; added: string; url: string | null; title: string; agency: string }[];
    on_request?: number;
    congress?: string;
  };
  summary: MemberRow;
  perf: { buy?: Record<string, PerfCell>; sell?: Record<string, PerfCell> };
  delay: { avg: number | null; max: number | null; late: number; n: number };
  trades: Trade[];
  positions: Position[];
  scanned: ScannedFiling[];
}

export interface TickerRow {
  sym: string;
  name: string;
  zh?: string;
  sec: string;
  n: number;
  nm: number;
  nb: number;
  ns: number;
  last?: string;
  inv: number;
}

export interface InvestorHolding {
  sym?: string;
  cusip: string;
  name: string;
  cls?: string;
  pc?: string;
  sh: number | null;
  val: number;
  w: number;
  chg?: "new" | "add" | "trim" | "exit" | "same" | null;
  dsh?: number;
  pct?: number;
  cost?: { p: number; lo: number; hi: number };
  fol?: { d: string; p: number; sp: number | null };
}

export interface TickerPage {
  sym: string;
  name: string;
  zh?: string | null;
  sec: string;
  type?: string;
  exch?: string;
  sic?: string;
  trades: Trade[];
  members: { id: string; nb: number; ns: number; vmin: number; vmax: number; held?: boolean }[];
  investors: { id: string; sh: number; val: number; w: number; chg?: string | null; period: string }[];
}

export interface InvestorProfile {
  id: string;
  zh: string;
  en: string;
  firm_zh: string;
  firm_en: string;
  cik: number;
  inferred?: boolean;
  note_zh?: string;
  note_en?: string;
}

export interface InvestorRow extends InvestorProfile {
  period: string;
  filed: string;
  value: number;
  n: number;
  top: string[];
}

export interface InvestorPage {
  profile: InvestorProfile;
  quarters: { period: string; filed: string; url: string; value: number; n: number }[];
  holdings: InvestorHolding[];
  exits: InvestorHolding[];
  activity: { period: string; filed: string; url: string; items: InvestorHolding[] }[];
}

export interface Meta {
  generated: string;
  data_through: string;
  price_asof: string;
  price_provider: string;
  start_year: number;
  horizons: number[];
  counts: Record<string, number>;
}

export interface Stats {
  window: number;
  since: string;
  last30: { trades: number; members: number; buys: number; sells: number; late: number };
  top_bought: { sym: string; nm: number }[];
  top_sold: { sym: string; nm: number }[];
  active: { id: string; n: number }[];
}

// ---------------------------------------------------------------- readers

// turbopackIgnore: runtime files are listed per route in next.config.ts (outputFileTracingIncludes)
const ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "site");
const memo = new Map<string, unknown>();

function read<T>(rel: string): T | null {
  if (memo.has(rel)) return memo.get(rel) as T;
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return null;
  let v: T | null = null;
  try {
    v = JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    v = null;
  }
  // keep the small shared files in memory; big per-entity files are read on demand
  if (!rel.includes("/")) memo.set(rel, v);
  return v;
}

const safe = (s: string) => /^[A-Za-z0-9._-]+$/.test(s);

export const getMeta = () => read<Meta>("meta.json");
export const getStats = () => read<Stats>("stats.json");
export const getMembers = () => read<MemberRow[]>("members.json") ?? [];
export const getTickers = () => read<TickerRow[]>("tickers.json") ?? [];
export const getInvestors = () => read<InvestorRow[]>("investors.json") ?? [];
export const getRecent = () => read<Trade[]>("recent.json") ?? [];
export const getUnparsed = () => read<ScannedFiling[]>("unparsed.json") ?? [];
export const getLatestPrices = () => read<{ asof: string; px: Record<string, number> }>("latest-prices.json") ?? { asof: "", px: {} };

export const getMember = (id: string) => (safe(id) ? read<MemberPage>(`member/${id}.json`) : null);
export const getTicker = (sym: string) => (safe(sym) ? read<TickerPage>(`ticker/${sym}.json`) : null);
export const getSeries = (sym: string) => (safe(sym) ? read<{ w: [string, number][] }>(`series/${sym}.json`) : null);
export const getInvestor = (id: string) => (safe(id) ? read<InvestorPage>(`investor/${id}.json`) : null);

let memberIndex: Map<string, MemberRow> | null = null;
export function memberMap(): Map<string, MemberRow> {
  if (!memberIndex) memberIndex = new Map(getMembers().map((m) => [m.id, m]));
  return memberIndex;
}

let investorIndex: Map<string, InvestorRow> | null = null;
export function investorMap(): Map<string, InvestorRow> {
  if (!investorIndex) investorIndex = new Map(getInvestors().map((m) => [m.id, m]));
  return investorIndex;
}

export function tickerName(sym: string, locale?: "zh" | "en"): string | undefined {
  const r = getTickers().find((t) => t.sym === sym);
  return locale === "zh" && r?.zh ? r.zh : r?.name;
}

/** Fields the client-side trade table needs (keeps page payloads small). */
export function slim(t: Trade): Trade {
  const { h: _h, doc: _doc, nd: _nd, ...rest } = t;
  void _h;
  void _doc;
  void _nd;
  if (rest.desc && rest.desc.length > 240) rest.desc = rest.desc.slice(0, 240) + "…";
  if (rest.est) {
    const { f: _f, smid: _smid, ...e } = rest.est;
    void _f;
    void _smid;
    rest.est = e;
  }
  if (rest.ent) {
    const { soff: _soff, ...e } = rest.ent;
    void _soff;
    rest.ent = e;
  }
  return rest;
}
