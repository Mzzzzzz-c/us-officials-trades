import Link from "next/link";
import type { Position, PositionStep } from "@/lib/data";
import { shareRange } from "@/lib/format";
import { dict, type Locale } from "@/lib/i18n";

const ACT_TONE: Record<string, string> = {
  open: "bg-pos-soft text-pos",
  add: "bg-pos-soft text-pos",
  reduce: "bg-neg-soft text-neg",
  sell: "bg-neg-soft text-neg",
  close: "bg-neg text-white",
  exchange: "bg-surface-2 text-muted",
  other: "bg-surface-2 text-muted",
};

export default function Positions({ locale, positions, names }: { locale: Locale; positions: Position[]; names: Record<string, string> }) {
  const t = dict(locale);
  const L = (p: string) => `/${locale}${p}`;
  const list = [...positions].sort((a, b) => Number(b.held) - Number(a.held) || (a.last < b.last ? 1 : -1));
  const head = list.slice(0, 24);
  const rest = list.slice(24);
  const render = (p: Position) => (
    <div key={p.sym} className="card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <Link prefetch={false} href={L(`/ticker/${p.sym}`)} className="font-semibold link">
            {p.sym}
          </Link>
          <span className="ml-2 text-xs text-faint truncate">{names[p.sym] ?? ""}</span>
        </div>
        <div className="flex gap-1.5 text-[11px]">
          {p.flags.includes("held_before_data") && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-warn">{t.member.heldBefore}</span>}
          {p.flags.includes("unknown_size") && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">{t.member.unknownSize}</span>}
          <span className={`rounded px-1.5 py-0.5 ${p.held ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>
            {p.held ? t.member.stillHeld : t.member.closed}
          </span>
        </div>
      </div>
      <Steps locale={locale} steps={p.steps} />
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {head.map(render)}
      {rest.length > 0 && (
        <details className="md:col-span-2">
          <summary className="link text-sm">
            {t.common.showAll} ({list.length})
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">{rest.map(render)}</div>
        </details>
      )}
    </div>
  );
}

interface Group extends PositionStep {
  n: number;
}

/** Same-day trades with the same action collapse into one chip (x n). */
function group(steps: PositionStep[]): Group[] {
  const out: Group[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last.tx === s.tx && last.act === s.act) {
      last.n += 1;
      last.lo = s.lo;
      last.hi = s.hi;
    } else {
      out.push({ ...s, n: 1 });
    }
  }
  return out;
}

const SHOW = 10;

function Steps({ locale, steps }: { locale: Locale; steps: PositionStep[] }) {
  const t = dict(locale);
  const L = (p: string) => `/${locale}${p}`;
  const groups = group(steps);
  const chip = (s: Group, i: number) => (
    <li key={s.id} className="flex items-center gap-1">
      {i > 0 && <span className="text-faint">→</span>}
      <Link prefetch={false} href={L(`/trade/${s.id}`)} className="rounded border border-line px-1.5 py-1 hover:bg-surface-2" title={`${t.table.holding}: ${shareRange(s.lo, s.hi)} ${t.common.shares}`}>
        <span className={`mr-1 rounded px-1 py-0.5 ${ACT_TONE[s.act] ?? ACT_TONE.other}`}>
          {t.acts[s.act as keyof typeof t.acts] ?? s.act}
          {s.n > 1 ? ` ×${s.n}` : ""}
        </span>
        <span className="num text-muted">{s.tx.slice(2)}</span>
        <span className="num ml-1 text-faint">{shareRange(s.lo, s.hi)}</span>
      </Link>
    </li>
  );
  if (groups.length <= SHOW) {
    return <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">{groups.map(chip)}</ol>;
  }
  const early = groups.slice(0, groups.length - SHOW);
  const late = groups.slice(-SHOW);
  return (
    <div className="mt-2 text-xs">
      <details>
        <summary className="link mb-2">
          {t.common.showAll} ({groups.length})
        </summary>
        <ol className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-2">{early.map(chip)}</ol>
      </details>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        <li className="text-faint">…</li>
        {late.map((g, i) => chip(g, i + 1))}
      </ol>
    </div>
  );
}
