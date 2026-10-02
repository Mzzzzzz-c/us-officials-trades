// Builds the downloadable datasets behind /[locale]/data from data/site.
// Output: public/exports/<name>.json as { cols: [...], rows: [[...], ...] } plus index.json.
// Runs before `next build` / `next dev` (see package.json), so every deploy ships fresh files.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = path.join(ROOT, "data", "site");
const OUT = path.join(ROOT, "public", "exports");

const read = (p) => JSON.parse(fs.readFileSync(path.join(SITE, p), "utf8"));
const list = (dir) => fs.readdirSync(path.join(SITE, dir)).filter((f) => f.endsWith(".json")).sort();
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

fs.mkdirSync(OUT, { recursive: true });
const index = { generated: new Date().toISOString().slice(0, 10), asof: read("meta.json").data_through ?? read("meta.json").generated ?? null, sets: {} };

function write(name, cols, rows) {
  const body = JSON.stringify({ cols, rows });
  fs.writeFileSync(path.join(OUT, `${name}.json`), body);
  index.sets[name] = { rows: rows.length, bytes: Buffer.byteLength(body) };
}

// ---------------------------------------------------------------- officials' trades
const members = read("members.json");
const tradeCols = ["id", "m", "ch", "tx", "txr", "fil", "delay", "own", "sym", "asset", "at", "type", "act", "amin", "amax", "opt", "ov", "src"];
const trades = [];
const memberPerf = {};
const committees = {};
for (const f of list("member")) {
  const d = read(`member/${f}`);
  memberPerf[d.profile.id] = { perf: d.perf, style: d.style, summary: d.summary };
  for (const c of d.profile.committees ?? []) {
    const k = (committees[c.id] ??= { id: c.id, name: c.name, members: [] });
    k.members.push({ id: d.profile.id, title: c.title ?? null });
  }
  for (const t of d.trades) {
    const opt = t.opt ? [t.opt.kind, t.opt.strike, t.opt.exp].filter((x) => x != null && x !== "").join(" ") : null;
    trades.push([t.id, t.m, t.ch, t.tx ?? null, t.txr ?? null, t.fil ?? null, t.delay ?? null, t.own, t.sym ?? null, t.asset ?? null, t.at ?? null, t.type, t.act ?? null, t.amin ?? null, t.amax ?? null, opt || null, t.ov ?? null, t.src]);
  }
}
// newest disclosures first
trades.sort((a, b) => (b[5] ?? "").localeCompare(a[5] ?? "") || (b[3] ?? "").localeCompare(a[3] ?? ""));
write("trades", tradeCols, trades);

// a light feed of the last year's disclosures, for the follow list and the holdings check
{
  const meta = read("meta.json");
  const end = meta.data_through ?? new Date().toISOString().slice(0, 10);
  const cut = new Date(Date.parse(end) - 365 * 864e5).toISOString().slice(0, 10);
  const I = Object.fromEntries(tradeCols.map((k, i) => [k, i]));
  const feedCols = ["id", "m", "ch", "sym", "asset", "type", "act", "fil", "tx", "amin", "amax"];
  const feed = trades
    .filter((t) => (t[I.fil] ?? "") >= cut)
    .map((t) => [t[I.id], t[I.m], t[I.ch], t[I.sym], t[I.sym] ? null : String(t[I.asset] ?? "").slice(0, 60) || null, t[I.type], t[I.act], t[I.fil], t[I.tx], t[I.amin], t[I.amax]]);
  write("feed", feedCols, feed);
  index.feed = { from: cut, to: end };
}

// ---------------------------------------------------------------- weekly reviews and committees
// Not downloads: summaries the /weekly and /committee pages read (written next to the exports
// because this script already has every trade in memory).
{
  const I = Object.fromEntries(tradeCols.map((k, i) => [k, i]));
  const card = (t) => ({ id: t[I.id], m: t[I.m], sym: t[I.sym], asset: t[I.sym] ? null : String(t[I.asset] ?? "").slice(0, 60) || null, type: t[I.type], act: t[I.act], fil: t[I.fil], tx: t[I.tx], amin: t[I.amin], amax: t[I.amax], delay: t[I.delay] });
  const isBuy = (t) => t[I.type] === "P";
  const isSell = (t) => t[I.type] !== "P" && t[I.type] !== "E";

  // weeks run Monday to Sunday by the date a filing became public
  const end = read("meta.json").data_through ?? new Date().toISOString().slice(0, 10);
  const day = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
  const monday = (iso) => day(iso, -((new Date(iso).getUTCDay() + 6) % 7));
  const weeks = [];
  for (let w = 0, from = monday(end); w < 12; w++, from = day(from, -7)) {
    const to = day(from, 6);
    const ts = trades.filter((t) => (t[I.fil] ?? "") >= from && (t[I.fil] ?? "") <= to);
    if (!ts.length) continue;
    const byM = new Map(), byS = new Map();
    for (const t of ts) {
      const m = byM.get(t[I.m]) ?? byM.set(t[I.m], { m: t[I.m], n: 0, nb: 0, ns: 0, vmin: 0, vmax: 0 }).get(t[I.m]);
      m.n++;
      if (isBuy(t)) m.nb++;
      if (isSell(t)) m.ns++;
      m.vmin += t[I.amin] ?? 0;
      m.vmax += t[I.amax] ?? t[I.amin] ?? 0;
      if (t[I.sym] && (isBuy(t) || isSell(t))) {
        const x = byS.get(t[I.sym]) ?? byS.set(t[I.sym], { sym: t[I.sym], nb: 0, ns: 0, buyers: new Set(), sellers: new Set() }).get(t[I.sym]);
        if (isBuy(t)) (x.nb++, x.buyers.add(t[I.m]));
        else (x.ns++, x.sellers.add(t[I.m]));
      }
    }
    const size = (t) => t[I.amax] ?? t[I.amin] ?? 0;
    // each list counts and shows the officials on its own side of the trade
    const side = (k) => [...byS.values()].map((x) => ({ sym: x.sym, nb: x.nb, ns: x.ns, nm: x[k].size, ms: [...x[k]].slice(0, 6) }));
    weeks.push({
      from, to: to > end ? end : to, partial: to > end,
      n: ts.length, officials: byM.size, nb: ts.filter(isBuy).length, ns: ts.filter(isSell).length,
      late: ts.filter((t) => (t[I.delay] ?? 0) > 45).length,
      vmin: ts.reduce((a, t) => a + (t[I.amin] ?? 0), 0), vmax: ts.reduce((a, t) => a + (t[I.amax] ?? t[I.amin] ?? 0), 0),
      biggest: [...ts].sort((a, b) => size(b) - size(a) || (b[I.amin] ?? 0) - (a[I.amin] ?? 0)).slice(0, 10).map(card),
      active: [...byM.values()].sort((a, b) => b.n - a.n || b.vmax - a.vmax).slice(0, 8),
      bought: side("buyers").filter((x) => x.nb).sort((a, b) => b.nm - a.nm || b.nb - a.nb || a.sym.localeCompare(b.sym)).slice(0, 10),
      sold: side("sellers").filter((x) => x.ns).sort((a, b) => b.nm - a.nm || b.ns - a.ns || a.sym.localeCompare(b.sym)).slice(0, 10),
      slowest: [...ts].filter((t) => t[I.delay] != null).sort((a, b) => b[I.delay] - a[I.delay]).slice(0, 5).map(card),
    });
  }
  fs.writeFileSync(path.join(OUT, "weekly.json"), JSON.stringify({ end, weeks }));

  // committees: every member's trades, and those within the committee's own remit (the "ov" flag)
  const out = [];
  for (const c of Object.values(committees)) {
    const ids = new Set(c.members.map((m) => m.id));
    const all = trades.filter((t) => ids.has(t[I.m]));
    const ov = all.filter((t) => t[I.ov] === c.id);
    const bySym = new Map(), byM = new Map();
    for (const t of ov) {
      if (t[I.sym]) {
        const x = bySym.get(t[I.sym]) ?? bySym.set(t[I.sym], { sym: t[I.sym], nb: 0, ns: 0, ms: new Set() }).get(t[I.sym]);
        if (isBuy(t)) x.nb++;
        else if (isSell(t)) x.ns++;
        x.ms.add(t[I.m]);
      }
      byM.set(t[I.m], (byM.get(t[I.m]) ?? 0) + 1);
    }
    const allByM = new Map();
    for (const t of all) allByM.set(t[I.m], (allByM.get(t[I.m]) ?? 0) + 1);
    const order = { Chairman: 0, Chair: 0, Chairwoman: 0, "Ranking Member": 1, "Vice Chairman": 2, "Vice Chair": 2 };
    out.push({
      id: c.id, name: c.name,
      members: c.members.map((m) => ({ ...m, n: allByM.get(m.id) ?? 0, nov: byM.get(m.id) ?? 0 })).sort((a, b) => (order[a.title] ?? 9) - (order[b.title] ?? 9) || b.nov - a.nov || b.n - a.n),
      n: all.length, nov: ov.length, nb: ov.filter(isBuy).length, ns: ov.filter(isSell).length,
      vmin: ov.reduce((a, t) => a + (t[I.amin] ?? 0), 0), vmax: ov.reduce((a, t) => a + (t[I.amax] ?? t[I.amin] ?? 0), 0),
      last: ov[0]?.[I.fil] ?? null,
      stocks: [...bySym.values()].map((x) => ({ sym: x.sym, nb: x.nb, ns: x.ns, nm: x.ms.size })).sort((a, b) => b.nb + b.ns - (a.nb + a.ns)).slice(0, 12),
      recent: ov.slice(0, 150).map(card),
    });
  }
  out.sort((a, b) => b.nov - a.nov || b.n - a.n);
  fs.writeFileSync(path.join(OUT, "committees.json"), JSON.stringify(out));
  console.log(`weekly: ${weeks.length} weeks; committees: ${out.length}`);
}

// ---------------------------------------------------------------- officials
const offCols = ["id", "name", "zh", "ch", "party", "state", "district", "title", "title_zh", "agency", "agency_zh", "current", "n", "nb", "ns", "vmin", "vmax", "last", "lastf", "late",
  "cagr", "b90_off", "b90_fol", "b90_win", "b90_n", "b365_off", "b365_fol", "b365_win", "s90_off", "opt", "fam", "med", "hold"];
write("officials", offCols, members.map((m) => {
  const p = memberPerf[m.id] ?? {};
  const b = p.perf?.buy ?? {}, s = p.perf?.sell ?? {}, st = p.style ?? {};
  return [m.id, m.name, m.zh ?? null, m.chamber, m.party || null, m.state || null, m.district ?? null, m.title ?? null, m.title_zh ?? null, m.agency ?? null, m.agency_zh ?? null, m.current ?? null,
    m.n, m.nb, m.ns, m.vmin ?? null, m.vmax ?? null, m.last ?? null, m.lastf ?? null, m.late ?? null,
    r4(p.summary?.cagr), r4(b["90"]?.off), r4(b["90"]?.fol), r4(b["90"]?.win), b["90"]?.n ?? null, r4(b["365"]?.off), r4(b["365"]?.fol), r4(b["365"]?.win), r4(s["90"]?.off),
    r4(st.opt), r4(st.fam), st.med ?? null, st.hold ?? null];
}));

// ---------------------------------------------------------------- stocks
const tickers = read("tickers.json");
const { px } = read("latest-prices.json");
const stats = {};
for (const t of tickers) {
  try {
    stats[t.sym] = read(`ticker/${t.sym}.json`).stats ?? {};
  } catch {
    stats[t.sym] = {};
  }
}
// No raw market prices in the downloads: the quotes come from a provider (Yahoo Finance) whose
// terms forbid redistributing its data. Returns computed from them are this site's own analysis.
const tkCols = ["sym", "name", "zh", "sec", "n", "nb", "ns", "nm", "inv", "last", "b90", "s90", "b365", "s365", "win", "x90"];
write("tickers", tkCols, tickers.map((t) => {
  const s = stats[t.sym];
  return [t.sym, t.name ?? null, t.zh ?? null, t.sec ?? null, t.n, t.nb, t.ns, t.nm ?? null, t.inv ?? null, t.last ?? null,
    s.b90 ?? null, s.s90 ?? null, s.b365 ?? null, s.s365 ?? null, r4(s.win), r4(s.x90)];
}));

// ---------------------------------------------------------------- 13F
const invs = read("investors.json");
const holdCols = ["inv", "period", "filed", "sym", "name", "cusip", "cls", "sh", "val", "w", "chg", "dsh", "pct"];
const chgCols = ["inv", "period", "filed", "sym", "name", "cusip", "chg", "sh", "dsh", "pct", "val", "w"];
const qCols = ["inv", "period", "filed", "value", "n", "url"];
const hold = [], chg = [], qs = [];
for (const iv of invs) {
  let d;
  try {
    d = read(`investor/${iv.id}.json`);
  } catch {
    continue;
  }
  const latest = d.quarters?.[0] ?? {};
  for (const h of d.holdings ?? []) hold.push([iv.id, latest.period ?? iv.period, latest.filed ?? iv.filed, h.sym ?? null, h.name, h.cusip ?? null, h.cls ?? null, h.sh, h.val, r4(h.w), h.chg ?? null, h.dsh ?? null, r4(h.pct)]);
  for (const a of d.activity ?? []) for (const h of a.items ?? []) chg.push([iv.id, a.period, a.filed, h.sym ?? null, h.name, h.cusip ?? null, h.chg, h.sh, h.dsh ?? null, r4(h.pct), h.val, r4(h.w)]);
  for (const q of d.quarters ?? []) qs.push([iv.id, q.period, q.filed, q.value, q.n, q.url ?? null]);
}
write("holdings", holdCols, hold);
write("changes", chgCols, chg);
write("quarters", qCols, qs);
write("investors", ["id", "en", "zh", "firm_en", "firm_zh", "cik", "period", "filed", "value", "n", "inferred"],
  invs.map((i) => [i.id, i.en, i.zh, i.firm_en, i.firm_zh, i.cik, i.period, i.filed, i.value, i.n, !!i.inferred]));

// ---------------------------------------------------------------- analysis
const ins = read("insights.json");
write("lab", ["k", "hold", "from", "to", "n", "cagr", "bcagr", "total", "bench", "x", "hit", "mdd"],
  (ins.lab ?? []).map((r) => [r.k, r.hold ?? null, r.from, r.to, r.n, r4(r.cagr), r4(r.bcagr), r4(r.total), r4(r.bench), r4(r.x), r4(r.hit), r4(r.mdd)]));
const sig = [];
for (const g of ["proven", "big", "cluster", "ov"]) {
  for (const c of ins.signals?.[g] ?? []) {
    const rec = Array.isArray(c.rec) ? c.rec : [];
    sig.push([g, c.id, c.m, c.sym, c.type, c.act ?? null, c.tx ?? null, c.fil ?? null, c.amin ?? null, c.amax ?? null,
      c.fol && px?.[c.sym] ? r4(px[c.sym] / c.fol - 1) : null, rec[0] ?? null, r4(rec[1]), r4(rec[2])]);
  }
}
write("signals", ["grp", "id", "m", "sym", "type", "act", "tx", "fil", "amin", "amax", "since", "rec_n", "rec_x", "rec_win"], sig);

fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
console.log("exports:", Object.entries(index.sets).map(([k, v]) => `${k} ${v.rows} rows ${(v.bytes / 1e6).toFixed(1)}MB`).join(", "));
