import "server-only";
// Shared pieces for the 1080x1440 share posters: page shell, title, QR footer, number formats,
// donut geometry. Every poster ends in the same footer, so every exported image carries a QR code.
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { dict, type Locale } from "./i18n";
import { BrandSvg, C, ogFonts, siteHost } from "./og";
import { siteUrl } from "./site";

export const POSTER = { width: 1080, height: 1440 };
// ten categorical hues that stay apart on white, then grey for "other"
export const SLICE = ["#0a84ff", "#ff9f0a", "#30b0c7", "#bf5af2", "#ff375f", "#34c759", "#5e5ce6", "#a2845e", "#ffd60a", "#64d2ff"];
export const OTHER = "#d1d1d6";
export const PARTY = { D: "#2f6fde", R: "#e0352b" };

export const pct = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** Company names cut to fit: no open brackets, and Latin names end on a whole word. */
export function short(n: string, max = 13): string {
  if ([...n].length <= max) return n;
  const noParen = n.replace(/\s*[（(][^）)]*[）)]?\s*$/, "").trim();
  if (noParen && [...noParen].length <= max) return noParen;
  const s = noParen || n;
  if (/^[\x00-\x7f]+$/.test(s)) {
    let out = "";
    for (const w of s.split(/\s+/)) {
      if ((out ? out.length + 1 : 0) + w.length > max) break;
      out = out ? `${out} ${w}` : w;
    }
    return out.replace(/[,&-]+$/, "") || s.slice(0, max);
  }
  return [...s].slice(0, max).join("");
}

export function qrPath(text: string): { d: string; n: number } {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
  return { d, n };
}

/** QR code drawn on a whole-pixel grid with the standard 4-module quiet zone, so phones read it reliably. */
export function QrCode({ url, size }: { url: string; size: number }) {
  const qr = qrPath(url);
  const span = qr.n + 8;
  const px = Math.max(3, Math.round(size / span));
  const side = px * span;
  return (
    <svg width={side} height={side} viewBox={`-4 -4 ${span} ${span}`} shapeRendering="crispEdges" style={{ background: "#fff", flexShrink: 0 }}>
      <rect x={-4} y={-4} width={span} height={span} fill="#fff" />
      <path d={qr.d} fill="#000" />
    </svg>
  );
}

export function donut(slices: { v: number; color: string }[], r: number, w: number): string[] {
  const total = slices.reduce((a, s) => a + s.v, 0) || 1;
  let a0 = -Math.PI / 2;
  const out: string[] = [];
  for (const s of slices) {
    const a1 = a0 + (s.v / total) * Math.PI * 2;
    const gap = slices.length > 1 ? 0.012 : 0;
    const s0 = a0 + gap, s1 = Math.max(s0 + 0.001, a1 - gap);
    const large = s1 - s0 > Math.PI ? 1 : 0;
    const R = r, r2 = r - w;
    const p = (a: number, rr: number) => `${(r + rr * Math.cos(a)).toFixed(2)} ${(r + rr * Math.sin(a)).toFixed(2)}`;
    if (slices.length === 1) out.push(`M${r} ${r - R}A${R} ${R} 0 1 1 ${r - 0.01} ${r - R}ZM${r} ${r - r2}A${r2} ${r2} 0 1 0 ${r - 0.01} ${r - r2}Z`);
    else out.push(`M${p(s0, R)}A${R} ${R} 0 ${large} 1 ${p(s1, R)}L${p(s1, r2)}A${r2} ${r2} 0 ${large} 0 ${p(s0, r2)}Z`);
    a0 = a1;
  }
  return out;
}

/** A polyline path for a series scaled into w x h. */
export function linePath(vals: number[], w: number, h: number, lo: number, hi: number): string {
  const n = vals.length;
  return vals.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, n - 1)) * w).toFixed(1)} ${(h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 12)).toFixed(1)}`).join("");
}

const FOOT = {
  zh: "数据来自美国国会、政府道德办公室与 SEC 公开披露 · 收益与持仓为估算 · 不构成投资建议",
  en: "From public disclosures to Congress, the Office of Government Ethics and the SEC · returns and holdings are estimates · not investment advice",
};

export function BrandMark({ size = 30 }: { size?: number }) {
  return <BrandSvg size={size} />;
}

/** The footer every poster shares: QR code to the page, site name, data note. */
export function QrFooter({ locale, path, scan }: { locale: Locale; path: string; scan: string }) {
  const t = dict(locale);
  const site = siteUrl();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, borderTop: "2px solid #f0f0f3", paddingTop: 20 }}>
      <QrCode url={`${site}${path}`} size={136} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark />
          <span style={{ fontSize: 28, fontWeight: 700 }}>{t.siteName}</span>
        </div>
        <span style={{ fontSize: 22, color: C.muted, fontWeight: 500 }}>
          {scan} · {siteHost(site)}
        </span>
        <span style={{ fontSize: 17, color: C.faint, fontWeight: 500, lineHeight: 1.35 }}>{FOOT[locale]}</span>
      </div>
    </div>
  );
}

/** Title block for posters that are not about one person. */
export function PosterTitle({ eyebrow, title, sub, color }: { eyebrow?: string; title: string; sub?: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {eyebrow ? <span style={{ fontSize: 26, fontWeight: 700, color: color ?? C.accent }}>{eyebrow}</span> : null}
      <span style={{ fontSize: title.length > 12 ? 66 : 80, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1, marginTop: 4 }}>{title}</span>
      {sub ? <span style={{ fontSize: 25, color: C.muted, fontWeight: 500, marginTop: 10, lineHeight: 1.35 }}>{sub}</span> : null}
    </div>
  );
}

export function PosterPage({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "SC", color: C.text, padding: "48px 64px 40px" }}>
      {children}
    </div>
  );
}

/** Render with fonts for every character used; `text` must include all strings on the poster. */
export async function posterResponse(node: React.ReactElement, text: string, locale: Locale) {
  const t = dict(locale);
  // digits and symbols every poster may print (a glyph missing from the subset falls back to a
  // font with different metrics, which throws the layout off)
  const all = [text, t.siteName, siteHost(siteUrl()), FOOT[locale], "0123456789+−-–—.,%·×()/$KMB:：#"].join("");
  return new ImageResponse(node, {
    ...POSTER,
    fonts: await ogFonts(all),
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
