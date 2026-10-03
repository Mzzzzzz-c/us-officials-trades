// The UOT mark: letters built from the seven-segment digits of a stock ticker board.
// One drawing for the header, the favicon and the posters (lib/og.tsx repeats it for share images).
const U = ["8,2 16,10 16,50 8,58 0,50 0,10", "8,62 16,70 16,102 8,110 0,102 0,70", "10,112 18,104 54,104 62,112 54,120 18,120", "64,62 72,70 72,102 64,110 56,102 56,70", "64,2 72,10 72,50 64,58 56,50 56,10"];
const O = ["10,8 18,0 54,0 62,8 54,16 18,16", "8,10 16,18 16,50 8,58 0,50 0,18", "8,62 16,70 16,102 8,110 0,102 0,70", "10,112 18,104 54,104 62,112 54,120 18,120", "64,62 72,70 72,102 64,110 56,102 56,70", "64,10 72,18 72,50 64,58 56,50 56,18"];
const T = ["2,8 10,0 26,0 34,8 26,16 10,16", "38,8 46,0 62,0 70,8 62,16 46,16", "36,10 44,18 44,50 36,58 28,50 28,18", "36,62 44,70 44,110 36,118 28,110 28,70"];
export const BRAND_U = U;

/** "UOT" lettermark in the current text colour. */
export function BrandLetters({ height = 22 }: { height?: number }) {
  return (
    <svg width={(height * 264) / 120} height={height} viewBox="0 0 264 120" role="img" aria-label="UOT" fill="currentColor">
      {U.map((p) => (
        <polygon key={p} points={p} />
      ))}
      <g transform="translate(96 0)">
        {O.map((p) => (
          <polygon key={p} points={p} />
        ))}
      </g>
      <g transform="translate(192 0)">
        {T.map((p) => (
          <polygon key={p} points={p} />
        ))}
      </g>
    </svg>
  );
}

/** The app icon: the "U" on an ink tile. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 136 136" aria-hidden>
      <rect width="136" height="136" rx="31" fill="#0B0F14" />
      <g fill="#fff" transform="translate(41 23) scale(0.75)">
        {U.map((p) => (
          <polygon key={p} points={p} />
        ))}
      </g>
    </svg>
  );
}
