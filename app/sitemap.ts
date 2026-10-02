import type { MetadataRoute } from "next";
import { getInsiderPeople, getInvestors, getMembers, getMeta, getTickers } from "@/lib/data";
import { LOCALES } from "@/lib/i18n";
import { getCommittees } from "@/lib/derived";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const updated = getMeta()?.generated ?? new Date().toISOString();
  const paths = [
    "",
    "/members",
    "/executive",
    "/tickers",
    "/insights",
    "/latest",
    "/investors",
    "/data",
    "/weekly",
    "/committees",
    "/insiders",
    // the insiders with the largest trades; the rest are reachable from the list and the stock pages
    ...[...getInsiderPeople().people].sort((a, b) => b[7] + b[8] - (a[7] + a[8])).slice(0, 1000).map((p) => `/insider/${p[0]}`),
    ...getCommittees().map((c) => `/committee/${c.id}`),
    "/portfolio",
    "/methodology",
    ...getMembers().map((m) => `/member/${m.id}`),
    ...getTickers().map((t) => `/ticker/${t.sym}`),
    ...getInvestors().map((i) => `/investor/${i.id}`),
  ];
  return paths.flatMap((p) =>
    LOCALES.map((l) => ({
      url: `${base}/${l}${p}`,
      lastModified: updated,
      alternates: { languages: { "zh-CN": `${base}/zh${p}`, en: `${base}/en${p}` } },
    })),
  );
}
