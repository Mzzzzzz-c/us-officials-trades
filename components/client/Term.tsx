"use client";

import { useEffect, useRef, useState } from "react";

/** A word with a small "?" that explains it in one or two sentences, right where it is used. */
export default function Term({ children, tip, align = "left" }: { children: React.ReactNode; tip: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex items-center gap-1 whitespace-nowrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      <button type="button" aria-label={tip} aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex size-[15px] items-center justify-center rounded-full bg-surface-3 text-[10px] leading-none font-semibold text-muted transition-colors hover:bg-accent hover:text-white">
        ?
      </button>
      {open ? (
        <span role="tooltip" className={`float fade-up absolute top-full z-30 mt-2 w-[240px] rounded-xl p-3 text-left text-[12.5px] leading-relaxed font-normal whitespace-normal text-ink ${align === "right" ? "right-0" : "left-0"}`} style={{ animationDuration: "0.25s" }}>
          {tip}
        </span>
      ) : null}
    </span>
  );
}
