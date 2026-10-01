import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ConfBadge, PartyDot, Pct, Section, TypeBadge } from "@/components/ui";
import { getLatestPrices, getMember } from "@/lib/data";
import { amountRange, price, priceRange, shareRange, shares, since } from "@/lib/format";
import { dict, fmt, isLocale } from "@/lib/i18n";

function load(id: string) {
  const mid = id.split("-")[0];
  const page = getMember(mid);
  const tr = page?.trades.find((t) => t.id === id);
  return page && tr ? { page, tr } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const x = load(id);
  if (!x) return {};
  const t = dict(locale);
  const who = locale === "zh" && x.page.profile.zh ? x.page.profile.zh : x.page.profile.name;
  return { title: `${who} · ${t.types[x.tr.type]} ${x.tr.sym ?? x.tr.asset ?? ""} · ${x.tr.tx ?? ""}`, robots: { index: false } };
}

export default async function TradePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const x = load(id);
  if (!x) notFound();
  const { page, tr } = x;
  const t = dict(locale);
  const p = page.profile;
  const { px } = getLatestPrices();
  const now = tr.sym ? px[tr.sym] : undefined;
  const e = tr.est;
  const pos = tr.sym ? page.positions.find((q) => q.sym === tr.sym) : undefined;
  const who = locale === "zh" && p.zh ? p.zh : p.name;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pt-12 sm:pt-16 max-w-4xl">
      <div className="text-sm text-muted">
        <Link prefetch={false} className="link" href={`/${locale}/member/${p.id}`}>
          <PartyDot party={p.party} /> {who}
        </Link>
        <span> · {t.chamber[p.chamber]} · {p.state}</span>
      </div>
      <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold">
        <TypeBadge type={tr.type} label={t.types[tr.type]} />
        {tr.sym ? (
          <Link prefetch={false} className="link" href={`/${locale}/ticker/${tr.sym}`}>
            {tr.sym}
          </Link>
        ) : null}
        <span className="text-base font-normal text-muted">{tr.asset}</span>
      </h1>

      <div className="mt-5 card divide-y divide-line">
        <Row k={t.table.tx} v={tr.tx ?? "—"} />
        {tr.nd ? <Row k={t.trade.notification} v={tr.nd} /> : null}
        <Row k={t.table.filed} v={<>{tr.fil ?? "—"} {tr.delay != null ? <span className={tr.delay > 45 ? "text-warn" : "text-faint"}>({fmt(t.table.days, { n: tr.delay })})</span> : null}</>} />
        <Row k={t.table.amount} v={amountRange(tr.amin, tr.amax, false)} />
        <Row k={t.table.owner} v={t.owners[tr.own]} />
        {tr.sub ? <Row k={t.trade.subholding} v={tr.sub} /> : null}
        {tr.act ? <Row k={t.table.action} v={t.acts[tr.act as keyof typeof t.acts] ?? tr.act} /> : null}
        {tr.opt ? (
          <Row
            k={t.trade.option}
            v={[tr.opt.kind ? t.trade[tr.opt.kind as "call" | "put"] ?? tr.opt.kind : null, tr.opt.strike ? `${t.trade.strike} ${price(tr.opt.strike)}` : null, tr.opt.exp ? `${t.trade.expiry} ${tr.opt.exp}` : null]
              .filter(Boolean)
              .join(" · ")}
          />
        ) : null}
        {tr.amd ? <Row k={t.trade.amended} v={t.common.yes} /> : null}
        {tr.desc ? <Row k={t.trade.description} v={<span className="text-muted">{tr.desc}</span>} /> : null}
        <Row
          k={t.common.source}
          v={
            <a className="link" href={tr.src} target="_blank" rel="noopener noreferrer">
              {t.common.viewSource} ↗
            </a>
          }
        />
      </div>

      <Section title={`${t.table.estPrice} · ${t.table.estShares}`}>
        <div className="card divide-y divide-line">
          <Row k={t.table.conf} v={<>{e ? <ConfBadge conf={e.conf} label={t.conf[e.conf]} /> : "—"} {e?.why ? <span className="ml-2 text-muted">{t.why[e.why as keyof typeof t.why] ?? e.why}</span> : null}</>} />
          {e?.d ? <Row k={t.trade.tradingDay} v={e.d} /> : null}
          {e?.p ? <Row k={e.conf === "reported" ? t.trade.reportedPrice : t.trade.typical} v={price(e.p)} /> : null}
          {e?.lo != null ? <Row k={t.trade.priceRange} v={priceRange(e.lo, e.hi)} /> : null}
          {e?.smin != null ? <Row k={t.trade.sharesRange} v={<>{shareRange(e.smin, e.smax)} {t.common.shares}{e.sh_rep ? <span className="ml-2 text-faint">({t.trade.reportedShares})</span> : null}</>} /> : null}
          {e?.smid != null ? <Row k={t.trade.sharesPoint} v={`${t.common.approx} ${shares(e.smid)} ${t.common.shares}`} /> : null}
          {e?.f ? <Row k="" v={<span className="text-faint">{t.trade.splitNote} (×{e.f})</span>} /> : null}
        </div>
      </Section>

      {tr.ent && (
        <Section title={t.trade.entries}>
          <div className="card scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t.trade.horizon}</th>
                  <th className="r">{t.trade.officialReturn}</th>
                  <th className="r">{t.trade.spy}</th>
                  <th className="r">{t.trade.followerReturn}</th>
                  <th className="r">{t.trade.spy}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-muted">{t.table.estPrice}</td>
                  <td className="r num">{price(tr.ent.off)}</td>
                  <td className="r num text-faint">{price(tr.ent.soff)}</td>
                  <td className="r num">
                    {price(tr.ent.fol)} <span className="text-[11px] text-faint">{tr.ent.fold}</span>
                  </td>
                  <td className="r num text-faint">{price(tr.ent.sfol)}</td>
                </tr>
                {["30", "90", "180", "365"].map((h) => {
                  const row = tr.h?.[h];
                  return (
                    <tr key={h}>
                      <td>{fmt(t.trade.horizonDays, { n: h })}</td>
                      {row ? (
                        <>
                          <td className="r"><Pct v={row[0]} /></td>
                          <td className="r"><Pct v={row[2]} /></td>
                          <td className="r"><Pct v={row[1]} /></td>
                          <td className="r"><Pct v={row[3]} /></td>
                        </>
                      ) : (
                        <td className="r text-faint" colSpan={4}>
                          {t.trade.notElapsed}
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr>
                  <td className="font-medium">{t.trade.live}</td>
                  <td className="r"><Pct v={since(tr.ent.off, now)} /></td>
                  <td className="r"><Pct v={since(tr.ent.soff, px.SPY)} /></td>
                  <td className="r"><Pct v={since(tr.ent.fol, now)} /></td>
                  <td className="r"><Pct v={since(tr.ent.sfol, px.SPY)} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">
            {t.trade.official} / {t.trade.follower}
          </p>
        </Section>
      )}

      {pos && pos.steps.length > 1 && (
        <Section title={t.trade.positionInStock}>
          <ol className="card divide-y divide-line text-sm">
            {pos.steps.map((s) => (
              <li key={s.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${s.id === tr.id ? "bg-accent-soft" : ""}`}>
                <span className="num text-muted">{s.tx}</span>
                <Link prefetch={false} className="link" href={`/${locale}/trade/${s.id}`}>
                  {t.acts[s.act as keyof typeof t.acts] ?? s.act}
                </Link>
                <span className="num text-faint">
                  {t.table.holding}: {shareRange(s.lo, s.hi)}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-2.5 text-sm">
      <div className="w-32 shrink-0 text-muted">{k}</div>
      <div className="min-w-0 num">{v}</div>
    </div>
  );
}
