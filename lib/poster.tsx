import "server-only";
// Portrait posters (1080x1440, 3:4) for sharing on Xiaohongshu, WeChat Moments, Weibo, Instagram, X.
// One official per poster: the copy-trading result against the S&P 500, the estimated top-10
// holdings as a donut with logos, the best trade, filing habits, and a QR code back to the site.
import { donut, fill, OTHER, pct, posterResponse, QrFooter, short, SLICE } from "./poster-kit";
import { getLatestPrices, getMedia, getMember, getMembers, getTickers } from "./data";
import { amountRange } from "./format";
import { dict, type Locale } from "./i18n";
import { C, logoPng, partyColor, photoPng, siteHost, upDown } from "./og";
import { roleShort } from "./people";
import { siteUrl } from "./site";

const T = {
  zh: {
    copyHero: "跟着 TA 买，年化",
    copyTotal: "跟着 TA 买，累计",
    bench: "同期标普 500",
    beat: "跑赢 {d}",
    lag: "落后 {d}",
    since: "{from} 起，按公开日跟单买入",
    noNav: "交易记录",
    trades: "笔交易",
    volume: "估算交易额",
    top10: "前十大持仓",
    estimated: "估算",
    mostTraded: "最常交易",
    times: "次",
    other: "其他",
    best: "最赚的一笔",
    bestLine: "{act} {sym}，公开后 90 天",
    worst: "最亏的一笔",
    nTrades: "交易笔数",
    buysSells: "买入 / 卖出",
    avgDelay: "平均申报用时",
    days: "天",
    late: "逾期申报",
    times2: "次",
    scan: "扫码查看 TA 的全部交易",
    foot: "数据来自美国国会与政府道德办公室公开披露 · 持仓按申报金额与最新价格估算 · 不构成投资建议",
    copyCurve: "跟单组合",
    spy: "标普 500",
  },
  en: {
    copyHero: "Copying their buys:",
    copyTotal: "Copying their buys, total:",
    bench: "S&P 500 over the same period",
    beat: "beats it by {d}",
    lag: "trails it by {d}",
    since: "Buying at disclosure since {from}",
    noNav: "Trading record",
    trades: "trades",
    volume: "est. volume",
    top10: "Top 10 holdings",
    estimated: "estimated",
    mostTraded: "Most traded",
    times: "×",
    other: "Other",
    best: "Best trade",
    bestLine: "{act} {sym}, 90 days after disclosure",
    worst: "Worst trade",
    nTrades: "Trades",
    buysSells: "Buys / sells",
    avgDelay: "Avg. time to disclose",
    days: "days",
    late: "Late filings",
    times2: "",
    scan: "Scan to see every trade",
    foot: "From public disclosures to Congress and the Office of Government Ethics · holdings estimated from reported amounts and latest prices · not investment advice",
    copyCurve: "Copy portfolio",
    spy: "S&P 500",
  },
};

export async function memberPoster(locale: Locale, id: string): Promise<Response> {
  const d = getMember(id);
  if (!d) return new Response("Not found", { status: 404 });
  const t = dict(locale);
  const l = T[locale];
  const ud = upDown(locale);
  const row = getMembers().find((m) => m.id === id);
  const name = locale === "zh" && d.profile.zh ? d.profile.zh : d.profile.name;
  const party = d.profile.party ? (t.party[d.profile.party as keyof typeof t.party] ?? "") : "";
  const role = roleShort(row, locale);
  const s = d.summary;
  const media = getMedia();
  const { px } = getLatestPrices();
  const tnames = new Map(getTickers().map((x) => [x.sym, locale === "zh" && x.zh ? x.zh : x.name]));

  // ---- estimated holdings: still-held positions, share range midpoint x latest close
  const held = d.positions
    .filter((p) => p.held && p.sym && px[p.sym])
    .map((p) => {
      const last = p.steps[p.steps.length - 1];
      const sh = ((last.lo ?? 0) + (last.hi ?? last.lo ?? 0)) / 2;
      return { sym: p.sym, v: sh * px[p.sym] };
    })
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  let pie: { sym: string; v: number; label: string }[];
  let pieTitle = l.top10;
  let pieNote = l.estimated;
  let byCount = false;
  if (held.length >= 2) {
    const total = held.reduce((a, x) => a + x.v, 0);
    pie = held.slice(0, 10).map((x) => ({ sym: x.sym, v: x.v, label: `${((x.v / total) * 100).toFixed(x.v / total < 0.1 ? 1 : 0)}%` }));
    const rest = held.slice(10).reduce((a, x) => a + x.v, 0);
    if (rest > 0) pie.push({ sym: "", v: rest, label: `${((rest / total) * 100).toFixed(0)}%` });
  } else {
    // nothing held that we can price: show what they trade most instead
    byCount = true;
    pieTitle = l.mostTraded;
    pieNote = "";
    pie = (d.style?.top ?? []).slice(0, 10).map(([sym, n]) => ({ sym, v: n, label: `${n}${l.times}` }));
  }
  const slices = pie.map((p, i) => ({ v: p.v, color: p.sym ? SLICE[i % SLICE.length] : OTHER }));

  // ---- best trade, measured from disclosure (what a follower could have caught)
  let best: { sym: string; r: number; act: string; amt: string } | null = null;
  for (const tr of d.trades) {
    if (tr.type !== "P" || !tr.sym) continue;
    const h = tr.h?.["90"];
    const r = h?.[1] ?? null;
    if (r == null) continue;
    if (!best || r > best.r) best = { sym: tr.sym, r, act: (tr.act && t.acts[tr.act as keyof typeof t.acts]) || t.types.P, amt: amountRange(tr.amin, tr.amax) };
  }

  // ---- copy portfolio vs S&P 500
  const nav = d.nav && d.nav.pts?.length > 10 ? d.nav : null;
  const longEnough = nav && nav.cagr != null;
  const heroVal = nav ? (longEnough ? nav.cagr! : nav.total) : null;
  const benchVal = nav ? (longEnough ? nav.bcagr! : nav.bench) : null;
  const diff = heroVal != null && benchVal != null ? heroVal - benchVal : null;

  const [photo, logos] = await Promise.all([photoPng(id, 420), Promise.all(pie.map((p) => (p.sym ? logoPng(p.sym, 96) : Promise.resolve(null))))]);
  const site = siteUrl();
  const host = siteHost(site);

  // chart geometry
  const CW = 400, CH = 150;
  let paths: { a: string; b: string } | null = null;
  if (nav) {
    const pts = nav.pts;
    const ys = pts.flatMap((p) => [p[1], p[2]]);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const X = (i: number) => (i / (pts.length - 1)) * CW;
    const Y = (v: number) => CH - 6 - ((v - lo) / (hi - lo || 1)) * (CH - 12);
    const line = (k: 1 | 2) => pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join("");
    paths = { a: line(1), b: line(2) };
  }
  const heroColor = heroVal == null ? C.text : heroVal >= 0 ? ud.up : ud.down;

  const stats: [string, string, string?][] = [
    [s.n.toLocaleString("en-US"), l.nTrades],
    [`${s.nb} / ${s.ns}`, l.buysSells],
    [d.delay.avg != null ? `${Math.round(d.delay.avg)} ${l.days}` : "—", l.avgDelay],
    [`${d.delay.late}${l.times2 ? ` ${l.times2}` : ""}`, l.late, d.delay.late > 0 ? "#c93400" : undefined],
  ];

  const R = 136;
  const node = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "SC", color: C.text, padding: "48px 64px 40px" }}>
      {/* who */}
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        {photo ? (
          <img src={photo} width={168} height={168} style={{ width: 168, height: 168, borderRadius: 168, border: `6px solid ${partyColor(d.profile.party)}`, objectFit: "cover" }} alt="" />
        ) : (
          <div style={{ width: 168, height: 168, borderRadius: 168, background: partyColor(d.profile.party), color: "#fff", fontSize: 84, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{[...name][0]}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {party ? <span style={{ fontSize: 24, fontWeight: 700, color: "#fff", background: partyColor(d.profile.party), borderRadius: 30, padding: "3px 16px" }}>{party}</span> : null}
            <span style={{ fontSize: 26, color: C.muted, fontWeight: 500 }}>{role}</span>
          </div>
          <span style={{ fontSize: name.length > 9 ? 64 : 80, fontWeight: 700, letterSpacing: -2, lineHeight: 1.12, marginTop: 8 }}>{name}</span>
          {locale === "zh" && d.profile.zh ? <span style={{ fontSize: 30, color: C.muted, fontWeight: 500 }}>{d.profile.name}</span> : null}
        </div>
      </div>

      {/* the headline number */}
      <div style={{ display: "flex", marginTop: 30, background: "#f5f5f7", borderRadius: 32, padding: "26px 36px", alignItems: "center", gap: 28 }}>
        {nav && heroVal != null ? (
          <div style={{ display: "flex", flexDirection: "column", width: 880 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", width: 450 }}>
                <span style={{ fontSize: 30, fontWeight: 700 }}>{longEnough ? l.copyHero : l.copyTotal}</span>
                <span style={{ fontSize: 108, fontWeight: 700, color: heroColor, letterSpacing: -4, lineHeight: 1.05 }}>{pct(heroVal)}</span>
              </div>
              {paths ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, width: CW }}>
                  <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
                    <path d={paths.b} fill="none" stroke="#a1a1a6" strokeWidth="3" strokeLinejoin="round" />
                    <path d={paths.a} fill="none" stroke={heroColor} strokeWidth="4.5" strokeLinejoin="round" />
                  </svg>
                  <div style={{ display: "flex", gap: 20, fontSize: 20, fontWeight: 500, color: C.muted }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 22, height: 5, borderRadius: 3, background: heroColor }} />
                      <span>{l.copyCurve}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 22, height: 5, borderRadius: 3, background: "#a1a1a6" }} />
                      <span>{l.spy}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "baseline", fontSize: 27, fontWeight: 500, color: C.muted, marginTop: 10 }}>
              <span>{`${l.bench} ${pct(benchVal!)}`}</span>
              {diff != null ? (
                <span style={{ fontWeight: 700, color: diff >= 0 ? ud.up : ud.down }}>{fill(diff >= 0 ? l.beat : l.lag, { d: `${Math.abs(diff * 100).toFixed(1)}${locale === "zh" ? " 个百分点" : " pts"}` })}</span>
              ) : null}
            </div>
            <span style={{ fontSize: 21, color: C.faint, fontWeight: 500, marginTop: 6 }}>{fill(l.since, { from: nav.from })}</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 30, fontWeight: 700 }}>{l.noNav}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>{s.n.toLocaleString("en-US")}</span>
              <span style={{ fontSize: 40, fontWeight: 700, color: C.muted }}>{l.trades}</span>
            </div>
            <span style={{ fontSize: 28, color: C.muted, fontWeight: 500 }}>
              {l.volume} {amountRange(s.vmin, s.vmax)}
            </span>
          </div>
        )}
      </div>

      {/* holdings donut */}
      {pie.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 44, marginTop: 28 }}>
          <div style={{ display: "flex", position: "relative", width: R * 2, height: R * 2, flexShrink: 0 }}>
            <svg width={R * 2} height={R * 2} viewBox={`0 0 ${R * 2} ${R * 2}`}>
              {donut(slices, R, 52).map((p, i) => (
                <path key={i} d={p} fill={slices[i].color} fillRule="evenodd" />
              ))}
            </svg>
            <div style={{ position: "absolute", top: 0, left: 0, width: R * 2, height: R * 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              {(locale === "zh" ? [pieTitle] : pieTitle.replace(/^(\S+(?: \d+)?) /, "$1\n").split("\n")).map((line) => (
                <span key={line} style={{ fontSize: locale === "zh" ? 28 : 25, fontWeight: 700, lineHeight: 1.15 }}>
                  {line}
                </span>
              ))}
              {pieNote ? <span style={{ fontSize: 20, color: C.faint, fontWeight: 500 }}>{pieNote}</span> : null}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4 }}>
            {pie.slice(0, 11).map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: slices[i].color, flexShrink: 0 }} />
                {p.sym ? (
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: media.logos[p.sym] === 3 ? "#1d1d1f" : "#fff", border: media.logos[p.sym] === 3 ? "none" : "1.5px solid #e5e5ea", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                    {logos[i] ? <img src={logos[i]!} width={24} height={24} style={{ objectFit: "contain" }} alt="" /> : <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>{p.sym.slice(0, 3)}</span>}
                  </div>
                ) : (
                  <div style={{ width: 30, height: 30, flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 24, fontWeight: 700, width: 100 }}>{p.sym || l.other}</span>
                <span style={{ fontSize: 21, color: C.muted, fontWeight: 500, flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>{p.sym ? short(tnames.get(p.sym) ?? "") : ""}</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: byCount ? C.muted : C.text }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* best trade + habits */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 18 }}>
        {best ? (
          <div style={{ display: "flex", alignItems: "center", gap: 20, borderRadius: 24, border: "2px solid #ececf0", padding: "14px 26px" }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: "#fff", background: C.text, borderRadius: 30, padding: "4px 16px" }}>{l.best}</span>
            <span style={{ fontSize: 26, fontWeight: 500, flex: 1 }}>{fill(l.bestLine, { act: best.act, sym: best.sym })}</span>
            <span style={{ fontSize: 44, fontWeight: 700, color: best.r >= 0 ? ud.up : ud.down }}>{pct(best.r, 0)}</span>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {stats.map(([v, k, color]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 36, fontWeight: 700, color: color ?? C.text, letterSpacing: -1 }}>{v}</span>
              <span style={{ fontSize: 21, color: C.muted, fontWeight: 500 }}>{k}</span>
            </div>
          ))}
        </div>

        <QrFooter locale={locale} path={`/${locale}/member/${id}`} scan={l.scan} />
      </div>
    </div>
  );

  const text = [
    ...Object.values(l),
    name, d.profile.name, party, role, t.siteName, host, amountRange(s.vmin, s.vmax),
    ...pie.map((p) => `${p.sym}${p.label}${tnames.get(p.sym) ?? ""}`),
    best ? `${best.act}${best.sym}` : "",
    nav?.from ?? "", "个百分点", "pts",
  ].join("");
  return posterResponse(node, text, locale);
}
