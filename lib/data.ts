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
  /** the trade date as written when it is impossible (after the filing date): a typo in the report */
  txr?: string;
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
  ov?: string; // committee id / "agency" whose remit covers this company
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
  ov?: number; // trades in industries the official oversees
  cagr?: number; // copy-this-official backtest, annualised
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
  nav?: Pick<Strategy, "n" | "from" | "to" | "total" | "bench" | "cagr" | "bcagr" | "mdd" | "pts" | "years"> | null;
  /** opt: share of option trades, fam: share in spouse/joint/child accounts, med: median trade size (band midpoint),
   *  hold: median days from opening to closing a position (nhold round trips), top: most traded stocks */
  style?: { opt: number; fam: number; med: number | null; hold: number | null; nhold: number; top: [string, number][] } | null;
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
  stats?: { x90?: number; xo90?: number; win?: number; nx?: number; b90: number; s90: number; b365: number; s365: number };
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
  top_bought: { sym: string; nm: number; ms?: string[] }[];
  top_sold: { sym: string; nm: number; ms?: string[] }[];
  active: { id: string; n: number }[];
}

export interface MediaManifest {
  people: Record<string, 1>;
  logos: Record<string, 1 | 2 | 3>;
  wiki: Record<string, string>;
  /** Wikimedia Commons file behind a portrait (its page names the author and licence) */
  files?: Record<string, string>;
}
export interface MediaSubset {
  p: Record<string, 1>;
  l: Record<string, 1 | 2 | 3>;
}

export interface Strategy {
  n: number;
  from: string;
  to: string;
  total: number;
  bench: number;
  /** null when there is less than a year of history (annualising would exaggerate) */
  cagr: number | null;
  bcagr: number | null;
  mdd: number;
  bmdd?: number;
  x?: number;
  hit?: number;
  nx?: number;
  vol?: number | null;
  years: { y: string; s: number; b: number }[];
  pts: [string, number, number][];
}
export interface TradeCard {
  id: string;
  m: string;
  sym?: string;
  tx?: string;
  fil?: string;
  type: TradeType;
  amin?: number;
  amax?: number;
  x?: number;
  ov?: string;
  act?: string;
  /** copier's entry price (first open after the report became public) */
  fol?: number;
  /** the official's copy-trade record when this card was made: [n, mean 90-day excess, win rate] */
  rec?: [number, number, number];
  /** part of a cluster buy */
  cl?: 1;
}

export interface LabRow {
  k: string;
  hold: number;
  n: number;
  nx?: number;
  from: string;
  to: string;
  cagr: number | null;
  bcagr: number | null;
  total: number;
  bench: number;
  mdd: number;
  x?: number;
  hit?: number;
  pts: [string, number, number][];
}
export interface Flow {
  sec: string;
  buy: number;
  sell: number;
  nb: number;
  ns: number;
}
export interface Insights {
  generated: string;
  hold: number;
  strategies: Record<string, Strategy>;
  leaderboard: { id: string; n: number; x90: number; win: number; x365: number | null; cagr: number | null; bcagr: number | null; spark: number[] }[];
  laggards: Insights["leaderboard"];
  activity: [string, number, number, number, number][];
  flows90: Flow[];
  flows365: Flow[];
  flows90_exec: Flow[];
  clusters: { sym: string; nm: number; members: string[]; from: string; to: string; pub: string; fol: number | null; vol: number }[];
  oversight: { count: [string, number][]; recent: TradeCard[]; total: number };
  best: TradeCard[];
  worst: TradeCard[];
  delay: { buckets: [number, number | null, number][]; median: number | null; late: [string, number][]; by_year: [string, number, number][] };
  party: Record<string, { members: number; trades: number; buys: number; sells: number; x90: number | null; win: number | null; sectors: [string, number][]; cagr: number | null; pts: [string, number, number][] }>;
  lab?: LabRow[];
  signals?: { since: string; proven: TradeCard[]; big: TradeCard[]; cluster: TradeCard[]; ov: TradeCard[] };
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
export const getLatestPrices = () =>
  read<{ asof: string; px: Record<string, number>; pc?: Record<string, number> }>("latest-prices.json") ?? { asof: "", px: {}, pc: {} };
export const getInsights = () => read<Insights>("insights.json");
export const getMedia = () => read<MediaManifest>("media.json") ?? { people: {}, logos: {}, wiki: {} };

/** Which portraits and logos exist, for passing to client components. */
export function mediaFor(ids: Iterable<string>, syms: Iterable<string>): MediaSubset {
  const m = getMedia();
  const p: Record<string, 1> = {};
  const l: Record<string, 1 | 2 | 3> = {};
  for (const id of ids) if (m.people[id]) p[id] = 1;
  for (const s of syms) if (s && m.logos[s]) l[s] = m.logos[s];
  return { p, l };
}

export const getMember = (id: string) => (safe(id) ? read<MemberPage>(`member/${id}.json`) : null);
export const getTicker = (sym: string) => (safe(sym) ? read<TickerPage>(`ticker/${sym}.json`) : null);
export const getSeries = (sym: string) => (safe(sym) ? read<{ w: [string, number][] }>(`series/${sym}.json`) : null);
/** Company insiders' open-market trades (SEC Form 4) and earnings-release dates for one stock. */
export interface InsiderFile {
  cik: number;
  /** [trade date, filed, name, relationship letters (D director, O officer, T 10% owner), title, P|S, shares, price, value, 10b5-1 plan, accession, the person's SEC number (0 if unknown)] */
  tx: [string, string, string, string, string, "P" | "S", number, number, number, 0 | 1, string, number?][];
  earn: string[];
  /** major 8-K announcements: [date, item numbers, accession] */
  ev?: [string, string, string][];
  /** the next earnings date: [date, "pre" | "post" | "", "cal" (announced) | "est" (projected from last year)] */
  next?: [string, string, "cal" | "est"] | null;
  /** false until the company's own filing index has been read (recent months may be missing) */
  full: boolean;
}
export type InsiderSum = Record<"b90" | "s90" | "vb90" | "vs90" | "nb90" | "ns90" | "b365" | "s365" | "vb365" | "vs365" | "nb365" | "ns365", number>;
/** Buys and sells over the last 90 and 365 days: count, dollar value, distinct people. */
export function insiderSum(tx: InsiderFile["tx"], today: string): InsiderSum {
  const out = {} as InsiderSum;
  for (const days of [90, 365] as const) {
    const cut = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
    for (const [code, k] of [["P", "b"], ["S", "s"]] as const) {
      const sel = tx.filter((r) => r[5] === code && r[0] >= cut);
      out[`${k}${days}`] = sel.length;
      out[`v${k}${days}`] = sel.reduce((a, r) => a + r[8], 0);
      out[`n${k}${days}`] = new Set(sel.map((r) => r[2])).size;
    }
  }
  return out;
}
export interface InsidersIndex {
  asof: string;
  bulk_end: string | null;
  stocks: number;
  both: { sym: string; off: string[]; nob: number; ins: number; nib: number; vb: number; last: string }[];
  top: { sym: string; who: string; rel: string; title: string; td: string; fd: string; val: number; n: number; acc: string; cik: number; oc?: number }[];
  people?: number;
  /** next earnings dates, soonest first: [date, symbol, "pre" | "post" | "", "cal" | "est"] */
  upcoming?: [string, string, string, "cal" | "est"][];
}
export const getInsider = (sym: string) => (safe(sym) ? read<InsiderFile>(`insider/${sym}.json`) : null);
export interface SiteEvents {
  macro: {
    fomc?: { d: string; lo: number; hi: number; chg: number; src: string }[];
    fomc_future?: string[];
    cpi?: string[];
    jobs?: string[];
    gdp?: string[];
  };
  company: { d: string; syms: string[]; kind: "antitrust" | "subsidy" | "export" | "stake"; en: string; zh: string; src: string }[];
}
export const getEvents = () => read<SiteEvents>("events.json") ?? { macro: {}, company: [] };
export const getInsiders = () => read<InsidersIndex>("insiders.json");
/** One company insider: [SEC number, name as filed, relationship letters, title, stocks (largest first), buys, sells, bought $, sold $, last trade, everyday name, Chinese name]. The last two exist only for people matched in Wikidata. */
export type InsiderPerson = [number, string, string, string, string[], number, number, number, number, string, string?, string?];
let insiderPeople: { asof: string; people: InsiderPerson[]; byId: Map<number, InsiderPerson> } | null = null;
export function getInsiderPeople() {
  if (!insiderPeople) {
    const d = read<{ asof: string; people: InsiderPerson[] }>("insider-people.json");
    const people = d?.people ?? [];
    insiderPeople = { asof: d?.asof ?? "", people, byId: new Map(people.map((p) => [p[0], p])) };
  }
  return insiderPeople;
}
/** Names are filed in capitals, surname first ("COOK TIMOTHY D"); shown as filed, in title case. */
export const insiderName = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s.,&/(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Llc|Lp|Llp|Gp|Plc|Sa|Ag|Nv|Usa|Lllp)\b/g, (m) => m.toUpperCase())
    .replace(/\bL\.l\.c\./g, "L.L.C.")
    .replace(/\bL\.p\./g, "L.P.");
/** The name to show: the Chinese or everyday name when the person is known, else the name as filed. */
export function insiderLabel(oc: number | undefined, filed: string, locale?: "zh" | "en"): string {
  const p = oc ? getInsiderPeople().byId.get(oc) : undefined;
  return (locale === "zh" && p?.[11]) || p?.[10] || insiderName(filed);
}
/** A title worth showing ("See Remarks" is what filers type when theirs did not fit the form). */
export function insiderTitle(ttl: string): string {
  const s = (ttl ?? "").trim();
  if (!s || /^see remarks?/i.test(s)) return "";
  // titles typed in capitals read better in title case; short all-capital words are abbreviations (CEO, EVP)
  if (s !== s.toUpperCase() || !/[A-Z]{5}/.test(s)) return s;
  return s.replace(/[A-Z]+/g, (w) => (/^(AND|OF|THE|FOR|IN|TO)$/.test(w) ? w.toLowerCase() : w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())).replace(/^[a-z]/, (c) => c.toUpperCase());
}
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
