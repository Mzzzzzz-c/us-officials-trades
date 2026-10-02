import type { MetadataRoute } from "next";
import { getInvestors, getMembers, getMeta, getTickers } from "@/lib/data";
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
