import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartyDot } from "@/components/ui";
import { getUnparsed, memberMap } from "@/lib/data";
import { dict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).unparsed.title } : {};
}

export default async function Unparsed({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const mm = memberMap();
  const rows = getUnparsed();
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.unparsed.title}</h1>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-muted">{t.unparsed.intro}</p>
      <div className="card scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t.table.filed}</th>
              <th>{t.table.member}</th>
              <th>{t.table.chamber}</th>
              <th>{t.table.type}</th>
              <th className="r">{t.common.source}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const m = mm.get(f.m);
              return (
                <tr key={f.doc}>
                  <td className="num text-muted">{f.fil ?? "—"}</td>
                  <td>
                    <Link prefetch={false} href={`/${locale}/member/${f.m}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <PartyDot party={m?.party} />
                      {m ? (locale === "zh" && m.zh ? m.zh : m.name) : f.m}
                    </Link>
                  </td>
                  <td>{t.chamber[f.ch]}</td>
                  <td className="text-muted">{t.unparsed.why[f.why as keyof typeof t.unparsed.why] ?? f.why}</td>
                  <td className="r">
                    <a className="link" href={f.url} target="_blank" rel="noopener noreferrer">
                      {t.common.viewSource} ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
