// Share posters, 1080x1440 PNG, each with a QR code back to its page:
//   /zh/poster/member/P000197        /zh/poster/trade/<trade id>     /zh/poster/ticker/NVDA
//   /zh/poster/investor/buffett      /zh/poster/leaderboard[?k=worst]
//   /zh/poster/party                 /zh/poster/week
import { isLocale } from "@/lib/i18n";
import { memberPoster } from "@/lib/poster";
import { timelinePoster } from "@/lib/poster-timeline";
import { investorPoster, leaderboardPoster, partyPoster, tickerPoster, tradePoster, weekPoster } from "@/lib/posters";

const ID = /^[A-Za-z0-9._%-]{1,80}$/;

export async function GET(req: Request, { params }: { params: Promise<{ locale: string; p: string[] }> }) {
  const { locale, p } = await params;
  const nf = () => new Response("Not found", { status: 404 });
  if (!isLocale(locale)) return nf();
  const [kind, id] = p;
  if (p.length === 1) {
    if (kind === "leaderboard") return leaderboardPoster(locale, new URL(req.url).searchParams.get("k") === "worst");
    if (kind === "party") return partyPoster(locale);
    if (kind === "week") return weekPoster(locale);
    return nf();
  }
  if (p.length === 3 && kind === "timeline" && ID.test(p[2])) return timelinePoster(locale, id, p[2]);
  if (p.length !== 2 || !ID.test(id)) return nf();
  if (kind === "member") return memberPoster(locale, id);
  if (kind === "trade") return tradePoster(locale, id);
  if (kind === "ticker") return tickerPoster(locale, id);
  if (kind === "investor") return investorPoster(locale, id);
  return nf();
}
