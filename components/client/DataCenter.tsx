"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { cellOf, type Ctx, type Enums, type FilterKey, type Obj, type Raw, SET_BY_KEY, type SetDef, type SetKey, SETS, toObjects } from "@/lib/datasets";
import { type Cell, MIME, save, type Sheet, toCsv, toJson, toXlsx, toZip } from "@/lib/exportkit";

type Fmt = "csv" | "xlsx" | "json";
interface Index {
  generated: string;
  asof: string | null;
  sets: Record<string, { rows: number; bytes: number }>;
}

interface Filters {
  chamber: string[];
  party: string[];
  side: string[];
  dateField: "fil" | "tx";
  from: string;
  to: string;
  who: string;
  syms: string;
  minAmt: number;
  current: boolean;
  sector: string;
  investor: string;
  chg: string[];
  minN: number;
}
const EMPTY: Filters = { chamber: [], party: [], side: [], dateField: "fil", from: "", to: "", who: "", syms: "", minAmt: 0, current: false, sector: "", investor: "", chg: [], minN: 0 };

const TXT = {
  zh: {
    allTitle: "一次下载全部数据",
    allSub: "9 个数据集，含完整字段与数据说明（README）。",
    zipCsv: "全部 CSV（ZIP）",
    zipXlsx: "全部 Excel 工作簿",
    sets: "数据集",
    rows: "行",
    custom: "自定义导出",
    customSub: "选择数据集，按条件筛选、挑选字段，再导出你需要的那部分。",
    choose: "自定义",
    filters: "筛选条件",
    columns: "导出字段",
    colDefault: "默认",
    colAll: "全选",
    colNone: "清空",
    preview: "预览",
    previewNote: (n: number) => `显示前 ${n} 行`,
    matched: (n: string, total: string) => `筛选结果 ${n} 行，共 ${total} 行`,
    reset: "重置筛选",
    loading: "正在加载数据…",
    working: "正在生成文件…",
    failed: "数据加载失败，请刷新重试。",
    noRows: "没有符合条件的数据，试试放宽筛选条件。",
    noCols: "请至少选择一个字段。",
    download: "下载",
    chamber: "部门",
    party: "党派",
    side: "方向",
    buy: "买入",
    sell: "卖出",
    exch: "置换",
    other: "其他",
    dates: "日期",
    dateFil: "申报日期",
    dateTx: "交易日期",
    presets: { d30: "近 30 天", d90: "近 90 天", ytd: "今年", y1: "近 1 年", all: "全部" },
    who: "官员",
    whoPh: "输入姓名，如 佩洛西 或 Pelosi",
    syms: "股票代码",
    symsPh: "如 NVDA, AAPL（逗号分隔）",
    minAmt: "单笔金额",
    any: "不限",
    current: "仅现任官员",
    sector: "行业",
    investor: "投资人",
    chg: "变化",
    minN: "交易笔数至少",
    fmtNote: "CSV 用 UTF-8 编码，Excel 可直接打开中文；Excel 文件已冻结表头并带筛选按钮，百分比与金额已设置格式。",
    legalTitle: "使用说明",
    legal:
      "数据来自美国众议院、参议院、政府道德办公室（OGE）与 SEC 的公开披露，按原样整理，可能存在错误或遗漏。根据 5 U.S.C. §13107，官员财务披露报告不得用于商业目的（新闻与传播媒体向公众传播除外）、信用评级或募款。本站不构成任何投资建议。",
    pricesTitle: "为什么下载文件里没有股价",
    prices:
      "网站上的股价和走势图来自第三方行情服务（Yahoo Finance、CNBC），它们的服务条款允许在网页上显示，但禁止把行情数据批量转发给他人。因此下载文件不含收盘价、当日涨跌等原始价格；由价格计算出的超额收益、跑赢比例、回测收益和公开以来涨跌幅是本站自己的分析结果，照常提供。需要原始价格时，请在各股票页面查看，或从你有权使用的行情来源获取。",
    updated: "数据截至",
    mb: (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`),
  },
  en: {
    allTitle: "Download everything",
    allSub: "All 9 datasets with every field, plus a README describing them.",
    zipCsv: "All as CSV (ZIP)",
    zipXlsx: "All as one Excel workbook",
    sets: "Datasets",
    rows: "rows",
    custom: "Custom export",
    customSub: "Pick a dataset, filter it, choose the fields, then export just that slice.",
    choose: "Customize",
    filters: "Filters",
    columns: "Fields",
    colDefault: "Default",
    colAll: "All",
    colNone: "None",
    preview: "Preview",
    previewNote: (n: number) => `First ${n} rows`,
    matched: (n: string, total: string) => `${n} of ${total} rows match`,
    reset: "Reset filters",
    loading: "Loading data…",
    working: "Building the file…",
    failed: "The data could not be loaded. Refresh to try again.",
    noRows: "Nothing matches. Try loosening the filters.",
    noCols: "Choose at least one field.",
    download: "Download",
    chamber: "Branch",
    party: "Party",
    side: "Side",
    buy: "Buys",
    sell: "Sells",
    exch: "Exchanges",
    other: "Other",
    dates: "Dates",
    dateFil: "Filed",
    dateTx: "Traded",
    presets: { d30: "30 days", d90: "90 days", ytd: "This year", y1: "1 year", all: "All" },
    who: "Official",
    whoPh: "Type a name, e.g. Pelosi",
    syms: "Tickers",
    symsPh: "e.g. NVDA, AAPL (comma separated)",
    minAmt: "Trade size",
    any: "Any",
    current: "Current officials only",
    sector: "Sector",
    investor: "Investor",
    chg: "Move",
    minN: "At least this many trades",
    fmtNote: "CSV is UTF-8 and opens directly in Excel; Excel files have a frozen header with filter buttons and formatted percentages and amounts.",
    legalTitle: "Terms of use",
    legal:
      "Compiled as-is from public disclosures by the House, the Senate, the Office of Government Ethics and the SEC; it may contain errors or omissions. Under 5 U.S.C. §13107, officials' financial disclosure reports may not be used for commercial purposes (other than by news and communications media for dissemination to the public), credit ratings or solicitation. Nothing here is investment advice.",
    pricesTitle: "Why the downloads have no stock prices",
    prices:
      "The prices and charts on this site come from third-party market-data services (Yahoo Finance, CNBC) whose terms allow showing them on a web page but forbid passing the data on in bulk. So the files leave out closing prices, daily changes and other raw quotes. Figures this site computes from prices (excess returns, win rates, backtest returns, change since disclosure) are its own analysis and are included. For raw prices, see each stock's page or a data source you are licensed to use.",
    updated: "Data through",
    mb: (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`),
  },
};

const AMOUNTS = [15001, 50001, 100001, 250001, 1000001];
const PREVIEW = 40;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const symList = (s: string) =>
  s
    .toUpperCase()
    .split(/[\s,，;；]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const FMT_EXT: Record<Fmt, string> = { csv: "csv", xlsx: "xlsx", json: "json" };

export default function DataCenter({ locale, index, enums }: { locale: "zh" | "en"; index: Index; enums: Enums }) {
  const zh = locale === "zh";
  const T = TXT[locale];
  const cache = useRef(new Map<SetKey, Obj[]>());
  const [, bump] = useState(0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<SetKey>("trades");
  const [f, setF] = useState<Filters>(EMPTY);
  const [cols, setCols] = useState<Record<string, string[]>>(() => Object.fromEntries(SETS.map((s) => [s.key, s.cols.filter((c) => c.def).map((c) => c.k)])));
  const builder = useRef<HTMLDivElement>(null);
  // the field list is long: folded on phones, open on wide screens
  const [colsOpen, setColsOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setColsOpen(false);
  }, []);

  const load = useCallback(async (keys: SetKey[]): Promise<boolean> => {
    const want = [...new Set(keys.flatMap((k) => [k, ...SET_BY_KEY[k].needs]))].filter((k) => !cache.current.has(k));
    if (!want.length) return true;
    try {
      const got = await Promise.all(
        want.map(async (k) => {
          const r = await fetch(`/exports/${k}.json?v=${index.generated}`);
          if (!r.ok) throw new Error(String(r.status));
          return [k, toObjects((await r.json()) as Raw)] as const;
        }),
      );
      for (const [k, v] of got) cache.current.set(k, v);
      bump((n) => n + 1);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }, [index.generated]);

  useEffect(() => {
    void load([sel]);
  }, [sel, load]);

  const ctx = useMemo<Ctx>(() => {
    const off = cache.current.get("officials") ?? [];
    const inv = cache.current.get("investors") ?? [];
    return { zh, enums, officials: new Map(off.map((o) => [String(o.id), o])), investors: new Map(inv.map((o) => [String(o.id), o])) };
    // the cache is a ref; `bump` re-renders when it fills
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zh, enums, cache.current.size]);

  const def = SET_BY_KEY[sel];
  const ready = [sel, ...def.needs].every((k) => cache.current.has(k));
  const all = cache.current.get(sel);
  const fd = useDeferredValue(f);

  const rows = useMemo(() => (all && ready ? applyFilters(all, def, fd, ctx) : []), [all, ready, def, fd, ctx]);
  const chosen = def.cols.filter((c) => cols[sel].includes(c.k));

  const sheetOf = (d: SetDef, data: Obj[], colKeys: string[] | null): Sheet => {
    const cs = colKeys ? d.cols.filter((c) => colKeys.includes(c.k)) : d.cols;
    return {
      name: zh ? d.zh : d.en,
      cols: cs.map((c) => ({ label: zh ? c.zh : c.en, kind: c.kind })),
      rows: data.map((r) => cs.map((c) => cellOf(c, r, ctx) as Cell)),
    };
  };
  const fname = (d: SetDef, ext: string, part = "") => `${(zh ? d.zh : d.en.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()).replace(/-$/, "")}${part}_${index.asof ?? index.generated}.${ext}`;

  async function exportSet(d: SetDef, data: Obj[], colKeys: string[] | null, fmt: Fmt, part = "") {
    const sh = sheetOf(d, data, colKeys);
    const cs = colKeys ? d.cols.filter((c) => colKeys.includes(c.k)) : d.cols;
    if (fmt === "csv") save(toCsv(sh), fname(d, "csv", part), MIME.csv);
    else if (fmt === "json") save(toJson(cs.map((c) => c.k), sh.rows), fname(d, "json", part), MIME.json);
    else save(await toXlsx([sh]), fname(d, "xlsx", part), MIME.xlsx);
  }

  async function run(label: string, job: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    // let the spinner paint before the heavy work starts
    await new Promise((r) => setTimeout(r, 30));
    try {
      await job();
    } finally {
      setBusy(null);
    }
  }

  const quick = (k: SetKey, fmt: Fmt) =>
    run(`${k}-${fmt}`, async () => {
      if (!(await load([k]))) return;
      await exportSet(SET_BY_KEY[k], cache.current.get(k) ?? [], null, fmt);
    });

  const everything = (fmt: "csv" | "xlsx") =>
    run(`all-${fmt}`, async () => {
      if (!(await load(SETS.map((s) => s.key)))) return;
      const sheets = SETS.map((s) => sheetOf(s, cache.current.get(s.key) ?? [], null));
      const stamp = index.asof ?? index.generated;
      if (fmt === "xlsx") {
        save(await toXlsx(sheets), `${zh ? "美国官员交易追踪_全部数据" : "us-officials-trades_all"}_${stamp}.xlsx`, MIME.xlsx);
        return;
      }
      const files = SETS.map((s, i) => ({ name: fname(s, "csv"), data: toCsv(sheets[i]) }));
      files.push({ name: "README.txt", data: readme(zh, stamp) });
      save(await toZip(files), `${zh ? "美国官员交易追踪_全部数据" : "us-officials-trades_all"}_${stamp}.zip`, MIME.zip);
    });

  const pick = (k: SetKey) => {
    setSel(k);
    setF(EMPTY);
    builder.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const total = all?.length ?? index.sets[sel]?.rows ?? 0;
  const nf = (n: number) => n.toLocaleString(zh ? "zh-CN" : "en-US");

  return (
    <div className="flex flex-col gap-14">
      {/* everything at once */}
      <section className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="title-1">{T.allTitle}</h2>
          <p className="mt-2 text-[15px] text-muted">
            {T.allSub} {T.updated} <span className="num">{index.asof ?? index.generated}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => everything("csv")}>
            <DownloadIcon /> {busy === "all-csv" ? T.working : T.zipCsv}
          </button>
          <button type="button" className="btn btn-quiet" disabled={!!busy} onClick={() => everything("xlsx")}>
            <DownloadIcon /> {busy === "all-xlsx" ? T.working : T.zipXlsx}
          </button>
        </div>
      </section>

      {/* one dataset at a time */}
      <section>
        <h2 className="title-1 mb-6">{T.sets}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SETS.map((s) => {
            const meta = index.sets[s.key];
            return (
              <div key={s.key} className="tile flex flex-col p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[17px] font-semibold tracking-tight">{zh ? s.zh : s.en}</h3>
                  <span className="num shrink-0 text-xs text-faint">
                    {meta ? `${nf(meta.rows)} ${T.rows}` : ""}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{zh ? s.dzh : s.den}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  {(["csv", "xlsx", "json"] as Fmt[]).map((fmt) => (
                    <button key={fmt} type="button" className="chip" disabled={!!busy} onClick={() => quick(s.key, fmt)} aria-label={`${T.download} ${zh ? s.zh : s.en} ${fmt.toUpperCase()}`}>
                      {busy === `${s.key}-${fmt}` ? "…" : fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}
                    </button>
                  ))}
                  <button type="button" className="btn-ghost ml-auto text-[13px] font-medium" onClick={() => pick(s.key)}>
                    {T.choose}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* custom export */}
      <section ref={builder} className="scroll-mt-20">
        <h2 className="title-1">{T.custom}</h2>
        <p className="mt-2 mb-6 text-[15px] text-muted">{T.customSub}</p>
        <div className="no-scrollbar -mx-5 mb-6 overflow-x-auto px-5">
          <div className="seg" role="tablist">
            {SETS.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={s.key === sel} className={s.key === sel ? "on" : ""} onClick={() => { setSel(s.key); setF(EMPTY); }}>
                {zh ? s.zh : s.en}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="flex flex-col gap-6">
            {def.filters.length ? (
              <div className="card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold">{T.filters}</h3>
                  <button type="button" className="btn-ghost text-[13px]" onClick={() => setF(EMPTY)}>
                    {T.reset}
                  </button>
                </div>
                <FilterPanel keys={def.filters} f={f} setF={setF} T={T} enums={enums} ctx={ctx} zh={zh} />
              </div>
            ) : null}
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <button type="button" className="flex items-center gap-1.5 text-[15px] font-semibold" aria-expanded={colsOpen} onClick={() => setColsOpen(!colsOpen)}>
                  {T.columns}
                  <span className="num text-[13px] font-normal text-muted">
                    {cols[sel].length}/{def.cols.length}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`text-muted transition-transform ${colsOpen ? "rotate-180" : ""}`}>
                    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="flex gap-3 text-[13px]">
                  <button type="button" className="btn-ghost" onClick={() => setCols({ ...cols, [sel]: def.cols.filter((c) => c.def).map((c) => c.k) })}>{T.colDefault}</button>
                  <button type="button" className="btn-ghost" onClick={() => setCols({ ...cols, [sel]: def.cols.map((c) => c.k) })}>{T.colAll}</button>
                  <button type="button" className="btn-ghost" onClick={() => setCols({ ...cols, [sel]: [] })}>{T.colNone}</button>
                </div>
              </div>
              <ul className={`flex-col gap-1 ${colsOpen ? "flex" : "hidden"}`}>
                {def.cols.map((c) => {
                  const on = cols[sel].includes(c.k);
                  return (
                    <li key={c.k}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-[14px] hover:bg-surface-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--accent)]"
                          checked={on}
                          onChange={() =>
                            setCols({ ...cols, [sel]: on ? cols[sel].filter((k) => k !== c.k) : def.cols.map((x) => x.k).filter((k) => k === c.k || cols[sel].includes(k)) })
                          }
                        />
                        <span className={on ? "" : "text-muted"}>{zh ? c.zh : c.en}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="card sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-[15px]">
                {failed ? (
                  <span className="text-neg">{T.failed}</span>
                ) : !ready ? (
                  <span className="text-muted">{T.loading}</span>
                ) : (
                  <span className="num font-medium">{T.matched(nf(rows.length), nf(total))}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(["csv", "xlsx", "json"] as Fmt[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    className={fmt === "xlsx" ? "btn btn-primary" : "btn btn-quiet"}
                    disabled={!ready || !rows.length || !chosen.length || !!busy}
                    onClick={() => run(`custom-${fmt}`, () => exportSet(def, rows, cols[sel], fmt, zh ? "_筛选" : "_filtered"))}
                  >
                    <DownloadIcon /> {busy === `custom-${fmt}` ? T.working : fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-hair px-4 py-3">
                <h3 className="text-[15px] font-semibold">{T.preview}</h3>
                <span className="text-xs text-faint">{T.previewNote(Math.min(PREVIEW, rows.length))}</span>
              </div>
              {!ready ? (
                <div className="flex flex-col gap-2 p-4">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="skeleton h-6 rounded" />
                  ))}
                </div>
              ) : !chosen.length ? (
                <p className="px-4 py-10 text-center text-muted">{T.noCols}</p>
              ) : !rows.length ? (
                <p className="px-4 py-10 text-center text-muted">{T.noRows}</p>
              ) : (
                <div className="scroll-x max-h-[560px] overflow-y-auto">
                  <table className="tbl text-[13px]">
                    <thead className="sticky top-0 bg-[var(--bg-elev)]">
                      <tr>
                        {chosen.map((c) => (
                          <th key={c.k} className={`whitespace-nowrap ${isNum(c.kind) ? "r" : ""}`}>
                            {zh ? c.zh : c.en}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, PREVIEW).map((r, i) => (
                        <tr key={i}>
                          {chosen.map((c) => (
                            <td key={c.k} className={`whitespace-nowrap ${isNum(c.kind) ? "num text-right" : ""} ${c.kind === "text" ? "max-w-[280px] truncate" : ""}`}>
                              {show(cellOf(c, r, ctx), c.kind, zh, enums.yes)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <p className="text-[12px] leading-relaxed text-faint">{T.fmtNote}</p>
          </div>
        </div>
      </section>

      <section className="well flex flex-col gap-4 rounded-2xl p-5 text-[13px] leading-relaxed text-muted">
        <div>
          <h3 className="mb-1.5 font-semibold text-text">{T.legalTitle}</h3>
          {T.legal}
        </div>
        <div>
          <h3 className="mb-1.5 font-semibold text-text">{T.pricesTitle}</h3>
          {T.prices}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- filters

function applyFilters(all: Obj[], def: SetDef, f: Filters, c: Ctx): Obj[] {
  const has = (k: FilterKey) => def.filters.includes(k);
  const syms = has("syms") ? new Set(symList(f.syms)) : new Set<string>();
  const who = f.who.trim().toLowerCase();
  const whoIds =
    has("who") && who
      ? new Set([...c.officials.values()].filter((o) => `${o.name ?? ""} ${o.zh ?? ""} ${o.id}`.toLowerCase().includes(who)).map((o) => String(o.id)))
      : null;
  const partyOf = (r: Obj) => String((def.key === "officials" ? r.party : c.officials.get(String(r.m))?.party) || "");
  const side = (t: Cell) => (t === "P" ? "buy" : t === "E" ? "exch" : "sell");
  return all.filter((r) => {
    if (has("chamber") && f.chamber.length && !f.chamber.includes(String(r.ch))) return false;
    if (has("party") && f.party.length) {
      const p = partyOf(r);
      if (!f.party.includes(p === "D" || p === "R" ? p : "other")) return false;
    }
    if (has("side") && f.side.length && !f.side.includes(side(r.type))) return false;
    if (has("dates") && (f.from || f.to)) {
      const d = String(r[f.dateField] ?? "");
      if (!d || (f.from && d < f.from) || (f.to && d > f.to)) return false;
    }
    if (whoIds && !whoIds.has(String(r.m))) return false;
    if (syms.size && !syms.has(String(r.sym ?? "").toUpperCase())) return false;
    if (has("minAmt") && f.minAmt && !(Number(r.amin ?? 0) >= f.minAmt)) return false;
    if (has("current") && f.current && !r.current) return false;
    if (has("sector") && f.sector && r.sec !== f.sector) return false;
    if (has("investor") && f.investor && r.inv !== f.investor) return false;
    if (has("chg") && f.chg.length && !f.chg.includes(String(r.chg))) return false;
    if (has("minN") && f.minN && !(Number(r.n ?? 0) >= f.minN)) return false;
    return true;
  });
}

function Chips({ options, value, onChange }: { options: [string, string][]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, label]) => {
        const on = value.includes(k);
        return (
          <button key={k} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}

function FilterPanel({
  keys,
  f,
  setF,
  T,
  enums,
  ctx,
  zh,
}: {
  keys: FilterKey[];
  f: Filters;
  setF: (f: Filters) => void;
  T: (typeof TXT)["zh"];
  enums: Enums;
  ctx: Ctx;
  zh: boolean;
}) {
  const up = (p: Partial<Filters>) => setF({ ...f, ...p });
  const year = new Date().getFullYear();
  const preset = (k: keyof typeof T.presets) => {
    const to = "";
    if (k === "all") return up({ from: "", to });
    if (k === "ytd") return up({ from: `${year}-01-01`, to });
    return up({ from: daysAgo(k === "d30" ? 30 : k === "d90" ? 90 : 365), to });
  };
  const officialNames = useMemo(() => [...ctx.officials.values()].map((o) => String((zh && o.zh) || o.name)).sort((a, b) => a.localeCompare(b, zh ? "zh-CN" : "en")), [ctx.officials, zh]);
  return (
    <div className="flex flex-col gap-5">
      {keys.includes("chamber") ? (
        <Field label={T.chamber}>
          <Chips options={(["H", "S", "E"] as const).map((k) => [k, enums.chamber[k]])} value={f.chamber} onChange={(v) => up({ chamber: v })} />
        </Field>
      ) : null}
      {keys.includes("party") ? (
        <Field label={T.party}>
          <Chips options={[["D", enums.party.D], ["R", enums.party.R], ["other", T.other]]} value={f.party} onChange={(v) => up({ party: v })} />
        </Field>
      ) : null}
      {keys.includes("side") ? (
        <Field label={T.side}>
          <Chips options={[["buy", T.buy], ["sell", T.sell], ["exch", T.exch]]} value={f.side} onChange={(v) => up({ side: v })} />
        </Field>
      ) : null}
      {keys.includes("dates") ? (
        <Field label={T.dates}>
          <div className="seg self-start">
            {(["fil", "tx"] as const).map((k) => (
              <button key={k} type="button" className={f.dateField === k ? "on" : ""} onClick={() => up({ dateField: k })}>
                {k === "fil" ? T.dateFil : T.dateTx}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="input num" value={f.from} max={f.to || today()} onChange={(e) => up({ from: e.target.value })} aria-label="from" />
            <input type="date" className="input num" value={f.to} min={f.from} max={today()} onChange={(e) => up({ to: e.target.value })} aria-label="to" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(T.presets) as (keyof typeof T.presets)[]).map((k) => (
              <button key={k} type="button" className="chip text-[12px]" onClick={() => preset(k)}>
                {T.presets[k]}
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      {keys.includes("who") ? (
        <Field label={T.who}>
          <input className="input" list="dl-officials" placeholder={T.whoPh} value={f.who} onChange={(e) => up({ who: e.target.value })} />
          <datalist id="dl-officials">
            {officialNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
      ) : null}
      {keys.includes("syms") ? (
        <Field label={T.syms}>
          <input className="input" placeholder={T.symsPh} value={f.syms} onChange={(e) => up({ syms: e.target.value })} autoCapitalize="characters" spellCheck={false} />
        </Field>
      ) : null}
      {keys.includes("minAmt") ? (
        <Field label={T.minAmt}>
          <select className="input" value={f.minAmt} onChange={(e) => up({ minAmt: Number(e.target.value) })}>
            <option value={0}>{T.any}</option>
            {AMOUNTS.map((a) => (
              <option key={a} value={a}>
                ≥ ${((a - 1) / 1000).toLocaleString()}K
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {keys.includes("current") ? (
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.current} onChange={(e) => up({ current: e.target.checked })} />
          {T.current}
        </label>
      ) : null}
      {keys.includes("sector") ? (
        <Field label={T.sector}>
          <select className="input" value={f.sector} onChange={(e) => up({ sector: e.target.value })}>
            <option value="">{T.any}</option>
            {Object.entries(enums.sectors).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {keys.includes("investor") ? (
        <Field label={T.investor}>
          <select className="input" value={f.investor} onChange={(e) => up({ investor: e.target.value })}>
            <option value="">{T.any}</option>
            {[...ctx.investors.values()].map((o) => (
              <option key={String(o.id)} value={String(o.id)}>
                {String(zh ? o.zh : o.en)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {keys.includes("chg") ? (
        <Field label={T.chg}>
          <Chips options={(["new", "add", "trim", "exit"] as const).map((k) => [k, enums.chg[k]])} value={f.chg} onChange={(v) => up({ chg: v })} />
        </Field>
      ) : null}
      {keys.includes("minN") ? (
        <Field label={T.minN}>
          <input type="number" min={0} step={1} className="input num" value={f.minN || ""} placeholder="0" onChange={(e) => up({ minN: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- display helpers

const isNum = (k: string) => k === "int" || k === "usd" || k === "price" || k === "pct";

function show(v: Cell, kind: string, zh: boolean, yes: string): React.ReactNode {
  if (v == null || v === "") return <span className="text-faint">—</span>;
  const loc = zh ? "zh-CN" : "en-US";
  if (typeof v === "boolean") return v ? yes : "";
  if (typeof v === "number") {
    if (kind === "pct") return `${(v * 100).toFixed(1)}%`;
    if (kind === "usd") return `$${v.toLocaleString(loc)}`;
    if (kind === "price") return `$${v.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return v.toLocaleString(loc);
  }
  if (kind === "url")
    return (
      <a className="link" href={String(v)} target="_blank" rel="noopener noreferrer">
        {zh ? "打开" : "Open"}
      </a>
    );
  return String(v);
}

function readme(zh: boolean, stamp: string): string {
  const lines: string[] = [];
  if (zh) {
    lines.push(`美国官员交易追踪 · 全部数据（截至 ${stamp}）`, "https://us-officials-trades.vercel.app", "");
    lines.push("文件为 UTF-8 编码的 CSV（带 BOM，Excel 可直接打开）。金额单位为美元；百分比字段为小数（0.05 = 5%）。", "");
  } else {
    lines.push(`US Officials' Trades · full data (through ${stamp})`, "https://us-officials-trades.vercel.app", "");
    lines.push("Files are UTF-8 CSV (with BOM, so Excel opens them directly). Amounts are in US dollars; percentage fields are decimals (0.05 = 5%).", "");
  }
  for (const s of SETS) {
    lines.push(`== ${zh ? s.zh : s.en} ==`, zh ? s.dzh : s.den);
    for (const c of s.cols) lines.push(`  - ${zh ? c.zh : c.en}`);
    lines.push("");
  }
  lines.push(TXT[zh ? "zh" : "en"].legal, "", TXT[zh ? "zh" : "en"].pricesTitle, TXT[zh ? "zh" : "en"].prices, "");
  return lines.join("\r\n");
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v7.5m0 0L5 7m3 3 3-3M3 12.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
