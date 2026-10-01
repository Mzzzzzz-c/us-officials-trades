// GET /zh/poster/member/P000197 -> a 1080x1440 PNG poster for sharing
import { isLocale } from "@/lib/i18n";
import { memberPoster } from "@/lib/poster";

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[A-Za-z0-9_-]{1,60}$/.test(id)) return new Response("Not found", { status: 404 });
  return memberPoster(locale, id);
}
