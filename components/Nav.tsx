"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Item {
  href: string;
  label: string;
  match: string[];
}

function activeSeg(path: string): string {
  const parts = path.split("/");
  // executive officials share the member page but belong to the "Executive" tab
  if (parts[2] === "member" && (parts[3] ?? "").startsWith("E-")) return "executive";
  return parts[2] ?? "";
}

/** Apple-style global nav: translucent bar, small type, full-screen sheet on phones. */
export default function Nav({ items, home, brand, right }: { items: Item[]; home: string; brand: string; right: React.ReactNode }) {
  const path = usePathname() || "";
  const seg = activeSeg(path);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
  }, [open]);
  return (
    <header className="glass sticky top-0 z-40 border-b border-hair">
      <div className="mx-auto flex h-12 max-w-[1100px] items-center gap-6 px-5">
        <Link href={home} className="flex items-center gap-2 text-[15px] font-semibold tracking-tight whitespace-nowrap" aria-label={brand}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id="brand-g" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#0071e3" />
                <stop offset="1" stopColor="#8e44ec" />
              </linearGradient>
            </defs>
            <path d="M3 20h18M5 20V10m4 10V10m6 10V10m4 10V10M2 8l10-5 10 5z" fill="none" stroke="url(#brand-g)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">{brand}</span>
        </Link>
        <nav className="hidden flex-1 items-center justify-center gap-7 text-[13px] md:flex">
          {items.slice(1).map((it) => {
            const on = it.match.includes(seg);
            return (
              <Link key={it.href} href={it.href} className={`transition-colors ${on ? "text-ink" : "text-muted hover:text-ink"}`}>
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          {right}
          <button type="button" className="-mr-1 p-1 md:hidden" aria-label="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
              {open ? (
                <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M3 7h14M3 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {open ? (
        <div className="fade-up fixed inset-x-0 top-12 bottom-0 z-40 bg-elev px-8 pt-6 md:hidden">
          <nav className="flex flex-col">
            {items.map((it, i) => (
              <Link key={it.href} href={it.href} className="fade-up border-b border-hair py-3 text-2xl font-semibold tracking-tight" style={{ animationDelay: `${i * 30}ms` }}>
                {it.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
