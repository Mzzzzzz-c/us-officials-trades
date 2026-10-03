"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BrandMark } from "./Brand";

export interface NavItem {
  href: string;
  label: string;
  /** first path segments (after the locale) that belong to this section */
  match: string[];
  icon: "pulse" | "people" | "chart" | "spark" | "star";
}

const ICONS: Record<NavItem["icon"], string> = {
  pulse: "M2.5 12h4l2.2-6 4 12 2.3-6h6.5",
  people: "M8.5 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM2.8 19.2c.5-3 2.8-4.8 5.7-4.8s5.2 1.8 5.7 4.800M16 11.200a2.7 2.7 0 1 0-.9-5.2M17.3 14.600c2.1.5 3.5 2.1 3.9 4.6",
  chart: "M4 19.500V11M9.3 19.500V5M14.7 19.500v-6.500M20 19.500V8.5",
  spark: "M12 3.200l2 5.3 5.3 2-5.3 2-2 5.3-2-5.3-5.3-2 5.3-2zM18.5 16.500l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  star: "M12 3.600l2.6 5.3 5.8.8-4.2 4.1 1 5.800L12 16.900l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z",
};
const Icon = ({ k, size = 22 }: { k: NavItem["icon"]; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d={ICONS[k]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function activeSeg(path: string): string {
  return path.split("/")[2] ?? "";
}

/** A floating glass capsule: brand, five sections with a sliding highlight, tools. On phones the
 *  sections move to a dock at the bottom, within reach of the thumb. */
export default function Nav({ items, home, brand, tag, right }: { items: NavItem[]; home: string; brand: string; tag: string; right: React.ReactNode }) {
  const path = usePathname() || "";
  const seg = activeSeg(path);
  const active = items.findIndex((it) => it.match.includes(seg));
  const row = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const shown = hover ?? active;
  useLayoutEffect(() => {
    const el = row.current?.querySelectorAll<HTMLElement>("[data-nav]")[shown];
    setPill(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [shown, path, items.length]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 px-3 pt-2.5 sm:px-5">
        <div className={`nav-capsule mx-auto flex max-w-[1100px] items-center gap-3 rounded-[22px] pr-2.5 pl-3 transition-[height,box-shadow] duration-300 sm:gap-5 sm:pr-3 sm:pl-4 ${scrolled ? "h-[50px] is-scrolled" : "h-[58px]"}`}>
          <Link href={home} className="group flex min-w-0 items-center gap-2.5" aria-label={brand}>
            <span className="transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-105">
              <BrandMark size={scrolled ? 28 : 32} />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="brand-word truncate text-[16px] tracking-tight">{brand}</span>
              <span className={`truncate text-[10px] tracking-[0.02em] text-faint transition-all duration-300 ${scrolled ? "max-h-0 opacity-0" : "mt-1 max-h-4 opacity-100"} hidden sm:block`}>{tag}</span>
            </span>
          </Link>
          <nav className="hidden flex-1 justify-center md:flex" onMouseLeave={() => setHover(null)}>
            <div ref={row} className="relative flex items-center gap-1 rounded-full p-1">
              {pill ? <span className="nav-pill absolute top-1 bottom-1 rounded-full" style={{ transform: `translateX(${pill.x}px)`, width: pill.w, left: 0 }} /> : null}
              {items.map((it, i) => (
                <Link
                  key={it.href}
                  href={it.href}
                  data-nav
                  onMouseEnter={() => setHover(i)}
                  aria-current={i === active ? "page" : undefined}
                  className={`relative z-10 rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors ${i === active ? "text-ink" : "text-muted hover:text-ink"}`}
                >
                  {it.label}
                </Link>
              ))}
            </div>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">{right}</div>
        </div>
      </header>

      {/* phones: the sections as a dock */}
      <nav className="dock fixed inset-x-3 bottom-3 z-40 flex items-stretch justify-between rounded-[24px] px-1.5 py-1.5 md:hidden" aria-label={brand}>
        {items.map((it, i) => (
          <Link key={it.href} href={it.href} aria-current={i === active ? "page" : undefined} className={`dock-item flex flex-1 flex-col items-center gap-0.5 rounded-[18px] py-1.5 text-[10.5px] font-medium ${i === active ? "is-on text-accent" : "text-muted"}`}>
            <Icon k={it.icon} />
            <span>{it.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
