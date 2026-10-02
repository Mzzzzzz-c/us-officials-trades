// Portraits and logos (plain elements, usable from server and client components).
// Files live in public/media; `has` / `kind` come from data/site/media.json so there are no broken images.

const PARTY_RING: Record<string, string> = { D: "var(--dem)", R: "var(--rep)", I: "var(--ind)" };

// people without a photo and without a party (the 13F investors) get a steady colour of their own
const TINTS = ["#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#30b0c7", "#34c759", "#a2845e"];
function tint(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

function initials(name: string): string {
  // Chinese names: the surname character (段, 李) rather than Latin initials
  const cjk = name.match(/[\u3400-\u9fff]/);
  if (cjk) return cjk[0];
  const parts = name.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  id,
  name,
  party,
  has,
  size = 40,
  ring = true,
  className = "",
}: {
  id: string;
  name: string;
  party?: string;
  has?: boolean;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const color = PARTY_RING[party ?? ""] ?? (/^in[vs]-/.test(id) ? tint(id) : "var(--faint)");
  const style = {
    width: size,
    height: size,
    boxShadow: ring ? `0 0 0 ${size >= 64 ? 3 : 2}px var(--bg-elev), 0 0 0 ${size >= 64 ? 5 : 3.5}px ${color}` : undefined,
  };
  if (has) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/media/people/${id}.webp`}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-full bg-surface-3 object-cover object-top ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-label={name}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ ...style, fontSize: size * 0.36, background: `linear-gradient(145deg, color-mix(in srgb, ${color} 70%, white), ${color})` }}
    >
      {initials(name)}
    </span>
  );
}

function hue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** kind: 1 = full-bleed app-icon logo, 2 = transparent logo on a white tile, 3 = light logo on a dark tile, 0/undefined = monogram. */
export function Logo({ sym, kind, size = 36, className = "" }: { sym: string; kind?: number; size?: number; className?: string }) {
  const r = Math.round(size * 0.24);
  if (kind === 1 || kind === 2 || kind === 3) {
    const inset = kind !== 1;
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${kind === 2 ? "bg-white" : kind === 3 ? "bg-[#1d1d1f]" : "bg-surface-3"} ${className}`}
        style={{ width: size, height: size, borderRadius: r, boxShadow: "inset 0 0 0 1px var(--hair)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/media/logos/${sym}.webp`}
          alt={sym}
          width={inset ? Math.round(size * 0.78) : size}
          height={inset ? Math.round(size * 0.78) : size}
          loading="lazy"
          decoding="async"
          className="object-contain"
        />
      </span>
    );
  }
  const h = hue(sym);
  return (
    <span
      aria-label={sym}
      className={`inline-flex shrink-0 select-none items-center justify-center font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: r,
        fontSize: sym.length > 3 ? size * 0.28 : size * 0.34,
        background: `linear-gradient(145deg, hsl(${h} 55% 58%), hsl(${(h + 40) % 360} 60% 42%))`,
        letterSpacing: "-0.02em",
      }}
    >
      {sym.replace(/\..*$/, "").slice(0, 4)}
    </span>
  );
}

/** Overlapping portraits: "these five officials bought it". */
export function AvatarStack({
  people,
  size = 28,
  max = 5,
}: {
  people: { id: string; name: string; party?: string; has?: boolean }[];
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <span key={p.id} style={{ marginLeft: i ? -size * 0.3 : 0, zIndex: max - i }} className="relative" title={p.name}>
          <Avatar id={p.id} name={p.name} party={p.party} has={p.has} size={size} />
        </span>
      ))}
      {rest > 0 ? (
        <span
          className="relative inline-flex items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted"
          style={{ width: size, height: size, marginLeft: -size * 0.3, boxShadow: "0 0 0 2px var(--bg-elev)" }}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

export function Sparkline({
  values,
  width = 96,
  height = 32,
  tone,
  strokeWidth = 1.75,
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: "pos" | "neg" | "muted";
  strokeWidth?: number;
  fill?: boolean;
}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return <svg width={width} height={height} aria-hidden />;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || 1;
  const pad = strokeWidth;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * width, pad + (1 - (y - lo) / span) * (height - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const t = tone ?? (v[v.length - 1] >= v[0] ? "pos" : "neg");
  const color = t === "pos" ? "var(--pos)" : t === "neg" ? "var(--neg)" : "var(--faint)";
  const gid = `sg-${t}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      {fill ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${gid})`} />
        </>
      ) : null}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
