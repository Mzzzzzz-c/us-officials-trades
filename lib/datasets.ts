// The datasets offered on /[locale]/data: their columns (bilingual labels, types, defaults) and how
// joined columns are filled. Raw files come from scripts/build-exports.mjs as { cols, rows }.
import type { Cell, Kind } from "./exportkit";

export type SetKey = "trades" | "officials" | "tickers" | "holdings" | "changes" | "quarters" | "investors" | "lab" | "signals";
export type FilterKey = "chamber" | "party" | "side" | "dates" | "who" | "syms" | "minAmt" | "current" | "sector" | "investor" | "chg" | "minN";

export interface Raw {
  cols: string[];
  rows: Cell[][];
}

/** Locale-specific labels for coded values, handed over by the server page from lib/i18n. */
export interface Enums {
  types: Record<string, string>;
  owners: Record<string, string>;
  party: Record<string, string>;
  chamber: Record<string, string>;
  acts: Record<string, string>;
  chg: Record<string, string>;
  sectors: Record<string, string>;
  lab: Record<string, string>;
  sig: Record<string, string>;
  yes: string;
}

export interface Ctx {
  zh: boolean;
  enums: Enums;
  officials: Map<string, Record<string, Cell>>;
  investors: Map<string, Record<string, Cell>>;
}

/** A row as an object keyed by the raw column names. */
export type Obj = Record<string, Cell>;

export interface ColDef {
  k: string;
  zh: string;
  en: string;
  kind: Kind;
  def?: boolean;
  get?: (r: Obj, c: Ctx) => Cell;
}

export interface SetDef {
  key: SetKey;
  zh: string;
  en: string;
  dzh: string;
  den: string;
  /** other datasets that must be loaded to fill joined columns */
  needs: SetKey[];
  filters: FilterKey[];
  cols: ColDef[];
}

const en = (map: Record<string, string>, v: Cell) => (v == null || v === "" ? null : map[String(v)] ?? String(v));
const offName = (r: Obj, c: Ctx) => {
  const o = c.officials.get(String(r.m));
  return o ? ((c.zh && o.zh) || o.name) : r.m;
};
const invName = (r: Obj, c: Ctx) => {
  const o = c.investors.get(String(r.inv));
  return o ? (c.zh ? o.zh : o.en) : r.inv;
};
const role = (o: Obj | undefined, c: Ctx): Cell => {
  if (!o) return null;
  if (o.ch === "E") return [c.zh ? o.agency_zh ?? o.agency : o.agency, c.zh ? o.title_zh ?? o.title : o.title].filter(Boolean).join(c.zh ? " " : ", ") || null;
  const ch = c.enums.chamber[String(o.ch)];
  return o.state ? `${ch} · ${o.state}${o.district != null && o.ch === "H" ? `-${o.district}` : ""}` : ch;
};

export const SETS: SetDef[] = [
  {
    key: "trades",
    zh: "官员交易明细",
    en: "Officials' trades",
    dzh: "国会议员与行政官员申报的每一笔股票交易，含原始文件链接。",
    den: "Every disclosed trade by members of Congress and executive officials, with a link to the filing.",
    needs: ["officials"],
    filters: ["chamber", "party", "side", "dates", "who", "syms", "minAmt"],
    cols: [
      { k: "fil", zh: "申报日期", en: "Filed", kind: "date", def: true },
      { k: "tx", zh: "交易日期", en: "Traded", kind: "date", def: true },
      { k: "txr", zh: "申报所填交易日期（有误）", en: "Trade date as written (invalid)", kind: "text" },
      { k: "delay", zh: "申报延迟（天）", en: "Days to disclose", kind: "int", def: true },
      { k: "name", zh: "官员", en: "Official", kind: "text", def: true, get: offName },
      { k: "name_en", zh: "官员（英文名）", en: "Official (English)", kind: "text", get: (r, c) => c.officials.get(String(r.m))?.name ?? null },
      { k: "m", zh: "官员 ID", en: "Official ID", kind: "text" },
      { k: "ch", zh: "部门", en: "Branch", kind: "text", def: true, get: (r, c) => en(c.enums.chamber, r.ch) },
      { k: "party", zh: "党派", en: "Party", kind: "text", def: true, get: (r, c) => en(c.enums.party, c.officials.get(String(r.m))?.party) },
      { k: "role", zh: "职务 / 选区", en: "Role / district", kind: "text", get: (r, c) => role(c.officials.get(String(r.m)), c) },
      { k: "own", zh: "持有人", en: "Owner", kind: "text", def: true, get: (r, c) => en(c.enums.owners, r.own) },
      { k: "sym", zh: "股票代码", en: "Ticker", kind: "text", def: true },
      { k: "asset", zh: "资产名称（申报原文）", en: "Asset (as filed)", kind: "text", def: true },
      { k: "at", zh: "资产类型代码", en: "Asset type code", kind: "text" },
      { k: "type", zh: "交易类型", en: "Type", kind: "text", def: true, get: (r, c) => en(c.enums.types, r.type) },
      { k: "act", zh: "仓位动作", en: "Position change", kind: "text", get: (r, c) => en(c.enums.acts, r.act) },
      { k: "amin", zh: "金额下限（美元）", en: "Amount from (USD)", kind: "usd", def: true },
      { k: "amax", zh: "金额上限（美元）", en: "Amount to (USD)", kind: "usd", def: true },
      { k: "opt", zh: "期权（类型 行权价 到期日）", en: "Option (kind strike expiry)", kind: "text" },
      { k: "ov", zh: "与职权相关", en: "Within oversight", kind: "text", get: (r, c) => (r.ov ? c.enums.yes : null) },
      { k: "src", zh: "原始申报文件", en: "Source filing", kind: "url", def: true },
      { k: "id", zh: "交易 ID", en: "Trade ID", kind: "text" },
    ],
  },
  {
    key: "officials",
    zh: "官员名单与交易统计",
    en: "Officials & their record",
    dzh: "每位官员的交易笔数、金额区间、申报延迟，以及买入后相对标普 500 的超额收益。",
    den: "Each official's trade counts, amounts, filing delays and how their buys did against the S&P 500.",
    needs: [],
    filters: ["chamber", "party", "current", "minN"],
    cols: [
      { k: "name", zh: "姓名", en: "Name", kind: "text", def: true, get: (r, c) => (c.zh && r.zh) || r.name },
      { k: "name_en", zh: "英文名", en: "Name (English)", kind: "text", get: (r) => r.name },
      { k: "id", zh: "官员 ID", en: "ID", kind: "text" },
      { k: "ch", zh: "部门", en: "Branch", kind: "text", def: true, get: (r, c) => en(c.enums.chamber, r.ch) },
      { k: "party", zh: "党派", en: "Party", kind: "text", def: true, get: (r, c) => en(c.enums.party, r.party) },
      { k: "state", zh: "州", en: "State", kind: "text", def: true },
      { k: "role", zh: "职务", en: "Title", kind: "text", def: true, get: (r, c) => role(r, c) },
      { k: "current", zh: "现任", en: "In office", kind: "bool", def: true },
      { k: "n", zh: "交易笔数", en: "Trades", kind: "int", def: true },
      { k: "nb", zh: "买入笔数", en: "Buys", kind: "int", def: true },
      { k: "ns", zh: "卖出笔数", en: "Sells", kind: "int", def: true },
      { k: "vmin", zh: "交易额下限合计（美元）", en: "Volume from (USD)", kind: "usd", def: true },
      { k: "vmax", zh: "交易额上限合计（美元）", en: "Volume to (USD)", kind: "usd", def: true },
      { k: "last", zh: "最近交易日", en: "Last trade", kind: "date", def: true },
      { k: "lastf", zh: "最近申报日", en: "Last filing", kind: "date" },
      { k: "late", zh: "逾期申报笔数（>45 天）", en: "Late filings (>45 days)", kind: "int", def: true },
      { k: "cagr", zh: "跟单年化收益", en: "Copy CAGR", kind: "pct", def: true },
      { k: "b90_off", zh: "买入后 90 天超额（按交易日）", en: "Buys: 90d excess from trade date", kind: "pct", def: true },
      { k: "b90_fol", zh: "买入后 90 天超额（按公开日跟单）", en: "Buys: 90d excess copying at disclosure", kind: "pct", def: true },
      { k: "b90_win", zh: "买入 90 天跑赢比例", en: "Buys: 90d win rate", kind: "pct", def: true },
      { k: "b90_n", zh: "90 天样本数", en: "90d sample", kind: "int" },
      { k: "b365_off", zh: "买入后 1 年超额（按交易日）", en: "Buys: 1y excess from trade date", kind: "pct" },
      { k: "b365_fol", zh: "买入后 1 年超额（按公开日跟单）", en: "Buys: 1y excess copying at disclosure", kind: "pct" },
      { k: "b365_win", zh: "买入 1 年跑赢比例", en: "Buys: 1y win rate", kind: "pct" },
      { k: "s90_off", zh: "卖出后 90 天超额", en: "Sells: 90d excess after sale", kind: "pct" },
      { k: "opt", zh: "期权交易占比", en: "Options share", kind: "pct" },
      { k: "fam", zh: "家属账户占比", en: "Family accounts share", kind: "pct" },
      { k: "med", zh: "单笔金额中位数（美元）", en: "Median trade (USD)", kind: "usd" },
      { k: "hold", zh: "平均持有天数", en: "Average holding (days)", kind: "int" },
    ],
  },
  {
    key: "tickers",
    zh: "股票汇总",
    en: "Stocks",
    dzh: "官员交易过的每只股票：买卖笔数、参与人数与跟单战绩。",
    den: "Every stock officials traded: buys and sells, how many officials and the copy record.",
    needs: [],
    filters: ["sector", "syms", "minN"],
    cols: [
      { k: "sym", zh: "股票代码", en: "Ticker", kind: "text", def: true },
      { k: "name", zh: "公司名称", en: "Company", kind: "text", def: true },
      { k: "zh", zh: "中文名", en: "Chinese name", kind: "text", def: true },
      { k: "sec", zh: "行业", en: "Sector", kind: "text", def: true, get: (r, c) => en(c.enums.sectors, r.sec) },
      { k: "n", zh: "交易笔数", en: "Trades", kind: "int", def: true },
      { k: "nb", zh: "买入笔数", en: "Buys", kind: "int", def: true },
      { k: "ns", zh: "卖出笔数", en: "Sells", kind: "int", def: true },
      { k: "nm", zh: "交易过的官员数", en: "Officials trading it", kind: "int", def: true },
      { k: "inv", zh: "持有的知名投资人数", en: "Famous investors holding", kind: "int" },
      { k: "last", zh: "最近交易日", en: "Last trade", kind: "date", def: true },
      { k: "b90", zh: "近 90 天买入笔数", en: "Buys, last 90 days", kind: "int", def: true },
      { k: "s90", zh: "近 90 天卖出笔数", en: "Sells, last 90 days", kind: "int", def: true },
      { k: "b365", zh: "近 1 年买入笔数", en: "Buys, last year", kind: "int" },
      { k: "s365", zh: "近 1 年卖出笔数", en: "Sells, last year", kind: "int" },
      { k: "win", zh: "跟买 90 天跑赢比例", en: "Copied buys: 90d win rate", kind: "pct" },
      { k: "x90", zh: "跟买 90 天平均超额", en: "Copied buys: 90d avg excess", kind: "pct" },
    ],
  },
  {
    key: "holdings",
    zh: "13F 最新持仓",
    en: "13F latest holdings",
    dzh: "知名投资人最近一季 13F 报告中的全部持仓与较上季的变化。",
    den: "Every position in each famous investor's latest 13F report, with the change from the quarter before.",
    needs: ["investors"],
    filters: ["investor", "syms", "chg"],
    cols: [
      { k: "invn", zh: "投资人", en: "Investor", kind: "text", def: true, get: invName },
      { k: "firm", zh: "机构", en: "Firm", kind: "text", get: (r, c) => { const o = c.investors.get(String(r.inv)); return o ? (c.zh ? o.firm_zh : o.firm_en) : null; } },
      { k: "period", zh: "报告期", en: "Quarter end", kind: "date", def: true },
      { k: "filed", zh: "申报日期", en: "Filed", kind: "date", def: true },
      { k: "sym", zh: "股票代码", en: "Ticker", kind: "text", def: true },
      { k: "name", zh: "证券名称", en: "Issuer", kind: "text", def: true },
      { k: "cls", zh: "证券类别", en: "Class", kind: "text" },
      { k: "cusip", zh: "CUSIP", en: "CUSIP", kind: "text" },
      { k: "sh", zh: "股数", en: "Shares", kind: "int", def: true },
      { k: "val", zh: "市值（美元）", en: "Value (USD)", kind: "usd", def: true },
      { k: "w", zh: "占组合比例", en: "Weight", kind: "pct", def: true },
      { k: "chg", zh: "较上季变化", en: "Change", kind: "text", def: true, get: (r, c) => en(c.enums.chg, r.chg) },
      { k: "dsh", zh: "股数变化", en: "Share change", kind: "int", def: true },
      { k: "pct", zh: "股数变化比例", en: "Share change %", kind: "pct" },
      { k: "inv", zh: "投资人 ID", en: "Investor ID", kind: "text" },
    ],
  },
  {
    key: "changes",
    zh: "13F 季度调仓",
    en: "13F quarterly moves",
    dzh: "投资人每个季度的新建仓、加仓、减仓和清仓记录。",
    den: "New positions, adds, trims and exits, quarter by quarter.",
    needs: ["investors"],
    filters: ["investor", "syms", "chg"],
    cols: [
      { k: "invn", zh: "投资人", en: "Investor", kind: "text", def: true, get: invName },
      { k: "period", zh: "报告期", en: "Quarter end", kind: "date", def: true },
      { k: "filed", zh: "申报日期", en: "Filed", kind: "date", def: true },
      { k: "chg", zh: "变化", en: "Move", kind: "text", def: true, get: (r, c) => en(c.enums.chg, r.chg) },
      { k: "sym", zh: "股票代码", en: "Ticker", kind: "text", def: true },
      { k: "name", zh: "证券名称", en: "Issuer", kind: "text", def: true },
      { k: "cusip", zh: "CUSIP", en: "CUSIP", kind: "text" },
      { k: "sh", zh: "期末股数", en: "Shares after", kind: "int", def: true },
      { k: "dsh", zh: "股数变化", en: "Share change", kind: "int", def: true },
      { k: "pct", zh: "股数变化比例", en: "Share change %", kind: "pct", def: true },
      { k: "val", zh: "期末市值（美元）", en: "Value after (USD)", kind: "usd", def: true },
      { k: "w", zh: "占组合比例", en: "Weight", kind: "pct" },
      { k: "inv", zh: "投资人 ID", en: "Investor ID", kind: "text" },
    ],
  },
  {
    key: "quarters",
    zh: "13F 历史规模",
    en: "13F history",
    dzh: "每位投资人每季度申报的持仓总市值和持仓数量。",
    den: "Each investor's reported portfolio value and number of positions, by quarter.",
    needs: ["investors"],
    filters: ["investor"],
    cols: [
      { k: "invn", zh: "投资人", en: "Investor", kind: "text", def: true, get: invName },
      { k: "period", zh: "报告期", en: "Quarter end", kind: "date", def: true },
      { k: "filed", zh: "申报日期", en: "Filed", kind: "date", def: true },
      { k: "value", zh: "持仓总市值（美元）", en: "Portfolio value (USD)", kind: "usd", def: true },
      { k: "n", zh: "持仓数量", en: "Positions", kind: "int", def: true },
      { k: "url", zh: "SEC 原始文件", en: "SEC filing", kind: "url", def: true },
      { k: "inv", zh: "投资人 ID", en: "Investor ID", kind: "text" },
    ],
  },
  {
    key: "investors",
    zh: "投资人名单",
    en: "Investors",
    dzh: "本站追踪的知名投资人及其 SEC 编号（CIK）、最近报告期与规模。",
    den: "The famous investors tracked here, with SEC CIK, latest quarter and size.",
    needs: [],
    filters: [],
    cols: [
      { k: "name", zh: "投资人", en: "Investor", kind: "text", def: true, get: (r, c) => (c.zh ? r.zh : r.en) },
      { k: "firm", zh: "机构", en: "Firm", kind: "text", def: true, get: (r, c) => (c.zh ? r.firm_zh : r.firm_en) },
      { k: "cik", zh: "SEC CIK", en: "SEC CIK", kind: "text", def: true },
      { k: "period", zh: "最近报告期", en: "Latest quarter", kind: "date", def: true },
      { k: "filed", zh: "申报日期", en: "Filed", kind: "date", def: true },
      { k: "value", zh: "持仓总市值（美元）", en: "Portfolio value (USD)", kind: "usd", def: true },
      { k: "n", zh: "持仓数量", en: "Positions", kind: "int", def: true },
      { k: "inferred", zh: "代码为推断", en: "Filer inferred", kind: "bool" },
      { k: "id", zh: "投资人 ID", en: "Investor ID", kind: "text" },
    ],
  },
  {
    key: "lab",
    zh: "跟单策略回测",
    en: "Copy-strategy backtests",
    dzh: "15 种跟单规则的历史回测：年化收益、标普 500 对比、胜率与最大回撤。",
    den: "Backtests of 15 copy rules: annual return, S&P 500 comparison, hit rate and drawdown.",
    needs: [],
    filters: [],
    cols: [
      { k: "rule", zh: "规则", en: "Rule", kind: "text", def: true, get: (r, c) => c.enums.lab[String(r.k)] ?? r.k },
      { k: "hold", zh: "持有天数", en: "Holding days", kind: "int", def: true },
      { k: "from", zh: "开始", en: "From", kind: "date", def: true },
      { k: "to", zh: "结束", en: "To", kind: "date", def: true },
      { k: "n", zh: "样本笔数", en: "Trades copied", kind: "int", def: true },
      { k: "cagr", zh: "年化收益", en: "CAGR", kind: "pct", def: true },
      { k: "bcagr", zh: "标普 500 年化", en: "S&P 500 CAGR", kind: "pct", def: true },
      { k: "total", zh: "累计收益", en: "Total return", kind: "pct", def: true },
      { k: "bench", zh: "标普 500 累计", en: "S&P 500 total", kind: "pct", def: true },
      { k: "x", zh: "单笔平均超额", en: "Avg excess per trade", kind: "pct", def: true },
      { k: "hit", zh: "跑赢比例", en: "Hit rate", kind: "pct", def: true },
      { k: "mdd", zh: "最大回撤", en: "Max drawdown", kind: "pct", def: true },
      { k: "k", zh: "规则代码", en: "Rule key", kind: "text" },
    ],
  },
  {
    key: "signals",
    zh: "最新信号",
    en: "Latest signals",
    dzh: "最近 45 天公开、值得关注的官员买入，以及公开以来的涨跌。",
    den: "Notable buys made public in the last 45 days, and the move since.",
    needs: ["officials"],
    filters: [],
    cols: [
      { k: "grp", zh: "类别", en: "Signal", kind: "text", def: true, get: (r, c) => c.enums.sig[String(r.grp)] ?? r.grp },
      { k: "name", zh: "官员", en: "Official", kind: "text", def: true, get: offName },
      { k: "sym", zh: "股票代码", en: "Ticker", kind: "text", def: true },
      { k: "type", zh: "交易类型", en: "Type", kind: "text", def: true, get: (r, c) => en(c.enums.types, r.type) },
      { k: "act", zh: "仓位动作", en: "Position change", kind: "text", def: true, get: (r, c) => en(c.enums.acts, r.act) },
      { k: "tx", zh: "交易日期", en: "Traded", kind: "date", def: true },
      { k: "fil", zh: "公开日期", en: "Made public", kind: "date", def: true },
      { k: "amin", zh: "金额下限（美元）", en: "Amount from (USD)", kind: "usd", def: true },
      { k: "amax", zh: "金额上限（美元）", en: "Amount to (USD)", kind: "usd", def: true },
      { k: "since", zh: "公开以来涨跌幅", en: "Change since disclosure", kind: "pct", def: true },
      { k: "rec_n", zh: "该官员历史买入样本", en: "Official's past buys", kind: "int" },
      { k: "rec_x", zh: "该官员历史平均超额", en: "Official's avg excess", kind: "pct" },
      { k: "rec_win", zh: "该官员历史跑赢比例", en: "Official's hit rate", kind: "pct" },
      { k: "id", zh: "交易 ID", en: "Trade ID", kind: "text" },
    ],
  },
];

export const SET_BY_KEY = Object.fromEntries(SETS.map((s) => [s.key, s])) as Record<SetKey, SetDef>;

export function toObjects(raw: Raw): Obj[] {
  return raw.rows.map((r) => {
    const o: Obj = {};
    raw.cols.forEach((k, i) => (o[k] = r[i]));
    return o;
  });
}

export function cellOf(col: ColDef, r: Obj, c: Ctx): Cell {
  const v = col.get ? col.get(r, c) : r[col.k];
  return v === "" ? null : v;
}
