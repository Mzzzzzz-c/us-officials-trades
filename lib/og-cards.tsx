import "server-only";
// The share cards themselves, one per kind of page. Each returns an ImageResponse.
import { ImageResponse } from "next/og";
import { getInvestor, getInvestors, getMedia, getMember, getMembers, getMeta, getTicker, getTickers } from "./data";
import { amountRange, usdShort } from "./format";
import { dict, type Locale } from "./i18n";
import { C, Frame, LogoTile, logoPng, OG_SIZE, ogFonts, partyColor, photoPng, Portrait, siteHost, Stat, upDown } from "./og";
import { roleShort } from "./people";
import { siteUrl } from "./site";

const L = {
  zh: { trades: "笔交易", buysSells: "买入 / 卖出", volume: "估算交易额", lastFiled: "最近申报", officials: "位官员交易过", investors: "位知名投资人持有",
    traded: "交易日期", filed: "公开日期", delay: "申报用时", days: "天", owner: "持有人", value: "13F 持仓市值", positions: "只持仓", period: "报告期", top: "最大持仓",
    tagline: "国会议员、总统与内阁官员的每一笔股票交易", stocks: "只股票", },
  en: { trades: "trades", buysSells: "buys / sells", volume: "est. volume", lastFiled: "last filing", officials: "officials traded it", investors: "famous investors hold it",
    traded: "Traded", filed: "Made public", delay: "Took", days: "days", owner: "Owner", value: "13F portfolio", positions: "positions", period: "Quarter", top: "Top holdings",
    tagline: "Every stock trade by Congress, the President and the Cabinet", stocks: "stocks", },
};

const cache = { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } };

async function render(node: React.ReactElement, text: string) {
  return new ImageResponse(node, { ...OG_SIZE, fonts: await ogFonts(text), ...cache });
}

const nm = (zh: string | null | undefined, en: string, locale: Locale) => (locale === "zh" && zh ? zh : en);

export async function siteCard(locale: Locale) {
  const t = dict(locale);
  const l = L[locale];
  const c = getMeta()?.counts;
  const brand = t.siteName;
  const host = siteHost(siteUrl());
  const stats: [string, string][] = c ? [[c.trades.toLocaleString("en-US"), l.trades], [String(c.members), t.x.statOfficials], [c.tickers.toLocaleString("en-US"), l.stocks]] : [];
  const node = (
    <Frame brand={brand} site={host}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1 }}>
          <span>{t.x.heroTitle1}</span>
          <span style={{ color: C.accent }}>{t.x.heroTitle2}</span>
        </div>
        <span style={{ fontSize: 30, color: C.muted, fontWeight: 500 }}>{l.tagline}</span>
        <div style={{ display: "flex", gap: 72 }}>
          {stats.map(([v, k]) => (
            <Stat key={k} value={v} label={k} />
          ))}
        </div>
      </div>
    </Frame>
  );
  return render(node, [brand, host, t.x.heroTitle1, t.x.heroTitle2, l.tagline, ...stats.flat()].join(""));
}

export async function memberCard(locale: Locale, id: string) {
  const d = getMember(id);
  if (!d) return siteCard(locale);
  const t = dict(locale);
  const l = L[locale];
  const s = d.summary;
  const row = getMembers().find((m) => m.id === id);
  const name = nm(d.profile.zh, d.profile.name, locale);
  const party = d.profile.party ? t.party[d.profile.party as keyof typeof t.party] ?? "" : "";
  const role = roleShort(row, locale);
  const photo = await photoPng(id, 460);
  const host = siteHost(siteUrl());
  const stats: [string, string][] = [
    [s.n.toLocaleString("en-US"), l.trades],
    [`${s.nb} / ${s.ns}`, l.buysSells],
    [amountRange(s.vmin, s.vmax), l.volume],
  ];
  const node = (
    <Frame brand={t.siteName} site={host}>
      <div style={{ display: "flex", alignItems: "center", gap: 56, width: "100%" }}>
        <Portrait src={photo} name={name} size={250} ring={partyColor(d.profile.party)} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 28, color: C.muted, fontWeight: 500 }}>{[party, role].filter(Boolean).join(" · ")}</span>
          <span style={{ fontSize: 80, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1, marginTop: 6 }}>{name}</span>
          {locale === "zh" && d.profile.zh ? <span style={{ fontSize: 32, color: C.muted, fontWeight: 500 }}>{d.profile.name}</span> : null}
          <div style={{ display: "flex", gap: 48, marginTop: 36 }}>
            {stats.map(([v, k]) => (
              <Stat key={k} value={v} label={k} size={42} />
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
  return render(node, [t.siteName, host, name, d.profile.name, party, role, ...stats.flat()].join(""));
}

export async function tradeCard(locale: Locale, id: string) {
  const mid = decodeURIComponent(id).replace(/-[^-]+-[^-]+$/, "");
  const d = getMember(mid);
  const tr = d?.trades.find((x) => x.id === decodeURIComponent(id));
  if (!d || !tr) return siteCard(locale);
  const t = dict(locale);
  const l = L[locale];
  const row = getMembers().find((m) => m.id === mid);
  const name = nm(d.profile.zh, d.profile.name, locale);
  const role = roleShort(row, locale);
  const tk = tr.sym ? getTickers().find((x) => x.sym === tr.sym) : undefined;
  const company = tk ? nm(tk.zh, tk.name, locale) : tr.asset ?? "";
  const buy = tr.type === "P";
  const col = tr.type === "E" ? C.muted : buy ? upDown(locale).up : upDown(locale).down;
  const action = (tr.act && t.acts[tr.act as keyof typeof t.acts]) || t.types[tr.type];
  const [photo, logo] = await Promise.all([photoPng(mid, 200), tr.sym ? logoPng(tr.sym, 240) : Promise.resolve(null)]);
  const host = siteHost(siteUrl());
  const amount = amountRange(tr.amin, tr.amax);
  const facts: [string, string][] = [
    [tr.tx ?? tr.txr ?? "—", l.traded],
    [tr.fil ?? "—", l.filed],
    ...(tr.delay != null ? ([[`${tr.delay} ${l.days}`, l.delay]] as [string, string][]) : []),
    [t.owners[tr.own] ?? tr.own, l.owner],
  ];
  const headline = tr.sym ?? (tr.asset ?? "").slice(0, 28);
  const node = (
    <Frame brand={t.siteName} site={host}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Portrait src={photo} name={name} size={96} ring={partyColor(d.profile.party)} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 40, fontWeight: 700 }}>{name}</span>
            <span style={{ fontSize: 24, color: C.muted, fontWeight: 500 }}>{role}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          {tr.sym ? <LogoTile src={logo} sym={tr.sym} size={132} dark={getMedia().logos[tr.sym] === 3} /> : null}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <span style={{ fontSize: 34, fontWeight: 700, color: "#fff", background: col, borderRadius: 40, padding: "4px 22px" }}>{action}</span>
              <span style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>{headline}</span>
            </div>
            <span style={{ fontSize: 28, color: C.muted, fontWeight: 500, marginTop: 4 }}>{company.slice(0, 48)}</span>
          </div>
          <span style={{ fontSize: 64, fontWeight: 700, color: col, letterSpacing: -1 }}>{amount}</span>
        </div>
        <div style={{ display: "flex", gap: 56 }}>
          {facts.map(([v, k]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 22, color: C.muted, fontWeight: 500 }}>{k}</span>
              <span style={{ fontSize: 34, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
  return render(node, [t.siteName, host, name, role, action, headline, company, amount, ...facts.flat()].join(""));
}

export async function tickerCard(locale: Locale, sym: string) {
  const d = getTicker(decodeURIComponent(sym).toUpperCase());
  if (!d) return siteCard(locale);
  const t = dict(locale);
  const l = L[locale];
  const name = nm(d.zh, d.name, locale);
  const nb = d.members.reduce((a, m) => a + (m.nb ?? 0), 0);
  const ns = d.members.reduce((a, m) => a + (m.ns ?? 0), 0);
  const top = [...d.members].sort((a, b) => (b.nb ?? 0) + (b.ns ?? 0) - ((a.nb ?? 0) + (a.ns ?? 0))).slice(0, 6);
  const people = new Map(getMembers().map((m) => [m.id, m]));
  const [logo, ...faces] = await Promise.all([logoPng(d.sym, 300), ...top.map((m) => photoPng(m.id, 120))]);
  const host = siteHost(siteUrl());
  const sector = t.sectors[d.sec as keyof typeof t.sectors] ?? "";
  const stats: [string, string][] = [
    [d.trades.length.toLocaleString("en-US"), l.trades],
    [`${nb} / ${ns}`, l.buysSells],
    [String(d.members.length), l.officials],
  ];
  const names = top.map((m) => { const p = people.get(m.id); return p ? nm(p.zh, p.name, locale) : m.id; });
  const node = (
    <Frame brand={t.siteName} site={host}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <LogoTile src={logo} sym={d.sym} size={170} dark={getMedia().logos[d.sym] === 3} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 26, color: C.muted, fontWeight: 500 }}>{sector}</span>
            <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}>{d.sym}</span>
            <span style={{ fontSize: 32, color: C.muted, fontWeight: 500 }}>{name.slice(0, 40)}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
          <div style={{ display: "flex", gap: 44 }}>
            {stats.map(([v, k]) => (
              <Stat key={k} value={v} label={k} size={42} />
            ))}
          </div>
          <div style={{ display: "flex", flexShrink: 0 }}>
            {top.slice(0, 4).map((m, i) => (
              <div key={m.id} style={{ display: "flex", marginLeft: i ? -16 : 0, borderRadius: 80, border: "4px solid #fff" }}>
                <Portrait src={faces[i]} name={names[i]} size={64} ring={undefined} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
  return render(node, [t.siteName, host, d.sym, name, sector, ...stats.flat(), ...names].join(""));
}

export async function investorCard(locale: Locale, id: string) {
  const d = getInvestor(id);
  const row = getInvestors().find((i) => i.id === id);
  if (!d || !row) return siteCard(locale);
  const t = dict(locale);
  const l = L[locale];
  const name = locale === "zh" ? row.zh : row.en;
  const firm = locale === "zh" ? row.firm_zh : row.firm_en;
  const top = d.holdings.filter((h) => h.sym).slice(0, 4);
  const [photo, ...logos] = await Promise.all([photoPng(`inv-${id}`, 460), ...top.map((h) => logoPng(h.sym!, 120))]);
  const host = siteHost(siteUrl());
  const stats: [string, string][] = [
    [usdShort(row.value), l.value],
    [String(row.n), l.positions],
    [row.period, l.period],
  ];
  const node = (
    <Frame brand={t.siteName} site={host}>
      <div style={{ display: "flex", alignItems: "center", gap: 56, width: "100%" }}>
        <Portrait src={photo} name={name} size={230} ring={photo ? undefined : C.accent} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span style={{ fontSize: 28, color: C.muted, fontWeight: 500 }}>{firm}</span>
          <span style={{ fontSize: 80, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1 }}>{name}</span>
          <div style={{ display: "flex", gap: 52, marginTop: 30 }}>
            {stats.map(([v, k]) => (
              <Stat key={k} value={v} label={k} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 30 }}>
            <span style={{ fontSize: 22, color: C.muted, fontWeight: 500, marginRight: 6, whiteSpace: "nowrap", flexShrink: 0 }}>{l.top}</span>
            {top.map((h, i) => (
              <div key={h.sym} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f2f2f7", borderRadius: 40, padding: "6px 16px 6px 6px" }}>
                <LogoTile src={logos[i]} sym={h.sym!} size={40} dark={getMedia().logos[h.sym!] === 3} />
                <span style={{ fontSize: 24, fontWeight: 700 }}>{h.sym}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
  return render(node, [t.siteName, host, name, firm, l.top, ...stats.flat(), ...top.map((h) => h.sym)].join(""));
}
