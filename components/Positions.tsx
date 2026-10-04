import Link from "next/link";
import { LivePrice } from "./client/Quotes";
import { Logo } from "./media";
import type { Position, PositionStep } from "@/lib/data";
import PositionTrack from "./client/PositionTrack";
import { shareRange } from "@/lib/format";
import { dict, type Locale } from "@/lib/i18n";

export default function Positions({ locale, positions, names, kinds = {}, px = {}, pc = {} }: { locale: Locale; positions: Position[]; names: Record<string, string>; kinds?: Record<string, 1 | 2 | 3>; px?: Record<string, number>; pc?: Record<string, number> }) {
  const t = dict(locale);
  const L = (p: string) => `/${locale}${p}`;
  const today = new Date().toISOString().slice(0, 10);
  const list = [...positions].sort((a, b) => Number(b.held) - Number(a.held) || (a.last < b.last ? 1 : -1));
  const head = list.slice(0, 24);
  const rest = list.slice(24);
  const render = (p: Position) => (
    <div key={p.sym} className="card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Link prefetch={false} href={L(`/ticker/${p.sym}`)} className="flex min-w-0 flex-1 items-center gap-3">
          <Logo sym={p.sym} kind={kinds[p.sym]} size={36} />
          <span className="min-w-0">
            <span className="block font-semibold">{p.sym}</span>
            <span className="block truncate text-xs text-muted">{names[p.sym] ?? ""}</span>
          </span>
        </Link>
        {p.held ? <LivePrice sym={p.sym} fallback={px[p.sym]} fallbackPrev={pc[p.sym]} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {p.flags.includes("held_before_data") && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-warn">{t.member.heldBefore}</span>}
          {p.flags.includes("unknown_size") && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">{t.member.unknownSize}</span>}
          <span className={`rounded px-1.5 py-0.5 ${p.held ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>
            {p.held ? t.member.stillHeld : t.member.closed}
          </span>
      </div>
      <Steps locale={locale} steps={p.steps} held={p.held} today={today} />
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

function Steps({ locale, steps, held, today }: { locale: Locale; steps: PositionStep[]; held: boolean; today: string }) {
  const t = dict(locale);
  const groups = group(steps);
  if (!groups.length) return null;
  const count = (acts: string[]) => groups.filter((g) => acts.includes(g.act)).reduce((a, g) => a + g.n, 0);
  const nb = count(["open", "add"]), ns = count(["reduce", "sell", "close"]);
  return (
    <div>
      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
        {nb ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-pos" />
            {t.x.buy} <b className="num font-semibold text-ink">{nb}</b>
          </span>
        ) : null}
        {ns ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-neg" />
            {t.x.sell} <b className="num font-semibold text-ink">{ns}</b>
          </span>
        ) : null}
      </div>
      <PositionTrack
        steps={groups.map((g) => ({ id: g.id, tx: g.tx, act: g.act, lo: g.lo, hi: g.hi, n: g.n, sh: g.lo == null && g.hi == null ? t.pos.unknown : `${shareRange(g.lo, g.hi)} ${t.common.shares}` }))}
        held={held}
        today={today}
        acts={t.acts}
        labels={{ holding: t.table.holding, open: t.pos.open, now: t.pos.now }}
        hrefBase={`/${locale}/trade`}
      />
    </div>
  );
}
