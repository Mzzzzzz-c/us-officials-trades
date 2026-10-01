import "server-only";
// Share images (Open Graph / X cards): 1200x630 PNGs drawn with next/og.
// Chinese text needs a CJK font: we ask Google Fonts for a subset holding exactly the characters on
// the card (a few KB), and fall back to a bundled subset if that request fails.
import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import type { Locale } from "./i18n";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

const ROOT = process.cwd();
const fontCache = new Map<string, ArrayBuffer>();

async function googleFont(text: string, weight: number): Promise<ArrayBuffer | null> {
  const key = `${weight}:${text}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${weight}&text=${encodeURIComponent(text)}`, {
      // a plain user agent gets TrueType, which the renderer reads (it cannot read WOFF2)
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000),
    }).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const buf = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.arrayBuffer() : null));
    if (buf) {
      if (fontCache.size > 200) fontCache.clear();
      fontCache.set(key, buf);
    }
    return buf;
  } catch {
    return null;
  }
}

let fallback: ArrayBuffer | null = null;
function bundledFont(): ArrayBuffer {
  if (!fallback) {
    const b = fs.readFileSync(path.join(/* turbopackIgnore: true */ ROOT, "assets", "og", "NotoSansSC-Bold-subset.otf"));
    fallback = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  return fallback;
}

/** Fonts for every character that will appear on the card. */
export async function ogFonts(text: string) {
  const chars = [...new Set(text + "0123456789$%+-−.,·–—/×()KMB: ")].join("");
  const [regular, bold] = await Promise.all([googleFont(chars, 500), googleFont(chars, 700)]);
  if (regular && bold)
    return [
      { name: "SC", data: regular, weight: 500 as const, style: "normal" as const },
      { name: "SC", data: bold, weight: 700 as const, style: "normal" as const },
    ];
  const b = bundledFont();
  return [
    { name: "SC", data: b, weight: 500 as const, style: "normal" as const },
    { name: "SC", data: b, weight: 700 as const, style: "normal" as const },
  ];
}

/** A file under public/media as a PNG data URL (the renderer cannot decode WebP). */
async function mediaPng(rel: string, size: number, fit: "cover" | "contain"): Promise<string | null> {
  // traced explicitly via outputFileTracingIncludes in next.config.ts
  const file = path.join(/* turbopackIgnore: true */ ROOT, "public", "media", rel);
  if (!fs.existsSync(file)) return null;
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(file)
      .resize(size, size, { fit, position: "top", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}
export const photoPng = (id: string, size: number) => mediaPng(`people/${id}.webp`, size, "cover");
export const logoPng = (sym: string, size: number) => mediaPng(`logos/${sym}.webp`, size, "contain");

// ---------------------------------------------------------------- pieces

export const C = {
  bg: "#f5f5f7",
  card: "#ffffff",
  text: "#1d1d1f",
  muted: "#6e6e73",
  faint: "#a1a1a6",
  accent: "#0071e3",
  dem: "#2f6fde",
  rep: "#e0352b",
  ind: "#8e8e93",
};
/** Up is red in Chinese markets and green in English ones, as on the site. */
export const upDown = (locale: Locale) => (locale === "zh" ? { up: "#e0352b", down: "#1f9d55" } : { up: "#1f9d55", down: "#e0352b" });
export const partyColor = (p?: string | null) => (p === "D" ? C.dem : p === "R" ? C.rep : C.ind);

export function Frame({ children, brand, site, qr }: { children: ReactNode; brand: string; site: string; qr?: ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, fontFamily: "SC", color: C.text, padding: "44px 56px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: C.muted, fontWeight: 500 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="30" height="30" viewBox="0 0 24 24">
            <path d="M3 9.5 12 4l9 5.5M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3.5 20.5h17" stroke={C.accent} strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ color: C.text, fontWeight: 700 }}>{brand}</span>
        </div>
        <span>{site}</span>
      </div>
      <div style={{ display: "flex", flex: 1, marginTop: 32, background: C.card, borderRadius: 36, padding: "48px 56px", boxShadow: "0 10px 40px rgba(0,0,0,0.06)", position: "relative" }}>
        {children}
        {qr ? <div style={{ position: "absolute", right: 28, top: 28, display: "flex" }}>{qr}</div> : null}
      </div>
    </div>
  );
}

export function Portrait({ src, name, size, ring }: { src: string | null; name: string; size: number; ring?: string }) {
  const style = { width: size, height: size, borderRadius: size, border: ring ? `${Math.round(size / 40)}px solid ${ring}` : "none", flexShrink: 0 };
  if (src) return <img src={src} width={size} height={size} style={{ ...style, objectFit: "cover" }} alt="" />;
  const initial = [...name.trim()][0] ?? "?";
  return (
    <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: ring ?? C.ind, color: "#fff", fontSize: size * 0.42, fontWeight: 700 }}>
      {initial.toUpperCase()}
    </div>
  );
}

export function LogoTile({ src, sym, size, dark }: { src: string | null; sym: string; size: number; dark?: boolean }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.24, background: dark ? "#1d1d1f" : "#fff", border: dark ? "none" : "2px solid #ececf0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
      {src ? <img src={src} width={size * 0.8} height={size * 0.8} style={{ objectFit: "contain" }} alt="" /> : <span style={{ fontSize: size * 0.3, fontWeight: 700, color: C.muted }}>{sym.slice(0, 4)}</span>}
    </div>
  );
}

export function Stat({ value, label, color, size = 44 }: { value: string; label: string; color?: string; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
      <span style={{ fontSize: size, fontWeight: 700, color: color ?? C.text, letterSpacing: -1, whiteSpace: "nowrap" }}>{value}</span>
      <span style={{ fontSize: 22, color: C.muted, fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

export const siteHost = (url: string) => url.replace(/^https?:\/\//, "");
