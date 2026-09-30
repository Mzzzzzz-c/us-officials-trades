"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav({ items }: { items: { href: string; label: string; match: string[] }[] }) {
  const path = usePathname() || "";
  const parts = path.split("/");
  // executive officials share the member page but belong to the "Executive" tab
  const seg = parts[2] === "member" && (parts[3] ?? "").startsWith("E-") ? "executive" : parts[2] ?? "";
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm">
      {items.map((it) => {
        const active = it.match.includes(seg);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 ${active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-ink"}`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
