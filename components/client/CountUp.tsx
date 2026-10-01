"use client";

import { useEffect, useRef, useState } from "react";

/** A number that counts up from zero when it first becomes visible. */
export default function CountUp({ value, format = "int", duration = 1200, className = "" }: { value: number; format?: "int" | "pct" | "pct1"; duration?: number; className?: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setV(0);
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || started.current) return;
      started.current = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / duration);
        const ease = 1 - Math.pow(1 - k, 3);
        setV(value * ease);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      io.disconnect();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);
  const text =
    format === "pct" ? `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%` : format === "pct1" ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("en-US");
  return (
    <span ref={ref} className={`num ${className}`}>
      {text}
    </span>
  );
}
