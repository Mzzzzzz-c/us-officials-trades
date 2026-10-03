import Link from "next/link";
import { TradeRow } from "@/components/cards";
import { PosterButton } from "@/components/client/Share";
import { Container, Metric, PageHeader } from "@/components/layout";
import SectionTabs from "@/components/SectionTabs";
import { Avatar, AvatarStack, Logo } from "@/components/media";
import type { Trade } from "@/lib/data";
import type { TradeCardLite, Week } from "@/lib/derived";
import { amountRange } from "@/lib/format";
import { dict, fmt, type Locale } from "@/lib/i18n";
import { person, stock } from "@/lib/people";

const asTrade = (c: TradeCardLite) => c as unknown as Trade;

/** One week's review: totals, biggest trades, most active officials, most bought and sold stocks. */
export default function WeeklyView({ locale, weeks, week }: { locale: Locale; weeks: Week[]; week: Week }) {
  const t = dict(locale);
  const w = t.weekly;
  const L = (p: string) => `/${locale}${p}`;
  const label = (x: Week) => (x.partial ? `${w.thisWeek} (${x.from.slice(5)} – ${x.to.slice(5)})` : fmt(w.weekOf, { from: x.from, to: x.to }));

  const stocks = (list: Week["bought"], side: "b" | "s") =>
    list.length ? (
      <ul className="card divide-y divide-hair">
        {list.map((x) => {
          const s = stock(x.sym, locale);
          const people = x.ms.map((id) => person(id, locale));
          return (
            <li key={x.sym}>
              <Link prefetch={false} href={L(`/ticker/${encodeURIComponent(x.sym)}`)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                <Logo sym={x.sym} kind={s.kind} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{x.sym}</div>
                  <div className="truncate text-xs text-muted">{s.name}</div>
                </div>
                <AvatarStack people={people.map((p) => ({ id: p.id, name: p.en, party: p.party, has: p.has }))} size={26} max={4} />
                <div className="w-24 shrink-0 text-right text-xs">
                  <div className={`num text-sm font-semibold ${side === "b" ? "text-pos" : "text-neg"}`}>{fmt(w.nTrades, { n: side === "b" ? x.nb : x.ns })}</div>
                  <div className="text-muted">{fmt(w.nOfficials, { n: x.nm })}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="card px-5 py-8 text-center text-sm text-muted">{w.none}</p>
    );

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <SectionTabs locale={locale} group="insights" active="weekly" />
            <div>{label(week)}</div>
          </>
        }
        title={w.title}
        sub={w.sub}
        right={<PosterButton src={L("/poster/week")} path={L("/weekly")} text={`${w.title} · ${t.siteName}`} labels={t.share} label={w.poster} />}
      />
      <Container className="pb-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-hair py-8 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label={w.trades} value={week.n.toLocaleString("en-US")} />
          <Metric label={w.officials} value={week.officials} />
          <Metric label={w.buys} value={<span className="text-pos">{week.nb}</span>} />
          <Metric label={w.sells} value={<span className="text-neg">{week.ns}</span>} />
          <Metric label={w.volume} value={<span className="text-[20px]">{amountRange(week.vmin, week.vmax)}</span>} />
          <Metric label={w.late} value={<span className={week.late ? "text-warn" : ""}>{week.late}</span>} sub="> 45" />
        </div>

        <section className="mt-12">
          <h2 className="title-1 mb-6">{w.biggest}</h2>
          <div className="card divide-y divide-hair overflow-hidden">
            {week.biggest.map((c) => (
              <TradeRow key={c.id} tr={asTrade(c)} p={person(c.m, locale)} s={c.sym ? stock(c.sym, locale) : null} locale={locale} />
            ))}
          </div>
          <p className="mt-4 text-sm">
            <Link prefetch={false} className="link" href={L("/latest")}>
              {w.more} ›
            </Link>
          </p>
        </section>

        <section className="mt-14">
          <h2 className="title-1 mb-6">{w.active}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {week.active.map((a) => {
              const p = person(a.m, locale);
              return (
                <Link key={a.m} prefetch={false} href={L(`/member/${a.m}`)} className="tile flex items-center gap-3 p-4">
                  <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{p.name}</div>
                    <div className="truncate text-xs text-muted">{p.role}</div>
                    <div className="num mt-1 text-xs">
                      <span className="font-semibold">{fmt(w.nTrades, { n: a.n })}</span>
                      <span className="mx-1.5 text-faint">·</span>
                      <span className="text-pos">{a.nb}</span>
                      <span className="text-faint"> / </span>
                      <span className="text-neg">{a.ns}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-14 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="title-2 mb-4">{w.bought}</h2>
            {stocks(week.bought, "b")}
          </div>
          <div>
            <h2 className="title-2 mb-4">{w.sold}</h2>
            {stocks(week.sold, "s")}
          </div>
        </section>

        {week.slowest.some((c) => (c.delay ?? 0) > 45) ? (
          <section className="mt-14">
            <h2 className="title-2 mb-4">{w.slowest}</h2>
            <ul className="card divide-y divide-hair">
              {week.slowest
                .filter((c) => (c.delay ?? 0) > 45)
                .map((c) => {
                  const p = person(c.m, locale);
                  return (
                    <li key={c.id}>
                      <Link prefetch={false} href={L(`/trade/${encodeURIComponent(c.id)}`)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                        <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-medium">{p.name}</div>
                          <div className="truncate text-xs text-muted">
                            {c.sym ?? c.asset} · {amountRange(c.amin, c.amax)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="num text-sm font-semibold text-warn">{fmt(w.days, { n: c.delay ?? 0 })}</div>
                          <div className="num text-xs text-faint">
                            {c.tx} → {c.fil}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>
        ) : null}

        <section className="mt-14">
          <h2 className="title-2 mb-4">{w.otherWeeks}</h2>
          <div className="flex flex-wrap gap-2">
            {weeks.map((x) => (
              <Link key={x.from} prefetch={false} href={L(`/weekly/${x.from}`)} className="chip" aria-current={x.from === week.from ? "page" : undefined} aria-pressed={x.from === week.from}>
                <span className="num">
                  {x.from.slice(5)} – {x.to.slice(5)}
                </span>
                <span className="text-faint">{x.n}</span>
              </Link>
            ))}
          </div>
        </section>
      </Container>
    </div>
  );
}
