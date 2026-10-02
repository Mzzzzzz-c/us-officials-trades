import "server-only";
// Timeline posters (1080x1440, with a QR code): the trades of one official, company insider or 13F
// investor, or every trade in one stock, drawn on a time axis with the largest ones listed below.
//   /zh/poster/timeline/member/P000197   /zh/poster/timeline/insider/1494730
//   /zh/poster/timeline/investor/buffett /zh/poster/timeline/ticker/NVDA
import type { TLItem } from "@/components/client/Timeline";
import { getInsider, getInsiderPeople, getInvestor, getMedia, getMember, getMeta, getSeries, getTicker, insiderName, insiderTitle, tickerName } from "./data";
import { usdShort } from "./format";
import { dict, type Locale } from "./i18n";
import { roleLabel } from "./labels";
import { C, logoPng, partyColor, photoPng, upDown } from "./og";
import { PosterPage, posterResponse, QrFooter, short } from "./poster-kit";
import { insiderItems, investorItems, officialItems } from "./timeline";

const W = {
  zh: { title: "交易时间轴", buys: "买入", sells: "卖出", n: "{n} 笔", biggest: "金额最大的交易", scan: "扫码查看可交互的完整时间轴", price: "股价", window: "{a} 至 {b}", est: "约", none: "这段时间没有交易", lanes: ["官员", "公司内部人"], who: "谁在买卖 {sym}" },
  en: { title: "Trade timeline", buys: "Buys", sells: "Sells", n: "{n} trades", biggest: "Largest trades", scan: "Scan for the full interactive timeline", price: "Price", window: "{a} to {b}", est: "≈", none: "No trades in this period", lanes: ["Officials", "Company insiders"], who: "Who trades {sym}" },
};
const DAY = 864e5;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const f = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

interface Spec {
  title: string;
  sub: string;
  face?: string | null;
  logo?: { src: string | null; sym: string; dark: boolean };
  ring?: string;
  items: TLItem[];
  lanes: string[];
  price?: [string, number][];
  priceSym?: string;
  path: string;
  /** years of history to draw */
  years: number;
}

async function render(locale: Locale, spec: Spec): Promise<Response> {
  const l = W[locale];
  const ud = upDown(locale);
  const today = getMeta()?.generated?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const end = ms(today) + 10 * DAY;
  const firstItem = spec.items.reduce((a, i) => Math.min(a, ms(i.d)), end);
  const start = Math.max(firstItem - 20 * DAY, end - spec.years * 365 * DAY);
  const items = spec.items.filter((i) => ms(i.d) >= start);
  const PW = 952;
  const two = spec.lanes.length > 1;
  const PH = spec.price ? (two ? 190 : 230) : 0;
  const LH = two ? 124 : 210;
  const X = (t: number) => ((t - start) / (end - start)) * PW;
  const laneTop = (k: number) => PH + 16 + k * LH;
  const H = laneTop(spec.lanes.length) + 8;
  const col = (s: TLItem["side"]) => (s === "b" ? ud.up : s === "s" ? ud.down : C.faint);

  // price line
  let pricePath = "";
  let lo = Infinity, hi = -Infinity;
  if (spec.price) {
    const pts = spec.price.map(([d, c]) => [ms(d), c] as const).filter(([t]) => t >= start && t <= end);
    for (const [, c] of pts) {
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    }
    const pad = (hi - lo) * 0.06 || 1;
    pricePath = pts.map(([t, c], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${(8 + (1 - (c - lo + pad) / (hi - lo + 2 * pad)) * (PH - 16)).toFixed(1)}`).join("");
  }

  // dots: trades close together merge into one
  const bins = new Map<string, { x: number; lane: number; side: TLItem["side"]; v: number; n: number }>();
  for (const it of items) {
    const lane = Math.min(spec.lanes.length - 1, it.lane ?? 0);
    const slot = Math.round(X(ms(it.d)) / 22);
    const key = `${lane}:${it.side}:${slot}`;
    const b = bins.get(key) ?? { x: slot * 22, lane, side: it.side, v: 0, n: 0 };
    b.v += it.v;
    b.n += 1;
    bins.set(key, b);
  }
  const dots = [...bins.values()];
  const vmax = spec.lanes.map((_, k) => Math.max(1, ...dots.filter((d) => d.lane === k).map((d) => d.v)));
  const years: { x: number; label: string }[] = [];
  for (let y = new Date(start).getUTCFullYear(); y <= new Date(end).getUTCFullYear(); y++) {
    const t = Date.UTC(y, 0, 1);
    if (t >= start && t <= end) years.push({ x: X(t), label: locale === "zh" ? `${y}年` : String(y) });
  }

  // a stock's poster counts officials in the headline numbers; insiders trade on another scale
  const counted = two ? items.filter((i) => (i.lane ?? 0) === 0) : items;
  const buys = counted.filter((i) => i.side === "b");
  const sells = counted.filter((i) => i.side === "s");
  const sum = (xs: TLItem[]) => xs.reduce((a, i) => a + i.v, 0);
  // the largest trades, one line per person or stock, from each lane in turn
  const top: TLItem[] = [];
  const perLane = spec.lanes.map((_, k) => {
    const seen = new Set<string>();
    return [...items].filter((i) => Math.min(spec.lanes.length - 1, i.lane ?? 0) === k).sort((a, b) => b.v - a.v).filter((i) => (two ? !seen.has(i.title) && seen.add(i.title) : true));
  });
  const want = two ? 4 : spec.price ? 5 : 6;
  for (let r = 0; top.length < want && perLane.some((l) => l[r]); r++) for (const l of perLane) if (l[r] && top.length < want) top.push(l[r]);
  top.sort((a, b) => b.v - a.v);
  const text = [spec.title, spec.sub, l.title, l.buys, l.sells, l.n, l.biggest, l.scan, l.price, l.window, l.est, l.none, ...spec.lanes, ...years.map((y) => y.label), ...top.flatMap((i) => [i.title, i.amount, i.d])];
  const from = new Date(start).toISOString().slice(0, 10);

  const stat = (label: string, xs: TLItem[], color: string) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#f5f5f7", borderRadius: 24, padding: "18px 26px" }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: C.muted }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 54, fontWeight: 700, color, letterSpacing: -1.5 }}>{xs.length ? `${l.est === "约" ? "约 " : "≈ "}${usdShort(sum(xs))}` : "—"}</span>
      </div>
      <span style={{ fontSize: 22, fontWeight: 500, color: C.muted }}>{f(l.n, { n: xs.length })}</span>
    </div>
  );

  const node = (
    <PosterPage>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        {spec.logo ? (
          <div style={{ width: 130, height: 130, borderRadius: 31, background: spec.logo.dark ? "#1d1d1f" : "#fff", border: spec.logo.dark ? "none" : "1.5px solid #e5e5ea", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            {spec.logo.src ? <img src={spec.logo.src} width={104} height={104} style={{ objectFit: "contain" }} alt="" /> : <span style={{ fontSize: 38, fontWeight: 700, color: C.muted }}>{spec.logo.sym.slice(0, 4)}</span>}
          </div>
        ) : spec.face ? (
          <img src={spec.face} width={130} height={130} style={{ width: 130, height: 130, borderRadius: 130, border: `5px solid ${spec.ring ?? C.ind}`, objectFit: "cover", flexShrink: 0 }} alt="" />
        ) : (
          <div style={{ width: 130, height: 130, borderRadius: 130, background: spec.ring ?? C.ind, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 54, fontWeight: 700, flexShrink: 0 }}>{[...spec.title][0] ?? "?"}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", width: 790 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: C.accent }}>{l.title}</span>
          <span style={{ fontSize: [...spec.title].length > 14 ? 54 : 70, fontWeight: 700, letterSpacing: -2, lineHeight: 1.12 }}>{spec.title}</span>
          <span style={{ fontSize: 24, color: C.muted, fontWeight: 500, marginTop: 4 }}>{spec.sub}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 26 }}>
        {stat(two ? `${spec.lanes[0]} · ${l.buys}` : l.buys, buys, ud.up)}
        {stat(two ? `${spec.lanes[0]} · ${l.sells}` : l.sells, sells, ud.down)}
      </div>

      <div style={{ display: "flex", position: "relative", width: PW, height: H + 34, marginTop: 24 }}>
        <svg width={PW} height={H} viewBox={`0 0 ${PW} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
          {years.map((y) => (
            <line key={y.label} x1={y.x} x2={y.x} y1={0} y2={H} stroke="#e5e5ea" strokeWidth={2} />
          ))}
          {pricePath ? <path d={pricePath} fill="none" stroke="#1d1d1f" strokeWidth={3} strokeLinejoin="round" /> : null}
          {spec.lanes.map((_, k) => (
            <line key={k} x1={0} x2={PW} y1={laneTop(k) + LH / 2} y2={laneTop(k) + LH / 2} stroke="#d1d1d6" strokeWidth={2} />
          ))}
          {dots.map((d, k) => {
            const r = 7 + 17 * Math.sqrt(d.v / vmax[d.lane]);
            const y = laneTop(d.lane) + LH / 2 + (d.side === "b" ? -1 : d.side === "s" ? 1 : 0) * (LH / 4);
            return <circle key={k} cx={Math.min(PW - r, Math.max(r, d.x))} cy={y} r={r} fill={col(d.side)} fillOpacity={0.85} stroke="#fff" strokeWidth={2.5} />;
          })}
        </svg>
        {spec.price ? (
          <span style={{ position: "absolute", left: 0, top: 0, fontSize: 20, fontWeight: 700, color: C.muted, background: "#fff", paddingRight: 8 }}>{`${spec.priceSym} ${l.price} $${lo < 10 ? lo.toFixed(2) : Math.round(lo)}–$${hi < 10 ? hi.toFixed(2) : Math.round(hi)}`}</span>
        ) : null}
        {spec.lanes.length > 1 || spec.price
          ? spec.lanes.map((name, k) => (
              <span key={name} style={{ position: "absolute", left: 0, top: laneTop(k) - 2, fontSize: 20, fontWeight: 700, color: C.muted, background: "#fff", paddingRight: 8 }}>
                {name}
              </span>
            ))
          : null}
        {years.map((y) => (
          <span key={y.label} style={{ position: "absolute", left: Math.min(PW - 90, y.x + 6), top: H + 2, fontSize: 21, fontWeight: 600, color: C.muted }}>
            {y.label}
          </span>
        ))}
        {!items.length ? <span style={{ position: "absolute", left: 0, top: H / 2 - 16, width: PW, justifyContent: "center", display: "flex", fontSize: 26, color: C.faint }}>{l.none}</span> : null}
      </div>

      {top.length ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
          <span style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>{l.biggest}</span>
          {top.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "9px 0", borderBottom: "2px solid #f0f0f3" }}>
              <span style={{ width: 150, fontSize: 22, color: C.muted, fontWeight: 500 }}>{it.d}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#fff", background: col(it.side), borderRadius: 30, padding: "2px 14px" }}>{it.side === "b" ? l.buys : l.sells}</span>
              <span style={{ width: 430, fontSize: 25, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap" }}>{short(it.title, locale === "zh" ? 16 : 28)}</span>
              <span style={{ display: "flex", flex: 1, justifyContent: "flex-end", fontSize: 26, fontWeight: 700 }}>{it.amount}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <QrFooter locale={locale} path={spec.path} scan={l.scan} />
      </div>
    </PosterPage>
  );
  return posterResponse(node, text.join("") + f(l.window, { a: from, b: today }) + "≈约$–KMB", locale);
}

export async function timelinePoster(locale: Locale, kind: string, rawId: string): Promise<Response> {
  const id = decodeURIComponent(rawId);
  const t = dict(locale);
  const nf = new Response("Not found", { status: 404 });
  if (kind === "member") {
    const d = getMember(id);
    if (!d) return nf;
    const p = d.profile;
    const title = locale === "zh" && p.zh ? p.zh : p.name;
    const sub = p.chamber === "E" ? roleLabel(p, locale) : `${t.chamber[p.chamber]} · ${p.state} · ${t.party[p.party as keyof typeof t.party] ?? ""}`;
    const items = officialItems(d.trades.filter((x) => x.tx).slice(0, 3000), locale, "person");
    return render(locale, { title, sub, face: await photoPng(p.id, 260), ring: partyColor(p.party), items, lanes: [t.tl.lanes.trades], path: `/${locale}/member/${p.id}#timeline`, years: 3 });
  }
  if (kind === "ticker") {
    const sym = id.toUpperCase();
    const d = getTicker(sym);
    if (!d) return nf;
    const ins = getInsider(sym);
    const items = [...officialItems(d.trades.filter((x) => x.tx), locale, "stock", 0), ...(ins?.tx.length ? insiderItems(ins.tx, sym, ins.cik, locale, "stock", 1) : [])];
    const name = locale === "zh" && d.zh ? d.zh : d.name;
    return render(locale, {
      title: f(W[locale].who, { sym }),
      sub: short(name, 30),
      logo: { src: await logoPng(sym, 260), sym, dark: getMedia().logos[sym] === 3 },
      items,
      lanes: ins?.tx.length ? W[locale].lanes : [W[locale].lanes[0]],
      price: getSeries(sym)?.w,
      priceSym: sym,
      path: `/${locale}/ticker/${encodeURIComponent(sym)}#timeline`,
      years: 2,
    });
  }
  if (kind === "insider") {
    if (!/^\d{1,10}$/.test(id)) return nf;
    const p = getInsiderPeople().byId.get(Number(id));
    if (!p) return nf;
    const items = p[4].flatMap((sym) => {
      const file = getInsider(sym);
      return file ? insiderItems(file.tx.filter((r) => r[11] === p[0]), sym, file.cik, locale, "person") : [];
    });
    const role = insiderTitle(p[3]) || [...p[2]].map((c) => t.insider.rel[c as keyof typeof t.insider.rel] ?? "").filter(Boolean).join(" · ");
    const one = p[4].length === 1;
    const face = await photoPng(`ins-${p[0]}`, 260);
    return render(locale, {
      title: (locale === "zh" && p[11]) || p[10] || insiderName(p[1]),
      sub: `${p[4].slice(0, 3).join(" · ")} ${one ? (tickerName(p[4][0], locale) ?? "") : ""} · ${role}`,
      // a portrait when there is one, the company's logo otherwise
      ...(face ? { face, ring: C.accent } : { logo: { src: await logoPng(p[4][0], 260), sym: p[4][0], dark: getMedia().logos[p[4][0]] === 3 } }),
      items,
      lanes: [t.tl.lanes.trades],
      price: one ? getSeries(p[4][0])?.w : undefined,
      priceSym: p[4][0],
      path: `/${locale}/insider/${p[0]}#timeline`,
      years: 2,
    });
  }
  if (kind === "investor") {
    const d = getInvestor(id);
    if (!d) return nf;
    const p = d.profile;
    return render(locale, { title: locale === "zh" ? p.zh : p.en, sub: locale === "zh" ? p.firm_zh : p.firm_en, face: await photoPng(`inv-${p.id}`, 260), ring: C.accent, items: investorItems(d.activity, locale), lanes: [t.tl.lanes.trades], path: `/${locale}/investor/${p.id}#timeline`, years: 3 });
  }
  return nf;
}
