import type { NextConfig } from "next";

const SITE = "./data/site";

const config: NextConfig = {
  poweredByHeader: false,
  // Pages rendered on demand read the JSON under data/site at runtime; make sure it ships with them.
  outputFileTracingIncludes: {
    "/\\[locale\\]/ticker/\\[sym\\]": [`${SITE}/ticker/**/*`, `${SITE}/series/**/*`, `${SITE}/insider/**/*`, `${SITE}/*.json`],
    "/\\[locale\\]/insider/\\[id\\]": [`${SITE}/insider/**/*`, `${SITE}/series/**/*`, `${SITE}/ticker/**/*`, `${SITE}/*.json`],
    "/\\[locale\\]/insiders": [`${SITE}/*.json`],
    "/\\[locale\\]/member/\\[id\\]": [`${SITE}/member/**/*`, `${SITE}/*.json`],
    "/\\[locale\\]/trade/\\[id\\]": [`${SITE}/member/**/*`, `${SITE}/*.json`],
    "/\\[locale\\]/investor/\\[id\\]": [`${SITE}/investor/**/*`, `${SITE}/*.json`],
    // share images read portraits, logos and the bundled fallback font
    "/\\[locale\\]/**/opengraph-image*": [`${SITE}/member/**/*`, `${SITE}/ticker/**/*`, `${SITE}/investor/**/*`, `${SITE}/*.json`, "./public/media/**/*", "./assets/og/**/*"],
    "/\\[locale\\]/poster/**": [`${SITE}/member/**/*`, `${SITE}/ticker/**/*`, `${SITE}/investor/**/*`, `${SITE}/*.json`, "./public/media/**/*", "./assets/og/**/*"],
    "/feed/\\[file\\]": [`${SITE}/member/**/*`, `${SITE}/ticker/**/*`, `${SITE}/*.json`],
  },
  outputFileTracingExcludes: {
    "*": ["./data/raw/**/*", "./data/cache/**/*", "./data/ref/**/*", "./pipeline/**/*"],
  },
  async redirects() {
    return [
      // English-speaking browsers land on /en, everyone else on /zh
      { source: "/", has: [{ type: "header", key: "accept-language", value: "en.*" }], destination: "/en", permanent: false },
      { source: "/", destination: "/zh", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
