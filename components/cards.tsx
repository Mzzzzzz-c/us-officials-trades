import Link from "next/link";
import { LivePrice, LiveSince } from "@/components/client/Quotes";
import { Avatar, AvatarStack, Logo, Sparkline } from "@/components/media";
import type { Trade } from "@/lib/data";
import { amountRange } from "@/lib/format";
import { dict, type Locale } from "@/lib/i18n";
import type { PersonLite } from "@/lib/people";

export function TypePill({ type, act, locale }: { type: string; act?: string; locale: Locale }) {
  const t = dict(locale);
  const buy = type === "P";
  const ex = type === "E";
  const label = act && t.acts[act as keyof typeof t.acts] ? t.acts[act as keyof typeof t.acts] : t.types[type as keyof typeof t.types] ?? type;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${
        ex ? "bg-surface-2 text-muted" : buy ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"
      }`}
    >
      {label}
    </span>
  );
}

/** A stock tile: logo, live price, who's been trading it, a 6-month sparkline. */
export function StockTile({
  href,
  sym,
  name,
  kind,
  price,
  prev,
  spark,
  people,
  caption,
}: {
  href: string;
  sym: string;
  name: string;
  kind?: 1 | 2 | 3;
  price?: number;
  prev?: number;
  spark: number[];
  people: PersonLite[];
  caption: string;
}) {
  return (
    <Link prefetch={false} href={href} className="tile snap-start flex w-[250px] shrink-0 flex-col p-5 sm:w-[270px]">
      <div className="flex items-start justify-between gap-3">
        <Logo sym={sym} kind={kind} size={44} />
        <LivePrice sym={sym} fallback={price} fallbackPrev={prev} size="md" />
      </div>
      <div className="mt-4 text-[17px] font-semibold tracking-tight">{sym}</div>
      <div className="truncate text-[13px] text-muted">{name}</div>
      <div className="mt-3">
        <Sparkline values={spark} width={210} height={44} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <AvatarStack people={people} size={26} max={5} />
        <span className="text-xs text-muted">{caption}</span>
      </div>
    </Link>
  );
}

/** One disclosed trade as a row: who, what, how much, when. */
export function TradeRow({ tr, p, s, locale }: { tr: Trade; p: PersonLite; s: { sym: string; name: string; kind?: 1 | 2 | 3 } | null; locale: Locale }) {
  const t = dict(locale);
  const L = (x: string) => `/${locale}${x}`;
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:gap-4 sm:px-5">
      <Link prefetch={false} href={L(`/member/${tr.m}`)} className="shrink-0">
        <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link prefetch={false} href={L(`/member/${tr.m}`)} className="truncate text-[15px] font-semibold hover:underline">
            {p.name}
          </Link>
          <TypePill type={tr.type} act={tr.act} locale={locale} />
          {tr.ov ? <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">{t.x.oversightFlag}</span> : null}
        </div>
        <div className="truncate text-xs text-muted">{p.role}</div>
      </div>
      <Link prefetch={false} href={s ? L(`/ticker/${s.sym}`) : L(`/trade/${tr.id}`)} className="hidden min-w-0 items-center gap-2.5 sm:flex sm:w-56">
        {s ? <Logo sym={s.sym} kind={s.kind} size={32} /> : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold">{s ? s.sym : "—"}</div>
          <div className="truncate text-xs text-muted">{s ? s.name : tr.asset}</div>
        </div>
      </Link>
      <div className="w-24 shrink-0 text-right sm:w-28">
        <div className="num text-sm font-medium">{amountRange(tr.amin, tr.amax)}</div>
        <div className="num text-xs text-faint">{tr.tx ?? "—"}</div>
      </div>
      <div className="hidden w-20 shrink-0 text-right text-sm md:block">
        {tr.sym && tr.ent?.fol ? <LiveSince sym={tr.sym} entry={tr.ent.fol} /> : <span className="text-faint">—</span>}
        <div className="num text-[11px] text-faint">{tr.fil}</div>
      </div>
    </div>
  );
}

export function PersonCard({ p, href, stat, sub }: { p: PersonLite; href: string; stat?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Link prefetch={false} href={href} className="tile flex flex-col items-center px-4 pt-6 pb-5 text-center">
      <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={84} />
      <div className="mt-4 line-clamp-1 text-[15px] font-semibold tracking-tight">{p.name}</div>
      <div className="line-clamp-2 min-h-[2.4em] text-xs leading-snug text-muted">{p.role}</div>
      {stat ? <div className="mt-3 text-sm">{stat}</div> : null}
      {sub ? <div className="mt-1 text-xs text-faint">{sub}</div> : null}
    </Link>
  );
}
