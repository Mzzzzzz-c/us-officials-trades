// RSS 2.0 feeds of new disclosures: /feed/zh.xml (everything), /feed/en.xml?m=P000197,E-trump-donald&s=NVDA
// Rendered on request and cached at the edge for an hour; the data itself changes once a day.
import { getMember, getMembers, getRecent, getTicker, type Trade } from "@/lib/data";
import { amountRange } from "@/lib/format";
import { dict, isLocale } from "@/lib/i18n";
import { roleShort } from "@/lib/people";
import { siteUrl } from "@/lib/site";

const MAX_ITEMS = 100;
const MAX_IDS = 60;

const esc = (s: string | null | undefined) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = (v: string | null) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[A-Za-z0-9._-]{1,40}$/.test(x))
    .slice(0, MAX_IDS);

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const locale = file.replace(/\.xml$/, "");
  if (!isLocale(locale) || !file.endsWith(".xml")) return new Response("Not found", { status: 404 });
  const t = dict(locale);
  const url = new URL(req.url);
  const ms = list(url.searchParams.get("m"));
  const ss = list(url.searchParams.get("s")).map((s) => s.toUpperCase());
  const site = siteUrl();
  const people = new Map(getMembers().map((m) => [m.id, m]));

  let items: Trade[] = [];
  if (!ms.length && !ss.length) {
    items = getRecent();
  } else {
    const seen = new Set<string>();
    const add = (ts: Trade[] | undefined) => {
      for (const tr of ts ?? []) if (!seen.has(tr.id)) (seen.add(tr.id), items.push(tr));
    };
    for (const id of ms) add(getMember(id)?.trades.slice(0, MAX_ITEMS * 2));
    for (const s of ss) add(getTicker(s)?.trades);
  }
  items = items
    .filter((x) => x.fil)
    .sort((a, b) => (b.fil ?? "").localeCompare(a.fil ?? "") || b.id.localeCompare(a.id))
    .slice(0, MAX_ITEMS);

  const subject = [...ms.map((id) => { const m = people.get(id); return m ? (locale === "zh" && m.zh ? m.zh : m.name) : id; }), ...ss].join(locale === "zh" ? "、" : ", ");
  const title = subject ? `${t.follow.feedTitle} · ${subject.length > 80 ? t.follow.feedMine : subject}` : t.follow.feedTitle;
  const self = `${site}/feed/${file}${url.search}`;

  const body = items
    .map((tr) => {
      const m = people.get(tr.m);
      const who = m ? (locale === "zh" && m.zh ? m.zh : m.name) : tr.m;
      const what = tr.sym ?? tr.asset ?? "";
      const amt = amountRange(tr.amin, tr.amax);
      const link = `${site}/${locale}/trade/${encodeURIComponent(tr.id)}`;
      const role = m ? roleShort(m, locale) : "";
      const lines = [
        `${t.types[tr.type] ?? tr.type} ${what}${tr.sym && tr.asset ? ` (${tr.asset})` : ""}`,
        `${t.table.amount}: ${amt}`,
        tr.tx ? `${t.table.tx}: ${tr.tx}` : "",
        `${t.table.filed}: ${tr.fil}`,
        `${t.table.owner}: ${t.owners[tr.own] ?? tr.own}`,
        role,
      ].filter(Boolean);
      // recent.json leaves out the source URL; the trade page links to it
      const desc = `<p>${lines.map(esc).join("<br/>")}</p>${tr.src ? `<p><a href="${esc(tr.src)}">${esc(t.common.viewSource)}</a></p>` : ""}`;
      return [
        "<item>",
        `<title>${esc(`${who} · ${t.types[tr.type] ?? tr.type} ${what} · ${amt}`)}</title>`,
        `<link>${esc(link)}</link>`,
        `<guid isPermaLink="false">${esc(tr.id)}</guid>`,
        `<pubDate>${new Date(`${tr.fil}T12:00:00Z`).toUTCString()}</pubDate>`,
        `<description><![CDATA[${desc}]]></description>`,
        "</item>",
      ].join("");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(title)}</title>
<link>${esc(`${site}/${locale}`)}</link>
<description>${esc(t.home.intro)}</description>
<language>${locale === "zh" ? "zh-CN" : "en-US"}</language>
<atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
<ttl>360</ttl>
${body}
</channel>
</rss>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
