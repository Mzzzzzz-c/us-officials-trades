export const REPO_URL = "https://github.com/Mzzzzzz-c/us-officials-trades";

/** Public base URL: set NEXT_PUBLIC_SITE_URL once you have a custom domain; Vercel fills in its own URL otherwise. */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
