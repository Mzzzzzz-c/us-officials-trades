import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, PageHeader } from "@/components/layout";
import { Avatar, Logo } from "@/components/media";
import { getInsiderPeople, getMedia, insiderName, insiderTitle, tickerName, type InsiderPerson } from "@/lib/data";
import { usdShort } from "@/lib/format";
import { dict, fmt, isLocale } from "@/lib/i18n";

const PER_PAGE = 48;
const SORTS = ["recent", "buy", "sell", "n"] as const;
type Sort = (typeof SORTS)[number];
type Query = { q?: string; sort?: string; role?: string; page?: string };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale);
  return { title: t.insider.listTitle, description: t.insider.listSub };
}

export default async function InsidersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const t = dict(locale);
  const i = t.insider;
  const one = (v: unknown) => (typeof v === "string" ? v : "");
  const q = one(sp.q).trim().slice(0, 60);
  const sort: Sort = (SORTS as readonly string[]).includes(one(sp.sort)) ? (one(sp.sort) as Sort) : "recent";
  const role = ["D", "O", "T"].includes(one(sp.role)) ? one(sp.role) : "";
  const { people } = getInsiderPeople();
  const media = getMedia();
  const logos = media.logos;
  const nameOf = (p: InsiderPerson) => (locale === "zh" && p[11]) || p[10] || insiderName(p[1]);
  const company = (sym: string) => tickerName(sym, locale) ?? "";

  const needle = q.toLowerCase();
  const ticker = q.toUpperCase();
  let list = people.filter(
    (p) =>
      (!role || p[2].includes(role)) &&
      (!needle ||
        p[1].toLowerCase().includes(needle) ||
        (p[10] ?? "").toLowerCase().includes(needle) ||
        (p[11] ?? "").includes(q) ||
        p[3].toLowerCase().includes(needle) ||
        p[4].includes(ticker) ||
        // a company name, in either language
        (needle.length >= 2 && p[4].some((s) => (tickerName(s, "zh") ?? "").toLowerCase().includes(needle) || (tickerName(s, "en") ?? "").toLowerCase().includes(needle)))),
  );
  // the file is ordered by latest trade already
  const key = (p: InsiderPerson) => (sort === "buy" ? p[7] : sort === "sell" ? p[8] : p[5] + p[6]);
  if (sort !== "recent") list = [...list].sort((a, b) => key(b) - key(a));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, parseInt(one(sp.page), 10) || 1));
  const shown = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const href = (over: Partial<Record<keyof Query, string | number>>) => {
    const next = { q, sort: sort === "recent" ? "" : sort, role, page: "", ...over };
    const qs = Object.entries(next)
      .filter(([k, v]) => v !== "" && !(k === "page" && Number(v) <= 1))
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `/${locale}/insiders${qs ? `?${qs}` : ""}`;
  };
  const roleText = (p: InsiderPerson) => insiderTitle(p[3]) || [...p[2]].map((c) => i.rel[c as keyof typeof i.rel] ?? "").filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader title={i.listTitle} sub={i.listSub} />
      <Container>
        <div className="mb-8 flex flex-col gap-3">
          <form action={`/${locale}/insiders`} method="get" className="flex gap-2">
            <input className="input w-full sm:max-w-md" type="search" name="q" defaultValue={q} placeholder={i.search} aria-label={i.search} />
            {sort !== "recent" ? <input type="hidden" name="sort" value={sort} /> : null}
            {role ? <input type="hidden" name="role" value={role} /> : null}
            <button className="btn btn-quiet shrink-0" type="submit">
              {t.common.search}
            </button>
          </form>
          <div className="no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-1">
            {(
              [
                ["", i.allRoles],
                ["O", i.rel.O],
                ["D", i.rel.D],
                ["T", i.rel.T],
              ] as const
            ).map(([k, label]) => (
              <Link key={k} prefetch={false} scroll={false} href={href({ role: k })} className={`chip ${role === k ? "on" : ""}`} aria-current={role === k ? "true" : undefined}>
                {label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="seg">
              {(
                [
                  ["recent", i.sortRecent],
                  ["buy", i.sortBuy],
                  ["sell", i.sortSell],
                  ["n", i.sortN],
                ] as const
              ).map(([k, label]) => (
                <Link key={k} prefetch={false} scroll={false} href={href({ sort: k === "recent" ? "" : k })} className={sort === k ? "on" : ""} aria-current={sort === k ? "true" : undefined}>
                  {label}
                </Link>
              ))}
            </div>
            <span className="text-xs text-muted">
              {fmt(i.nPeople, { n: list.length.toLocaleString("en-US") })} · {i.window}
            </span>
          </div>
        </div>

        {shown.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => (
              <Link key={p[0]} prefetch={false} href={`/${locale}/insider/${p[0]}`} className="tile flex flex-col items-center px-4 pt-6 pb-4 text-center">
                <div className="relative">
                  <Avatar id={`ins-${p[0]}`} name={p[10] || insiderName(p[1])} has={!!media.people[`ins-${p[0]}`]} size={88} />
                  <span className="absolute -right-1.5 -bottom-1.5 rounded-[10px] shadow-[0_0_0_3px_var(--surface)]">
                    <Logo sym={p[4][0]} kind={logos[p[4][0]]} size={32} />
                  </span>
                </div>
                <div className="mt-4 line-clamp-1 text-[16px] font-semibold tracking-tight">{nameOf(p)}</div>
                {locale === "zh" && p[11] ? <div className="line-clamp-1 text-[11px] text-faint">{p[10]}</div> : null}
                <div className="mt-1 line-clamp-1 text-[13px] font-medium">
                  {company(p[4][0]) || p[4][0]}
                  {p[4].length > 1 ? <span className="text-faint"> +{p[4].length - 1}</span> : null}
                </div>
                <div className="line-clamp-1 text-xs leading-snug text-muted">
                  {p[4][0]} · {roleText(p)}
                </div>
                <div className="mt-4 grid w-full grid-cols-3 gap-1 border-t border-hair pt-3">
                  <Mini label={i.bought} value={p[5] ? <span className="text-pos">{usdShort(p[7])}</span> : <span className="text-faint">—</span>} />
                  <Mini label={i.sold} value={p[6] ? <span className="text-neg">{usdShort(p[8])}</span> : <span className="text-faint">—</span>} />
                  <Mini label={i.trades} value={(p[5] + p[6]).toLocaleString("en-US")} />
                </div>
                <div className="num mt-2 w-full text-right text-[11px] text-faint">{p[9]}</div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="card px-5 py-10 text-center text-muted">{i.noMatch}</p>
        )}

        {pages > 1 ? (
          <nav className="mt-10 flex items-center justify-center gap-4" aria-label={fmt(i.pageOf, { a: page, b: pages })}>
            {page > 1 ? (
              <Link prefetch={false} className="btn btn-quiet" href={href({ page: page - 1 })}>
                ‹ {i.prev}
              </Link>
            ) : null}
            <span className="num text-sm text-muted">{fmt(i.pageOf, { a: page, b: pages.toLocaleString("en-US") })}</span>
            {page < pages ? (
              <Link prefetch={false} className="btn btn-quiet" href={href({ page: page + 1 })}>
                {i.next} ›
              </Link>
            ) : null}
          </nav>
        ) : null}
      </Container>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="num text-[14px] font-semibold">{value}</div>
      <div className="truncate text-[10px] text-faint">{label}</div>
    </div>
  );
}
