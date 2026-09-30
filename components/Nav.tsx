"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav({ items }: { items: { href: string; label: string; match: string[] }[] }) {
  const path = usePathname() || "";
  const seg = path.split("/")[2] ?? "";
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
