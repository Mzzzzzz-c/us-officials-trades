// The mark: a dome whose columns are a rising bar chart, in a glass disc. One drawing for the
// header, the favicon and the posters.
export const BRAND_PATH = {
  dome: "M6.2 12.2a5.8 5.8 0 0 1 11.6 0",
  finial: "M12 6.4V4.2",
  bars: ["M8 18.6v-2.4", "M12 18.6v-4.2", "M16 18.6v-6"],
  base: "M5.6 12.2h1.8M16.6 12.2h1.8",
};

export function BrandMark({ size = 28, id = "bm" }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b47e0" />
          <stop offset="0.55" stopColor="#b14bd9" />
          <stop offset="1" stopColor="#f0694f" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="7.2" fill={`url(#${id}-g)`} />
      <rect x="1" y="1" width="22" height="11" rx="7.2" fill={`url(#${id}-s)`} opacity="0.5" />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d={BRAND_PATH.dome} strokeWidth="1.7" />
        <path d={BRAND_PATH.finial} strokeWidth="1.5" />
        <path d={BRAND_PATH.base} strokeWidth="1.5" />
        {BRAND_PATH.bars.map((d) => (
          <path key={d} d={d} strokeWidth="2.1" />
        ))}
      </g>
    </svg>
  );
}
