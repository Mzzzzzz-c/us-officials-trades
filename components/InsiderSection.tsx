import Link from "next/link";
import { type InsiderFile, insiderLabel, insiderSum } from "@/lib/data";
import { usdShort } from "@/lib/format";
import { dict, fmt, type Locale } from "@/lib/i18n";


/** Company insiders' open-market trades next to what officials did, plus the timing-vs-earnings note. */
export default function InsiderSection({
  locale,
  ins,
  officials,
  earn,
  today,
  bulkEnd,
  symbol,
}: {
  /** ticker, for the link to this company's insiders */
  symbol?: string;
  /** the day the data was last rebuilt, and the end of the last quarterly data set */
  today: string;
  bulkEnd: string | null;
  locale: Locale;
  ins: InsiderFile;
  /** officials' buys and sells in the last 90 days */
  officials: { b: number; s: number };
  /** officials' trades near earnings: total considered, how many in the 30 days before a release, chance level */
  earn: { n: number; k: number; base: number; releases: number } | null;
}) {
  const t = dict(locale);
  const i = t.insider;
  const s = insiderSum(ins.tx, today);
  const insBuy = s.b90 > 0 && s.b90 >= s.s90;
  const insSell = s.s90 > 0 && s.s90 > s.b90;
  const offBuy = officials.b > 0 && officials.b >= officials.s;
  const offSell = officials.s > 0 && officials.s > officials.b;
  const verdict = insBuy && offBuy ? ([i.bothBuying, "bg-pos-soft text-pos"] as const) : insSell && offSell ? ([i.bothSelling, "bg-neg-soft text-neg"] as const) : (insBuy && offSell) || (insSell && offBuy) ? ([i.opposite, "bg-warn-soft text-warn"] as const) : null;
  // "See Remarks" is what filers type when the title did not fit the form
  const role = (rel: string, ttl: string) => (ttl && !/^see remarks?/i.test(ttl) ? ttl : "") || [...rel].map((c) => i.rel[c as keyof typeof i.rel] ?? "").filter(Boolean).join(" · ");
  const cell = (label: string, n: number, v: number, people: number, tone: "pos" | "neg") => (
    <div className="bg-surface p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`mt-1 text-[30px] font-semibold tracking-tight ${n ? (tone === "pos" ? "text-pos" : "text-neg") : "text-faint"}`}>{n ? usdShort(v) : i.none}</div>
      <div className="mt-1 text-xs text-faint">{n ? `${fmt(i.nTrades, { n })} · ${fmt(i.people, { n: people })}` : " "}</div>
    </div>
  );
  return (
    <div>
      {verdict ? <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-[13px] font-semibold ${verdict[1]}`}>{verdict[0]}</div> : null}
      <div className="card grid gap-px overflow-hidden bg-hair sm:grid-cols-2 lg:grid-cols-4">
        {cell(`${i.d90} · ${i.buys}`, s.b90, s.vb90, s.nb90, "pos")}
        {cell(`${i.d90} · ${i.sells}`, s.s90, s.vs90, s.ns90, "neg")}
        {cell(`${i.d365} · ${i.buys}`, s.b365, s.vb365, s.nb365, "pos")}
        {cell(`${i.d365} · ${i.sells}`, s.s365, s.vs365, s.ns365, "neg")}
      </div>
      <p className="mt-3 text-[13px] text-muted">
        {i.vsOfficials}：{fmt(i.officialsLine, { b: officials.b, s: officials.s })}
      </p>

      {ins.tx.length ? (
        <div className="card scroll-x mt-6 overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>{i.date}</th>
                <th>{i.who}</th>
                <th>{i.side}</th>
                <th className="r">{i.shares}</th>
                <th className="r">{i.price}</th>
                <th className="r">{i.value}</th>
                <th className="r">{i.filed}</th>
              </tr>
            </thead>
            <tbody>
              {ins.tx.slice(0, 15).map((r, k) => (
                <tr key={k}>
                  <td className="num whitespace-nowrap">{r[0]}</td>
                  <td>
                    {r[11] ? (
                      <Link prefetch={false} href={`/${locale}/insider/${r[11]}`} className="font-medium hover:underline">
                        {insiderLabel(r[11], r[2], locale)}
                      </Link>
                    ) : (
                      <div className="font-medium">{insiderLabel(r[11], r[2], locale)}</div>
                    )}
                    <div className="max-w-[240px] truncate text-[11px] text-faint">{role(r[3], r[4])}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${r[5] === "P" ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}>{r[5] === "P" ? i.buys : i.sells}</span>
                    {r[9] ? (
                      <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted" title={i.planTip}>
                        {i.plan}
                      </span>
                    ) : null}
                  </td>
                  <td className="r num">{r[6].toLocaleString("en-US")}</td>
                  <td className="r num">${r[7].toFixed(2)}</td>
                  <td className="r num font-medium">{usdShort(r[8])}</td>
                  <td className="r num whitespace-nowrap">
                    <a className="link" href={`https://www.sec.gov/Archives/edgar/data/${ins.cik}/${r[10].replace(/-/g, "")}/`} target="_blank" rel="noopener noreferrer">
                      {r[1]}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="card mt-6 px-5 py-8 text-center text-sm text-muted">{i.empty}</p>
      )}

      {earn && earn.n >= 5 ? (
        <div className="well mt-6 rounded-2xl p-5">
          <div className="text-[15px] font-semibold">{i.earnTitle}</div>
          <p className="mt-1.5 text-[15px]">
            {fmt(i.earnLine, { n: earn.n, k: earn.k, p: `${Math.round((earn.k / earn.n) * 100)}%` })} <span className="text-muted">{fmt(i.earnBase, { p: `${Math.round(earn.base * 100)}%` })}</span>
          </p>
          <p className="mt-1.5 text-xs text-faint">{fmt(i.earnNote, { n: earn.releases })}</p>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-faint">
        {ins.full ? fmt(i.through, { d: today }) : fmt(i.partial, { d: bulkEnd ?? "—" })}
        {symbol ? (
          <>
            {" · "}
            <Link prefetch={false} className="link" href={`/${locale}/insiders?q=${encodeURIComponent(symbol)}`}>
              {i.listLink} ›
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
