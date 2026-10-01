"use client";

import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";

// A plain <a>: switching language swaps the root <html lang>, so a full page load is the right thing.
export default function LangSwitch({ locale, label, title }: { locale: Locale; label: string; title: string }) {
  const path = usePathname() || `/${locale}`;
  const other: Locale = locale === "zh" ? "en" : "zh";
  const href = path.replace(/^\/(zh|en)(?=\/|$)/, `/${other}`);
  return (
    <a href={href} title={title} hrefLang={other === "zh" ? "zh-CN" : "en"} className="rounded-full px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-hair transition-colors hover:text-ink">
      {label}
    </a>
  );
}
