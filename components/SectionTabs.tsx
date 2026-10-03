import Link from "next/link";
import { dict, type Locale } from "@/lib/i18n";

const GROUPS = {
  people: [
    ["members", "/members"],
    ["executive", "/executive"],
    ["insiders", "/insiders"],
    ["investors", "/investors"],
  ],
  insights: [
    ["insights", "/insights"],
    ["latest", "/latest"],
    ["weekly", "/weekly"],
    ["calendar", "/calendar"],
    ["committees", "/committees"],
  ],
  mine: [
    ["following", "/following"],
    ["portfolio", "/portfolio"],
  ],
} as const;

/** The pages of one section, as a pill row above the page title. */
export default function SectionTabs({ locale, group, active }: { locale: Locale; group: keyof typeof GROUPS; active: string }) {
  const t = dict(locale).tabs;
  return (
    <nav className="tabs mb-5" aria-label={t[group]}>
      {GROUPS[group].map(([k, href]) => (
        <Link key={k} prefetch={false} href={`/${locale}${href}`} className={k === active ? "on" : ""} aria-current={k === active ? "page" : undefined}>
          {t[k]}
        </Link>
      ))}
    </nav>
  );
}
