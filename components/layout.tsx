import Link from "next/link";
import type { ReactNode } from "react";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1100px] px-5 ${className}`}>{children}</div>;
}

/** Page title block: big, quiet, generous spacing. */
export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <Container className="pt-12 pb-8 sm:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
          <h1 className="headline">{title}</h1>
          {sub ? <p className="lead mt-4">{sub}</p> : null}
        </div>
        {right}
      </div>
    </Container>
  );
}

export function SectionHead({ eyebrow, title, sub, href, more, id }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; href?: string; more?: string; id?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4" id={id}>
      <div className="max-w-2xl">
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h2 className="title-1">{title}</h2>
        {sub ? <p className="mt-2 text-[15px] text-muted">{sub}</p> : null}
      </div>
      {href && more ? (
        <Link prefetch={false} href={href} className="btn-ghost inline-flex items-center gap-1 text-[15px] text-accent hover:underline">
          {more}
          <span aria-hidden>›</span>
        </Link>
      ) : null}
    </div>
  );
}

export function Band({ children, className = "", alt = false, id }: { children: ReactNode; className?: string; alt?: boolean; id?: string }) {
  return (
    <section id={id} className={`py-14 sm:py-20 ${alt ? "bg-elev" : ""} ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function Metric({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`num mt-1 text-[28px] font-semibold leading-tight tracking-tight ${tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : ""}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-faint">{sub}</div> : null}
    </div>
  );
}
