"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";

export default function LangSwitch({ locale, label, title }: { locale: Locale; label: string; title: string }) {
  const path = usePathname() || `/${locale}`;
  const other: Locale = locale === "zh" ? "en" : "zh";
  const href = path.replace(/^\/(zh|en)(?=\/|$)/, `/${other}`);
  return (
    <Link href={href} title={title} hrefLang={other === "zh" ? "zh-CN" : "en"} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-surface-2">
      {label}
    </Link>
  );
}
