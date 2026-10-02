import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TradeRow } from "@/components/cards";
import { Container, Metric } from "@/components/layout";
import { Avatar, Logo } from "@/components/media";
import type { Trade } from "@/lib/data";
import { getCommittees } from "@/lib/derived";
import { amountRange } from "@/lib/format";
import { dict, fmt, isLocale } from "@/lib/i18n";
import { committeeName, committeeTitle } from "@/lib/labels";
import { person, stock } from "@/lib/people";

export const dynamicParams = false;

export function generateStaticParams() {
  return getCommittees().map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const c = getCommittees().find((x) => x.id === id);
  if (!c) return {};
  const t = dict(locale).committee;
  return { title: committeeName(c.id, c.name, locale), description: `${c.members.length} ${t.members} · ${fmt(t.nOv, { n: c.nov })}` };
}

export default async function CommitteePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const c = getCommittees().find((x) => x.id === id);
  if (!c) notFound();
  const t = dict(locale);
  const k = t.committee;
  const L = (p: string) => `/${locale}${p}`;
  const chamber = c.id.startsWith("H") ? k.house : c.id.startsWith("S") ? k.senate : k.joint;
  return (
    <div>
      <section className="bg-elev">
        <Container className="pt-12 pb-10 sm:pt-16">
          <Link prefetch={false} href={L("/committees")} className="link text-sm">
            ‹ {k.all}
          </Link>
          <div className="eyebrow mt-4">{chamber}</div>
          <h1 className="headline mt-1">{committeeName(c.id, c.name, locale)}</h1>
          {locale === "zh" ? <div className="mt-1 text-[15px] text-muted">{c.name}</div> : null}
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-hair pt-8 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label={k.membersTitle} value={c.members.length} />
            <Metric label={k.allTrades} value={c.n.toLocaleString("en-US")} />
            <Metric label={k.ovTrades} value={<span className={c.nov ? "text-warn" : ""}>{c.nov.toLocaleString("en-US")}</span>} sub={c.last ? `${k.last} ${c.last}` : undefined} />
            <Metric
              label={`${k.buys} / ${k.sells}`}
              value={
                <>
                  <span className="text-pos">{c.nb}</span>
                  <span className="mx-1 text-faint">/</span>
                  <span className="text-neg">{c.ns}</span>
                </>
              }
            />
            <Metric label={k.volume} value={<span className="text-[20px]">{c.nov ? amountRange(c.vmin, c.vmax) : "—"}</span>} />
          </div>
        </Container>
      </section>

      <Container className="pb-16">
        <section className="mt-12">
          <h2 className="title-1">{k.membersTitle}</h2>
          <p className="mt-2 mb-6 text-[15px] text-muted">{k.membersSub}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {c.members.map((m) => {
              const p = person(m.id, locale);
              return (
                <Link key={m.id} prefetch={false} href={L(`/member/${m.id}`)} className="tile flex items-center gap-3 p-4">
                  <Avatar id={p.id} name={p.en} party={p.party} has={p.has} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{p.name}</span>
                      {m.title ? <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{committeeTitle(m.title, locale)}</span> : null}
                    </div>
                    <div className="truncate text-xs text-muted">{p.role}</div>
                    <div className="num mt-1 text-xs">
                      <span className={m.nov ? "font-semibold text-warn" : "text-faint"}>{fmt(k.nOv, { n: m.nov })}</span>
                      <span className="mx-1.5 text-faint">·</span>
                      <span className="text-muted">{fmt(k.nTrades, { n: m.n.toLocaleString("en-US") })}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {c.stocks.length ? (
          <section className="mt-14">
            <h2 className="title-1 mb-6">{k.stocksTitle}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {c.stocks.map((x) => {
                const s = stock(x.sym, locale);
                return (
                  <Link key={x.sym} prefetch={false} href={L(`/ticker/${encodeURIComponent(x.sym)}`)} className="tile flex items-center gap-3 p-4">
                    <Logo sym={x.sym} kind={s.kind} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold">{x.sym}</div>
                      <div className="truncate text-xs text-muted">{s.name}</div>
                    </div>
                    <div className="num shrink-0 text-right text-sm">
                      <span className="font-semibold text-pos">{x.nb}</span>
                      <span className="mx-1 text-faint">/</span>
                      <span className="font-semibold text-neg">{x.ns}</span>
                      <div className="text-xs text-muted">{fmt(t.weekly.nOfficials, { n: x.nm })}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-14">
          <h2 className="title-1">{k.tradesTitle}</h2>
          <p className="mt-2 mb-6 text-[15px] text-muted">{fmt(k.tradesSub, { n: c.recent.length })}</p>
          {c.recent.length ? (
            <div className="card divide-y divide-hair overflow-hidden">
              {c.recent.map((r) => (
                <TradeRow key={r.id} tr={r as unknown as Trade} p={person(r.m, locale)} s={r.sym ? stock(r.sym, locale) : null} locale={locale} />
              ))}
            </div>
          ) : (
            <p className="card px-5 py-8 text-center text-muted">{k.none}</p>
          )}
          <p className="mt-4 text-[13px] leading-relaxed text-faint">{k.how}</p>
        </section>
      </Container>
    </div>
  );
}
