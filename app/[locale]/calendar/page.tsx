import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, PageHeader } from "@/components/layout";
import { Logo } from "@/components/media";
import { getInsiders, getMedia, getTickers } from "@/lib/data";
import { dict, fmt, isLocale } from "@/lib/i18n";
import { macroEvents } from "@/lib/timeline-events";

export const revalidate = 21600;
const DAYS = 45;
const PER_DAY = 18;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale);
  return { title: t.cal.title, description: t.cal.sub };
}

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const c = t.cal;
  const idx = getInsiders();
  const today = idx?.asof ?? new Date().toISOString().slice(0, 10);
  const end = new Date(Date.parse(today) + DAYS * 864e5).toISOString().slice(0, 10);
  const logos = getMedia().logos;
  const tick = new Map(getTickers().map((x) => [x.sym, x]));

  type Day = { earn: { sym: string; when: string; how: string; n: number; name: string }[]; macro: { label: string; href?: string }[] };
  const days = new Map<string, Day>();
  const day = (d: string) => days.get(d) ?? (days.set(d, { earn: [], macro: [] }), days.get(d)!);
  for (const [d, sym, when, how] of idx?.upcoming ?? []) {
    if (d < today || d > end) continue;
    const tk = tick.get(sym);
    if (!tk) continue;
    day(d).earn.push({ sym, when, how, n: tk.n, name: (locale === "zh" && tk.zh) || tk.name });
  }
  for (const e of macroEvents(locale, today)) if (e.d <= end) day(e.d).macro.push({ label: e.label, href: e.href });
  const list = Array.from(days.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // the most officially-traded companies first within a day
  for (const [, v] of list) v.earn.sort((a, b) => b.n - a.n);

  // the busiest Monday-to-Sunday week: the heart of earnings season
  const weeks = new Map<string, number>();
  for (const [d, v] of list) {
    const dt = new Date(`${d}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    const k = dt.toISOString().slice(0, 10);
    weeks.set(k, (weeks.get(k) ?? 0) + v.earn.length);
  }
  const peak = Array.from(weeks.entries()).sort((a, b) => b[1] - a[1])[0];
  const wd = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const anyEst = list.some(([, v]) => v.earn.some((e) => e.how === "est"));

  return (
    <div>
      <PageHeader title={c.title} sub={c.sub} />
      <Container className="pb-16">
        {peak && peak[1] >= 20 ? (
          <div className="well mb-8 rounded-2xl p-5">
            <div className="text-[15px] font-semibold">{c.season}</div>
            <p className="mt-1 text-[15px] text-muted">{fmt(c.seasonSub, { a: peak[0], b: new Date(Date.parse(peak[0]) + 6 * 864e5).toISOString().slice(0, 10), n: peak[1] })}</p>
          </div>
        ) : null}
        {list.length ? (
          <ol className="flex flex-col gap-4">
            {list.map(([d, v]) => (
              <li key={d} className="card grid gap-4 p-5 sm:grid-cols-[150px_1fr]">
                <div>
                  <div className="text-[17px] font-semibold tracking-tight">{wd(d)}</div>
                  <div className="num text-xs text-faint">
                    {d}
                    {d === today ? ` · ${c.today}` : ""}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  {v.macro.map((m, k) => (
                    <div key={k} className="flex items-center gap-2 text-[15px]">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: "#bf5af2" }}>
                        {c.macro}
                      </span>
                      {m.href ? (
                        <a className="font-medium hover:underline" href={m.href} target="_blank" rel="noopener noreferrer">
                          {m.label} ↗
                        </a>
                      ) : (
                        <span className="font-medium">{m.label}</span>
                      )}
                    </div>
                  ))}
                  {v.earn.length ? (
                    <div className="flex flex-wrap gap-2">
                      {v.earn.slice(0, PER_DAY).map((e) => (
                        <Link key={e.sym} prefetch={false} href={`/${locale}/ticker/${encodeURIComponent(e.sym)}#timeline`} className="chip py-1.5 pl-1.5" title={`${e.name} · ${fmt(c.officials, { n: e.n })}`}>
                          <Logo sym={e.sym} kind={logos[e.sym]} size={24} />
                          <span className="font-semibold">{e.sym}</span>
                          <span className="max-w-[120px] truncate text-muted">{e.name}</span>
                          {e.when ? <span className="text-[11px] text-faint">{e.when === "pre" ? c.pre : c.post}</span> : null}
                          {e.how === "est" ? <span className="rounded-full bg-warn-soft px-1.5 text-[11px] text-warn">{c.est}</span> : null}
                        </Link>
                      ))}
                      {v.earn.length > PER_DAY ? <span className="self-center text-xs text-faint">{fmt(c.more, { n: v.earn.length - PER_DAY })}</span> : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="card px-5 py-10 text-center text-muted">{c.none}</p>
        )}
        {anyEst ? <p className="mt-4 text-xs text-faint">{c.estNote}</p> : null}
      </Container>
    </div>
  );
}
