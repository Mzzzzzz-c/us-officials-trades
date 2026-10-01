import "server-only";
// The other share posters (1080x1440, all with a QR code): copy leaderboard, single trade,
// one stock, one 13F investor, Democrats vs Republicans, and the week's roundup.
import { getInsights, getInvestor, getInvestors, getLatestPrices, getMedia, getMember, getMembers, getMeta, getRecent, getTicker, getTickers, type MemberRow } from "./data";
import { amountRange, usdShort } from "./format";
import { dict, type Locale } from "./i18n";
import { C, logoPng, partyColor, photoPng, upDown } from "./og";
import { roleShort } from "./people";
import { donut, fill, linePath, OTHER, PARTY, pct, PosterPage, posterResponse, PosterTitle, QrFooter, short, SLICE } from "./poster-kit";

type Face = string | null;

const W = {
  zh: {
    lbTitle: "跟单收益排行榜",
    lbSub: "跟着 TA 在公开后买入、持有 90 天，平均跑赢标普 500 多少（至少 20 笔可评估的买入）",
    lbWorst: "跟单最亏排行榜",
    lbEyebrow: "美国官员交易 · Top 10",
    x90: "90 天平均超额",
    win: "胜率",
    cagr: "跟单年化",
    scanLb: "扫码查看完整排行榜",
    ofTrade: "笔",
    tradeScan: "扫码查看这笔交易的原始申报",
    traded: "交易日",
    filed: "公开日",
    took: "隔了 {n} 天才公开",
    sinceTrade: "交易日至今",
    sinceTradeSub: "TA 本人的收益",
    sinceFiled: "公开日至今",
    sinceFiledSub: "普通人跟单的收益",
    spySame: "同期标普 {v}",
    record: "TA 的跟单年化",
    owner: "持有人",
    tkTitle: "谁在交易 {sym}",
    lastYear: "近一年官员交易",
    buys: "买入",
    sells: "卖出",
    buyers: "买入的官员",
    sellers: "卖出的官员",
    noOne: "近一年没有",
    heldBy: "知名投资人持有",
    copyRec: "跟买 90 天：胜率 {w} · 平均超额 {x}",
    tkScan: "扫码查看 {sym} 的全部官员交易",
    invValue: "13F 持仓市值",
    invN: "只持仓",
    invPeriod: "报告期",
    top10: "前十大持仓",
    newPos: "新建仓",
    exits: "清仓",
    invScan: "扫码查看完整持仓与调仓",
    ptTitle: "民主党 vs 共和党",
    ptSub: "谁更会炒股？国会两党议员的交易与跟单表现",
    members: "位议员",
    trades: "笔交易",
    ptCagr: "跟单年化",
    ptWin: "90 天胜率",
    favSectors: "最爱买的行业",
    copyD: "民主党跟单",
    copyR: "共和党跟单",
    spy: "标普 500",
    ptScan: "扫码查看两党完整对比",
    wkTitle: "本周官员交易速报",
    wkTitle14: "近两周官员交易速报",
    wkTitle30: "近 30 天官员交易速报",
    wkTop14: "近两周买得最多的股票",
    wkTop30: "近 30 天买得最多的股票",
    wkBiggest14: "近两周最大一笔",
    wkBiggest30: "近 30 天最大一笔",
    wkRange: "{from} 至 {to} 公开的申报",
    wkTrades: "笔交易",
    wkOfficials: "位官员",
    wkTop: "本周买得最多的股票",
    wkBiggest: "本周最大一笔",
    wkBuyers: "{n} 位官员 · {b} 笔买入",
    wkScan: "扫码查看全部最新申报",
  },
  en: {
    lbTitle: "Who's worth copying",
    lbSub: "Average 90-day return over the S&P 500 from buying what they bought on the day it was disclosed (at least 20 scored buys)",
    lbWorst: "Worst to copy",
    lbEyebrow: "US officials' trades · Top 10",
    x90: "avg 90-day excess",
    win: "Win rate",
    cagr: "Copy CAGR",
    scanLb: "Scan for the full leaderboard",
    ofTrade: "",
    tradeScan: "Scan for the original filing",
    traded: "Traded",
    filed: "Disclosed",
    took: "{n} days later",
    sinceTrade: "Since the trade",
    sinceTradeSub: "what they made",
    sinceFiled: "Since disclosure",
    sinceFiledSub: "what a copier made",
    spySame: "S&P 500 {v}",
    record: "Their copy CAGR",
    owner: "Owner",
    tkTitle: "Who's trading {sym}",
    lastYear: "Officials' trades, last 12 months",
    buys: "buys",
    sells: "sells",
    buyers: "Bought by",
    sellers: "Sold by",
    noOne: "No one",
    heldBy: "Held by famous investors",
    copyRec: "Copying buys, 90 days: win rate {w} · avg excess {x}",
    tkScan: "Scan for every official's trade in {sym}",
    invValue: "13F portfolio",
    invN: "positions",
    invPeriod: "Quarter",
    top10: "Top 10 holdings",
    newPos: "New",
    exits: "Exited",
    invScan: "Scan for all holdings and moves",
    ptTitle: "Democrats vs Republicans",
    ptSub: "Who trades better? Members of Congress by party",
    members: "members",
    trades: "trades",
    ptCagr: "Copy CAGR",
    ptWin: "90-day win rate",
    favSectors: "Favourite sectors",
    copyD: "Copy Democrats",
    copyR: "Copy Republicans",
    spy: "S&P 500",
    ptScan: "Scan for the full comparison",
    wkTitle: "This week in officials' trades",
    wkTitle14: "Two weeks of officials' trades",
    wkTitle30: "A month of officials' trades",
    wkTop14: "Most-bought, last two weeks",
    wkTop30: "Most-bought, last 30 days",
    wkBiggest14: "Biggest trade, last two weeks",
    wkBiggest30: "Biggest trade, last 30 days",
    wkRange: "Filings made public {from} to {to}",
    wkTrades: "trades",
    wkOfficials: "officials",
    wkTop: "Most-bought this week",
    wkBiggest: "Biggest trade this week",
    wkBuyers: "{n} officials · {b} buys",
    wkScan: "Scan for every new filing",
  },
};

const people = () => new Map(getMembers().map((m) => [m.id, m]));
const pname = (m: MemberRow | undefined, id: string, locale: Locale) => (m ? (locale === "zh" && m.zh ? m.zh : m.name) : id);
const tname = (sym: string, locale: Locale) => {
  const r = getTickers().find((x) => x.sym === sym);
  return r ? (locale === "zh" && r.zh ? r.zh : r.name) : "";
};
const isDark = (sym: string) => getMedia().logos[sym] === 3;

function Face({ src, name, size, ring }: { src: Face; name: string; size: number; ring?: string }) {
  const st = { width: size, height: size, borderRadius: size, border: ring ? `${Math.max(2, Math.round(size / 28))}px solid ${ring}` : "3px solid #fff", flexShrink: 0 };
  return src ? (
    <img src={src} width={size} height={size} style={{ ...st, objectFit: "cover" }} alt="" />
  ) : (
    <div style={{ ...st, display: "flex", alignItems: "center", justifyContent: "center", background: ring ?? C.ind, color: "#fff", fontSize: size * 0.42, fontWeight: 700 }}>{[...name][0] ?? "?"}</div>
  );
}

function Tile({ src, sym, size }: { src: Face; sym: string; size: number }) {
  const dark = isDark(sym);
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.24, background: dark ? "#1d1d1f" : "#fff", border: dark ? "none" : "1.5px solid #e5e5ea", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
      {src ? <img src={src} width={size * 0.8} height={size * 0.8} style={{ objectFit: "contain" }} alt="" /> : <span style={{ fontSize: size * 0.3, fontWeight: 700, color: C.muted }}>{sym.slice(0, 4)}</span>}
    </div>
  );
}

function Pill({ text, bg }: { text: string; bg: string }) {
  return <span style={{ fontSize: 26, fontWeight: 700, color: "#fff", background: bg, borderRadius: 40, padding: "4px 18px", whiteSpace: "nowrap", flexShrink: 0 }}>{text}</span>;
}

// ---------------------------------------------------------------- leaderboard

export async function leaderboardPoster(locale: Locale, worst: boolean) {
  const ins = getInsights();
  const l = W[locale];
  const ud = upDown(locale);
  const ppl = people();
  const rows = (worst ? ins?.laggards : ins?.leaderboard)?.slice(0, 10) ?? [];
  const faces = await Promise.all(rows.map((r) => photoPng(r.id, 140)));
  const medal = ["#d4a017", "#a7a7ad", "#c27c3e"];
  const text: string[] = [l.lbEyebrow, worst ? l.lbWorst : l.lbTitle, l.lbSub, l.x90, l.win, l.cagr, l.scanLb];
  const node = (
    <PosterPage>
      <PosterTitle eyebrow={l.lbEyebrow} title={worst ? l.lbWorst : l.lbTitle} sub={l.lbSub} color={worst ? ud.down : ud.up} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 20, gap: 2 }}>
        {rows.map((r, i) => {
          const m = ppl.get(r.id);
          const name = pname(m, r.id, locale);
          const role = roleShort(m, locale);
          text.push(name, role);
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 18, padding: "4px 0", borderBottom: i < rows.length - 1 ? "1.5px solid #f0f0f3" : "none" }}>
              <span style={{ width: 46, fontSize: 34, fontWeight: 700, color: i < 3 && !worst ? medal[i] : C.faint, textAlign: "center" }}>{i + 1}</span>
              <Face src={faces[i]} name={name} size={56} ring={partyColor(m?.party)} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 30, fontWeight: 700 }}>{name}</span>
                <span style={{ fontSize: 20, color: C.muted, fontWeight: 500 }}>{role}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: 38, fontWeight: 700, color: r.x90 >= 0 ? ud.up : ud.down, letterSpacing: -1 }}>{pct(r.x90)}</span>
                <span style={{ fontSize: 19, color: C.muted, fontWeight: 500 }}>
                  {`${l.win} ${Math.round(r.win * 100)}% · ${l.cagr} ${r.cagr != null ? pct(r.cagr) : "—"}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", marginTop: "auto", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 19, color: C.faint, fontWeight: 500, textAlign: "right" }}>{`${l.x90} · ${getMeta()?.data_through ?? ""}`}</span>
        <QrFooter locale={locale} path={`/${locale}/insights#leaders`} scan={l.scanLb} />
      </div>
    </PosterPage>
  );
  return posterResponse(node, text.join("") + "0123456789%·—", locale);
}

// ---------------------------------------------------------------- one trade

export async function tradePoster(locale: Locale, rawId: string) {
  const id = decodeURIComponent(rawId);
  const mid = id.replace(/-[^-]+-[^-]+$/, "");
  const d = getMember(mid);
  const tr = d?.trades.find((x) => x.id === id);
  if (!d || !tr) return new Response("Not found", { status: 404 });
  const t = dict(locale);
  const l = W[locale];
  const ud = upDown(locale);
  const m = getMembers().find((x) => x.id === mid);
  const name = pname(m, mid, locale);
  const role = roleShort(m, locale);
  const party = d.profile.party ? (t.party[d.profile.party as keyof typeof t.party] ?? "") : "";
  const buy = tr.type === "P";
  const col = tr.type === "E" ? C.muted : buy ? ud.up : ud.down;
  const action = (tr.act && t.acts[tr.act as keyof typeof t.acts]) || t.types[tr.type];
  const company = tr.sym ? tname(tr.sym, locale) : (tr.asset ?? "");
  const amount = amountRange(tr.amin, tr.amax);
  const { px } = getLatestPrices();
  const e = tr.ent;
  const now = tr.sym ? px[tr.sym] : undefined;
  const spy = px.SPY;
  // returns since the trade (official) and since disclosure (copier), with the S&P alongside
  const rOff = e?.off && now ? now / e.off - 1 : null;
  const rFol = e?.fol && now ? now / e.fol - 1 : null;
  const sOff = e?.soff && spy ? spy / e.soff - 1 : null;
  const sFol = e?.sfol && spy ? spy / e.sfol - 1 : null;
  const navC = d.nav?.cagr ?? null;
  const [face, logo] = await Promise.all([photoPng(mid, 300), tr.sym ? logoPng(tr.sym, 300) : Promise.resolve(null)]);
  const headline = tr.sym ?? short(tr.asset ?? "", 30);
  const ret = (v: number | null) => (v == null ? "—" : pct(v));
  const rc = (v: number | null) => (v == null ? C.muted : v >= 0 ? ud.up : ud.down);
  const node = (
    <PosterPage>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <Face src={face} name={name} size={136} ring={partyColor(d.profile.party)} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {party ? <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", background: partyColor(d.profile.party), borderRadius: 30, padding: "2px 14px" }}>{party}</span> : null}
            <span style={{ fontSize: 24, color: C.muted, fontWeight: 500 }}>{role}</span>
          </div>
          <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.12 }}>{name}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 34, background: "#f5f5f7", borderRadius: 32, padding: "34px 36px", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          {tr.sym ? <Tile src={logo} sym={tr.sym} size={140} /> : null}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Pill text={action} bg={col} />
              <span style={{ fontSize: tr.sym ? 88 : 46, fontWeight: 700, letterSpacing: tr.sym ? -3 : -1, lineHeight: tr.sym ? 1 : 1.15 }}>{headline}</span>
            </div>
            {tr.sym ? <span style={{ fontSize: 27, color: C.muted, fontWeight: 500, marginTop: 8 }}>{short(company, 22)}</span> : null}
          </div>
        </div>
        <span style={{ fontSize: 84, fontWeight: 700, color: col, letterSpacing: -2 }}>{amount}</span>
        {/* timeline: trade -> disclosure */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 21, color: C.muted, fontWeight: 500 }}>{l.traded}</span>
            <span style={{ fontSize: 32, fontWeight: 700 }}>{tr.tx ?? tr.txr ?? "—"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: (tr.delay ?? 0) > 45 ? "#c93400" : C.muted }}>{tr.delay != null ? fill(l.took, { n: tr.delay }) : ""}</span>
            <div style={{ display: "flex", width: "100%", height: 4, background: "#d1d1d6", borderRadius: 2, marginTop: 6 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 21, color: C.muted, fontWeight: 500 }}>{l.filed}</span>
            <span style={{ fontSize: 32, fontWeight: 700 }}>{tr.fil ?? "—"}</span>
          </div>
        </div>
      </div>

      {tr.sym && (rOff != null || rFol != null) ? (
        <div style={{ display: "flex", gap: 20, marginTop: 24 }}>
          {[
            [l.sinceTrade, l.sinceTradeSub, rOff, sOff],
            [l.sinceFiled, l.sinceFiledSub, rFol, sFol],
          ].map(([k, sub, v, s]) => (
            <div key={String(k)} style={{ display: "flex", flexDirection: "column", flex: 1, border: "2px solid #ececf0", borderRadius: 24, padding: "20px 24px" }}>
              <span style={{ fontSize: 24, fontWeight: 700 }}>{String(k)}</span>
              <span style={{ fontSize: 19, color: C.faint, fontWeight: 500 }}>{String(sub)}</span>
              <span style={{ fontSize: 56, fontWeight: 700, color: rc(v as number | null), letterSpacing: -1, marginTop: 6 }}>{ret(v as number | null)}</span>
              <span style={{ fontSize: 20, color: C.muted, fontWeight: 500 }}>{s != null ? fill(l.spySame, { v: pct(s as number) }) : ""}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 500, color: C.muted }}>
          <span>{`${l.owner}：${t.owners[tr.own] ?? tr.own}`}</span>
          {navC != null ? <span style={{ fontWeight: 700, color: navC >= 0 ? ud.up : ud.down }}>{`${l.record} ${pct(navC)}`}</span> : null}
        </div>
        <QrFooter locale={locale} path={`/${locale}/trade/${encodeURIComponent(id)}`} scan={l.tradeScan} />
      </div>
    </PosterPage>
  );
  const text = [name, role, party, action, headline, short(company, 22), amount, l.traded, l.filed, fill(l.took, { n: tr.delay ?? 0 }), l.sinceTrade, l.sinceTradeSub, l.sinceFiled, l.sinceFiledSub, l.spySame, l.owner, t.owners[tr.own] ?? "", l.record, l.tradeScan, "：0123456789%+−—"];
  return posterResponse(node, text.join(""), locale);
}

// ---------------------------------------------------------------- one stock

export async function tickerPoster(locale: Locale, rawSym: string) {
  const sym = decodeURIComponent(rawSym).toUpperCase();
  const d = getTicker(sym);
  if (!d) return new Response("Not found", { status: 404 });
  const t = dict(locale);
  const l = W[locale];
  const ud = upDown(locale);
  const ppl = people();
  const end = getMeta()?.data_through ?? new Date().toISOString().slice(0, 10);
  const cut = new Date(Date.parse(end) - 365 * 864e5).toISOString().slice(0, 10);
  const recent = d.trades.filter((x) => (x.fil ?? "") >= cut);
  const by = (pred: (type: string) => boolean) => {
    const c = new Map<string, number>();
    for (const x of recent) if (pred(x.type)) c.set(x.m, (c.get(x.m) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  };
  const buyers = by((x) => x === "P");
  const sellers = by((x) => x !== "P" && x !== "E");
  const nb = buyers.reduce((a, x) => a + x[1], 0), ns = sellers.reduce((a, x) => a + x[1], 0);
  const showB = buyers.slice(0, 8), showS = sellers.slice(0, 8);
  const invs = [...d.investors].sort((a, b) => b.w - a.w).slice(0, 5);
  const invRows = getInvestors();
  const [logo, ...faces] = await Promise.all([logoPng(sym, 300), ...[...showB, ...showS].map(([id]) => photoPng(id, 120)), ...invs.map((v) => photoPng(`inv-${v.id}`, 100))]);
  const bFaces = faces.slice(0, showB.length), sFaces = faces.slice(showB.length, showB.length + showS.length), iFaces = faces.slice(showB.length + showS.length);
  const name = locale === "zh" && d.zh ? d.zh : d.name;
  const sector = t.sectors[d.sec as keyof typeof t.sectors] ?? "";
  const st = d.stats;
  const text: string[] = [fill(l.tkTitle, { sym }), name, sector, l.lastYear, l.buys, l.sells, l.buyers, l.sellers, l.noOne, l.heldBy, l.copyRec, fill(l.tkScan, { sym })];
  const wall = (list: [string, number][], fs: Face[], color: string) =>
    list.length ? (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {list.map(([id, n], i) => {
          const m = ppl.get(id);
          const nm = pname(m, id, locale);
          text.push(nm);
          return (
            <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 102 }}>
              <Face src={fs[i]} name={nm} size={74} ring={partyColor(m?.party)} />
              <span style={{ fontSize: 17, fontWeight: 600, marginTop: 4, textAlign: "center", width: 102, overflow: "hidden", whiteSpace: "nowrap" }}>{short(nm, locale === "zh" ? 6 : 11)}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color }}>{`×${n}`}</span>
            </div>
          );
        })}
      </div>
    ) : (
      <span style={{ fontSize: 22, color: C.faint }}>{l.noOne}</span>
    );
  const node = (
    <PosterPage>
      <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
        <Tile src={logo} sym={sym} size={150} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span style={{ fontSize: 26, color: C.muted, fontWeight: 500 }}>{`${sector} · ${short(name, 18)}`}</span>
          <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1 }}>{fill(l.tkTitle, { sym })}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 30, background: "#f5f5f7", borderRadius: 28, padding: "26px 32px", gap: 14 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: C.muted }}>{l.lastYear}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <span style={{ fontSize: 76, fontWeight: 700, color: ud.up, letterSpacing: -2 }}>{String(nb)}</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: ud.up }}>{l.buys}</span>
          <span style={{ fontSize: 44, color: C.faint }}>/</span>
          <span style={{ fontSize: 76, fontWeight: 700, color: ud.down, letterSpacing: -2 }}>{String(ns)}</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: ud.down }}>{l.sells}</span>
        </div>
        {nb + ns ? (
          <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "#e5e5ea" }}>
            <div style={{ width: `${(nb / (nb + ns)) * 100}%`, background: ud.up }} />
            <div style={{ flex: 1, background: ud.down, marginLeft: 3 }} />
          </div>
        ) : null}
        {st?.win != null && st?.x90 != null ? (
          <span style={{ fontSize: 22, color: C.muted, fontWeight: 500 }}>{fill(l.copyRec, { w: `${Math.round(st.win * 100)}%`, x: pct(st.x90) })}</span>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 26, gap: 12 }}>
        <span style={{ fontSize: 24, fontWeight: 700 }}>{`${l.buyers} (${buyers.length})`}</span>
        {wall(showB, bFaces, ud.up)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 20, gap: 12 }}>
        <span style={{ fontSize: 24, fontWeight: 700 }}>{`${l.sellers} (${sellers.length})`}</span>
        {wall(showS, sFaces, ud.down)}
      </div>
      {invs.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.muted, marginRight: 4 }}>{l.heldBy}</span>
          {invs.map((v, i) => {
            const r = invRows.find((x) => x.id === v.id);
            const nm = r ? (locale === "zh" ? r.zh : r.en) : v.id;
            text.push(nm);
            return (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f2f2f7", borderRadius: 30, padding: "4px 14px 4px 4px" }}>
                <Face src={iFaces[i]} name={nm} size={36} ring={iFaces[i] ? undefined : C.accent} />
                <span style={{ fontSize: 20, fontWeight: 600 }}>{nm}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <QrFooter locale={locale} path={`/${locale}/ticker/${encodeURIComponent(sym)}`} scan={fill(l.tkScan, { sym })} />
      </div>
    </PosterPage>
  );
  return posterResponse(node, text.join("") + "0123456789%+−×()/·", locale);
}

// ---------------------------------------------------------------- one 13F investor

export async function investorPoster(locale: Locale, id: string) {
  const d = getInvestor(id);
  const row = getInvestors().find((i) => i.id === id);
  if (!d || !row) return new Response("Not found", { status: 404 });
  const l = W[locale];
  const ud = upDown(locale);
  const name = locale === "zh" ? row.zh : row.en;
  const firm = locale === "zh" ? row.firm_zh : row.firm_en;
  const hold = d.holdings.filter((h) => h.w > 0);
  const top = hold.slice(0, 10);
  const rest = hold.slice(10).reduce((a, h) => a + h.w, 0);
  const pie = [...top.map((h, i) => ({ sym: h.sym ?? "", label: h.sym ?? short(h.name, 8), v: h.w, color: SLICE[i] })), ...(rest > 0 ? [{ sym: "", label: "", v: rest, color: OTHER }] : [])];
  const news = hold.filter((h) => h.chg === "new" && h.sym).slice(0, 5);
  const exits = d.exits.filter((h) => h.sym).slice(0, 5);
  const [face, ...logos] = await Promise.all([photoPng(`inv-${id}`, 360), ...top.map((h) => (h.sym ? logoPng(h.sym, 96) : Promise.resolve(null))), ...[...news, ...exits].map((h) => logoPng(h.sym!, 96))]);
  const pieLogos = logos.slice(0, top.length), chgLogos = logos.slice(top.length);
  const R = 140;
  const text: string[] = [name, firm, l.invValue, l.invN, l.invPeriod, l.top10, l.newPos, l.exits, l.invScan, locale === "zh" ? "其他" : "Other"];
  const node = (
    <PosterPage>
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <Face src={face} name={name} size={160} ring={face ? undefined : C.accent} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span style={{ fontSize: 26, color: C.muted, fontWeight: 500 }}>{firm}</span>
          <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1 }}>{name}</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30, background: "#f5f5f7", borderRadius: 28, padding: "24px 34px" }}>
        {[
          [usdShort(row.value), l.invValue],
          [String(row.n), l.invN],
          [row.period, l.invPeriod],
        ].map(([v, k]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: -1 }}>{v}</span>
            <span style={{ fontSize: 22, color: C.muted, fontWeight: 500 }}>{k}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 30 }}>
        <div style={{ display: "flex", position: "relative", width: R * 2, height: R * 2, flexShrink: 0 }}>
          <svg width={R * 2} height={R * 2} viewBox={`0 0 ${R * 2} ${R * 2}`}>
            {donut(pie, R, 54).map((p, i) => (
              <path key={i} d={p} fill={pie[i].color} fillRule="evenodd" />
            ))}
          </svg>
          <div style={{ position: "absolute", top: 0, left: 0, width: R * 2, height: R * 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {(locale === "zh" ? [l.top10] : ["Top 10", "holdings"]).map((x) => (
              <span key={x} style={{ fontSize: locale === "zh" ? 28 : 25, fontWeight: 700 }}>
                {x}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4 }}>
          {pie.map((p, i) => {
            const nm = p.sym ? short(tname(p.sym, locale), 11) : "";
            text.push(p.label, nm);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: p.color, flexShrink: 0 }} />
                {p.sym ? <Tile src={pieLogos[i]} sym={p.sym} size={30} /> : <div style={{ width: 30, height: 30, flexShrink: 0 }} />}
                <span style={{ fontSize: 23, fontWeight: 700, width: 92 }}>{p.label || (locale === "zh" ? "其他" : "Other")}</span>
                <span style={{ fontSize: 20, color: C.muted, fontWeight: 500, flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>{nm}</span>
                <span style={{ fontSize: 23, fontWeight: 700 }}>{`${(p.v * 100).toFixed(p.v < 0.1 ? 1 : 0)}%`}</span>
              </div>
            );
          })}
        </div>
      </div>
      {news.length || exits.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
          {[
            [l.newPos, news, ud.up, 0],
            [l.exits, exits, ud.down, news.length],
          ].map(([k, list, color, off]) =>
            (list as typeof news).length ? (
              <div key={String(k)} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", background: String(color), borderRadius: 30, padding: "3px 14px", width: 104, textAlign: "center", justifyContent: "center" }}>{String(k)}</span>
                {(list as typeof news).map((h, i) => (
                  <div key={h.sym} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f2f2f7", borderRadius: 30, padding: "4px 14px 4px 4px" }}>
                    <Tile src={chgLogos[(off as number) + i]} sym={h.sym!} size={34} />
                    <span style={{ fontSize: 21, fontWeight: 700 }}>{h.sym}</span>
                  </div>
                ))}
              </div>
            ) : null,
          )}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <QrFooter locale={locale} path={`/${locale}/investor/${id}`} scan={l.invScan} />
      </div>
    </PosterPage>
  );
  return posterResponse(node, text.join("") + [...news, ...exits].map((h) => h.sym).join("") + "0123456789%.$BMK-", locale);
}

// ---------------------------------------------------------------- party vs party

export async function partyPoster(locale: Locale) {
  const ins = getInsights();
  const p = ins?.party;
  if (!p?.D || !p?.R) return new Response("Not found", { status: 404 });
  const t = dict(locale);
  const l = W[locale];
  const CW = 952, CH = 250;
  const ys = [...p.D.pts, ...p.R.pts].flatMap((x) => [x[1], x[2]]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const col = (k: "D" | "R") => {
    const v = p[k];
    const sectors = v.sectors.filter(([s]) => s !== "other" && s !== "fund").slice(0, 3).map(([s]) => t.sectors[s as keyof typeof t.sectors] ?? s);
    return { k, v, sectors };
  };
  const cols = [col("D"), col("R")];
  const text: string[] = [l.ptTitle, l.ptSub, l.members, l.trades, l.buys, l.sells, l.ptCagr, l.ptWin, l.favSectors, l.copyD, l.copyR, l.spy, l.ptScan, t.party.D, t.party.R, ...cols.flatMap((c) => c.sectors)];
  const node = (
    <PosterPage>
      <PosterTitle eyebrow={locale === "zh" ? "美国国会 · 两党对决" : "US Congress · head to head"} title={l.ptTitle} sub={l.ptSub} />
      <div style={{ display: "flex", gap: 20, marginTop: 28 }}>
        {cols.map(({ k, v, sectors }) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 28, padding: "24px 28px", background: k === "D" ? "#eef3fd" : "#fdeeed", gap: 12 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: PARTY[k] }}>{t.party[k]}</span>
            <span style={{ fontSize: 22, color: C.muted, fontWeight: 500 }}>{`${v.members} ${l.members} · ${v.trades.toLocaleString("en-US")} ${l.trades}`}</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 20, color: C.muted, fontWeight: 500 }}>{l.ptCagr}</span>
              <span style={{ fontSize: 72, fontWeight: 700, color: PARTY[k], letterSpacing: -2, lineHeight: 1.05 }}>{v.cagr != null ? pct(v.cagr) : "—"}</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 600 }}>{`${l.ptWin} ${v.win != null ? `${Math.round(v.win * 100)}%` : "—"}`}</span>
            <span style={{ fontSize: 21, color: C.muted, fontWeight: 500 }}>{`${l.buys} ${v.buys.toLocaleString("en-US")} · ${l.sells} ${v.sells.toLocaleString("en-US")}`}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 20, color: C.muted, fontWeight: 500 }}>{l.favSectors}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {sectors.map((s) => (
                  <span key={s} style={{ fontSize: 21, fontWeight: 700, background: "#fff", borderRadius: 20, padding: "3px 14px" }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 26, gap: 10 }}>
        <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
          <path d={linePath(p.D.pts.map((x) => x[2]), CW, CH, lo, hi)} fill="none" stroke="#a1a1a6" strokeWidth="3" />
          <path d={linePath(p.D.pts.map((x) => x[1]), CW, CH, lo, hi)} fill="none" stroke={PARTY.D} strokeWidth="4.5" />
          <path d={linePath(p.R.pts.map((x) => x[1]), CW, CH, lo, hi)} fill="none" stroke={PARTY.R} strokeWidth="4.5" />
        </svg>
        <div style={{ display: "flex", gap: 26, fontSize: 21, fontWeight: 500, color: C.muted }}>
          {[
            [PARTY.D, l.copyD],
            [PARTY.R, l.copyR],
            ["#a1a1a6", l.spy],
          ].map(([c, k]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 5, borderRadius: 3, background: c }} />
              <span>{k}</span>
            </div>
          ))}
          <span style={{ marginLeft: "auto" }}>{`${p.D.pts[0][0]} – ${p.D.pts[p.D.pts.length - 1][0]}`}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <QrFooter locale={locale} path={`/${locale}/insights#party`} scan={l.ptScan} />
      </div>
    </PosterPage>
  );
  return posterResponse(node, text.join("") + "0123456789%+−·–/,", locale);
}

// ---------------------------------------------------------------- the week

export async function weekPoster(locale: Locale) {
  const t = dict(locale);
  const l = W[locale];
  const ud = upDown(locale);
  const ppl = people();
  const end = getMeta()?.data_through ?? new Date().toISOString().slice(0, 10);
  // a week when it was busy enough; otherwise two weeks or a month, and the title says which
  const recent = getRecent();
  let days = 7;
  let from = "";
  let week = recent;
  for (const n of [7, 14, 30]) {
    days = n;
    from = new Date(Date.parse(end) - (n - 1) * 864e5).toISOString().slice(0, 10);
    week = recent.filter((x) => (x.fil ?? "") >= from && (x.fil ?? "") <= end);
    if (new Set(week.filter((x) => x.type === "P" && x.sym).map((x) => x.sym)).size >= 6) break;
  }
  const officials = new Set(week.map((x) => x.m));
  const nb = week.filter((x) => x.type === "P").length;
  const ns = week.filter((x) => x.type !== "P" && x.type !== "E").length;
  const bySym = new Map<string, Set<string>>();
  const nBuys = new Map<string, number>();
  for (const x of week)
    if (x.type === "P" && x.sym) {
      (bySym.get(x.sym) ?? bySym.set(x.sym, new Set()).get(x.sym)!).add(x.m);
      nBuys.set(x.sym, (nBuys.get(x.sym) ?? 0) + 1);
    }
  const top = [...bySym.entries()].sort((a, b) => b[1].size - a[1].size || (nBuys.get(b[0]) ?? 0) - (nBuys.get(a[0]) ?? 0) || a[0].localeCompare(b[0])).slice(0, 8);
  const biggest = [...week].filter((x) => x.sym).sort((a, b) => (b.amax ?? b.amin ?? 0) - (a.amax ?? a.amin ?? 0))[0];
  const bm = biggest ? ppl.get(biggest.m) : undefined;
  const [bigFace, bigLogo, ...logos] = await Promise.all([
    biggest ? photoPng(biggest.m, 160) : Promise.resolve(null),
    biggest?.sym ? logoPng(biggest.sym, 160) : Promise.resolve(null),
    ...top.map(([s]) => logoPng(s, 96)),
  ]);
  const faces = await Promise.all(top.map(([, ms]) => Promise.all([...ms].slice(0, 4).map((id) => photoPng(id, 80)))));
  const range = fill(l.wkRange, { from, to: end });
  const title = days === 7 ? l.wkTitle : days === 14 ? l.wkTitle14 : l.wkTitle30;
  const topLabel = days === 7 ? l.wkTop : days === 14 ? l.wkTop14 : l.wkTop30;
  const bigLabel = days === 7 ? l.wkBiggest : days === 14 ? l.wkBiggest14 : l.wkBiggest30;
  const text: string[] = [title, topLabel, bigLabel, range, l.wkTrades, l.wkOfficials, l.buys, l.sells, l.wkTop, l.wkBiggest, l.wkBuyers, l.wkScan];
  const bigName = biggest ? pname(bm, biggest.m, locale) : "";
  const bigAct = biggest ? (biggest.act && t.acts[biggest.act as keyof typeof t.acts]) || t.types[biggest.type] : "";
  text.push(bigName, bigAct);
  const node = (
    <PosterPage>
      <PosterTitle eyebrow={range} title={title} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 26, background: "#f5f5f7", borderRadius: 28, padding: "22px 34px" }}>
        {[
          [String(week.length), l.wkTrades, C.text],
          [String(officials.size), l.wkOfficials, C.text],
          [String(nb), l.buys, ud.up],
          [String(ns), l.sells, ud.down],
        ].map(([v, k, c]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 56, fontWeight: 700, color: c, letterSpacing: -1 }}>{v}</span>
            <span style={{ fontSize: 22, color: C.muted, fontWeight: 500 }}>{k}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 28 }}>
        <span style={{ fontSize: 28, fontWeight: 700 }}>{topLabel}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14 }}>
        {top.map(([s, ms], i) => {
          const nm = short(tname(s, locale), 9);
          text.push(nm);
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 14, width: 469, border: "2px solid #ececf0", borderRadius: 22, padding: "12px 16px" }}>
              <Tile src={logos[i]} sym={s} size={54} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ fontSize: 26, fontWeight: 700 }}>{s}</span>
                <span style={{ fontSize: 18, color: C.muted, fontWeight: 500 }}>{nm}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <div style={{ display: "flex" }}>
                  {[...ms].slice(0, 4).map((id, j) => (
                    <div key={id} style={{ display: "flex", marginLeft: j ? -10 : 0 }}>
                      <Face src={faces[i][j]} name={pname(ppl.get(id), id, locale)} size={36} />
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 17, fontWeight: 700, color: ud.up }}>{fill(l.wkBuyers, { n: ms.size, b: nBuys.get(s) ?? 0 })}</span>
              </div>
            </div>
          );
        })}
      </div>
      {biggest ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 24, gap: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 700 }}>{bigLabel}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 18, background: "#f5f5f7", borderRadius: 24, padding: "18px 24px" }}>
            <Face src={bigFace} name={bigName} size={76} ring={partyColor(bm?.party)} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontSize: 30, fontWeight: 700 }}>{bigName}</span>
              <span style={{ fontSize: 20, color: C.muted, fontWeight: 500 }}>{roleShort(bm, locale)}</span>
            </div>
            <Pill text={bigAct} bg={biggest.type === "P" ? ud.up : ud.down} />
            <Tile src={bigLogo} sym={biggest.sym!} size={60} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 30, fontWeight: 700 }}>{biggest.sym}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: biggest.type === "P" ? ud.up : ud.down }}>{amountRange(biggest.amin, biggest.amax)}</span>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <QrFooter locale={locale} path={`/${locale}/latest`} scan={l.wkScan} />
      </div>
    </PosterPage>
  );
  text.push(roleShort(bm, locale), biggest?.sym ?? "", ...top.map(([s]) => s), amountRange(biggest?.amin, biggest?.amax));
  return posterResponse(node, text.join("") + "0123456789%+−·–$KM", locale);
}
