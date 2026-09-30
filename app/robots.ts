import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/zh/trade/", "/en/trade/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
