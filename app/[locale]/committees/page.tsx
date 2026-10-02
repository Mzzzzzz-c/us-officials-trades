import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Reveal from "@/components/client/Reveal";
import { Container, PageHeader } from "@/components/layout";
import { AvatarStack } from "@/components/media";
import { type Committee, getCommittees } from "@/lib/derived";
import { dict, fmt, isLocale } from "@/lib/i18n";
import { committeeName } from "@/lib/labels";
import { person } from "@/lib/people";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale).committee;
  return { title: t.listTitle, description: t.listSub };
}

export default async function CommitteesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const c = t.committee;
  const all = getCommittees();
  const groups: [string, Committee[]][] = [
    [c.house, all.filter((x) => x.id.startsWith("H"))],
    [c.senate, all.filter((x) => x.id.startsWith("S"))],
    [c.joint, all.filter((x) => !/^[HS]/.test(x.id))],
  ];
  return (
    <div>
      <PageHeader title={c.listTitle} sub={c.listSub} />
      <Container className="pb-16">
        {groups.map(([label, list]) =>
          list.length ? (
            <section key={label} className="mb-14">
              <h2 className="title-1 mb-6">{label}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((x, i) => {
                  const people = x.members.slice(0, 6).map((m) => person(m.id, locale));
                  return (
                    <Reveal key={x.id} delay={Math.min(i, 8) * 30}>
                      <Link prefetch={false} href={`/${locale}/committee/${x.id}`} className="tile flex h-full flex-col p-5">
                        <h3 className="text-[17px] leading-snug font-semibold tracking-tight">{committeeName(x.id, x.name, locale)}</h3>
                        <div className="mt-1 text-xs text-muted">
                          {x.members.length} {c.members} · {fmt(c.nTrades, { n: x.n.toLocaleString("en-US") })}
                        </div>
                        <div className="mt-5 flex items-end justify-between gap-3">
                          <div>
                            <div className={`text-[28px] font-semibold tracking-tight ${x.nov ? "text-warn" : "text-faint"}`}>{x.nov.toLocaleString("en-US")}</div>
                            <div className="text-xs text-muted">{c.ovTrades}</div>
                          </div>
                          <AvatarStack people={people.map((p) => ({ id: p.id, name: p.en, party: p.party, has: p.has }))} size={30} max={5} />
                        </div>
                      </Link>
                    </Reveal>
                  );
                })}
              </div>
            </section>
          ) : null,
        )}
        <p className="well rounded-2xl p-5 text-[13px] leading-relaxed text-muted">{c.how}</p>
      </Container>
    </div>
  );
}
