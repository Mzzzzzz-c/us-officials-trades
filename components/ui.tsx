import type { ReactNode } from "react";
import { pct } from "@/lib/format";

export function PartyDot({ party }: { party?: string }) {
  const color = party === "D" ? "bg-dem" : party === "R" ? "bg-rep" : party === "I" ? "bg-ind" : "bg-faint";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} aria-hidden />;
}

export function PartyBadge({ party, label }: { party?: string; label: string }) {
  const color =
    party === "D" ? "text-dem border-dem/40" : party === "R" ? "text-rep border-rep/40" : "text-ind border-ind/40";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${color}`}>{label}</span>;
}

export function TypeBadge({ type, label }: { type: string; label: string }) {
  const cls =
    type === "P"
      ? "bg-pos-soft text-pos"
      : type === "E"
        ? "bg-surface-2 text-muted"
        : "bg-neg-soft text-neg";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{label}</span>;
}

export function ConfBadge({ conf, label, title }: { conf: string; label: string; title?: string }) {
  const cls =
    conf === "high" || conf === "reported"
      ? "text-pos border-pos/30"
      : conf === "medium"
        ? "text-warn border-warn/40"
        : "text-muted border-line";
  return (
    <span title={title} className={`inline-block rounded border px-1.5 py-0 text-[11px] whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

export function Pct({ v, digits = 1, className = "" }: { v?: number | null; digits?: number; className?: string }) {
  if (v == null || Number.isNaN(v)) return <span className={`text-faint ${className}`}>—</span>;
  const cls = v > 0.0005 ? "text-pos" : v < -0.0005 ? "text-neg" : "text-muted";
  return <span className={`num ${cls} ${className}`}>{pct(v, digits)}</span>;
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card px-4 py-3 min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-snug num break-words sm:text-xl">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-faint">{sub}</div> : null}
    </div>
  );
}

export function Section({ title, children, right, id }: { title: ReactNode; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section className="mt-8" id={id}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-faint">{children}</p>;
}
