import "server-only";
import { getMedia, getTickers, memberMap, type MemberRow, type TickerRow } from "./data";
import { dict, type Locale } from "./i18n";
import { roleLabel, stateName } from "./labels";

export interface PersonLite {
  id: string;
  name: string;
  en: string;
  party?: string;
  has?: boolean;
  role: string;
  chamber?: "H" | "S" | "E";
}

export function roleShort(m: MemberRow | undefined, locale: Locale): string {
  if (!m) return "";
  const t = dict(locale);
  if (m.chamber === "E") return roleLabel(m, locale);
  return `${t.chamber[m.chamber]} · ${locale === "zh" ? stateName(m.state, locale) : m.state}`;
}

export function person(id: string, locale: Locale): PersonLite {
  const m = memberMap().get(id);
  const media = getMedia();
  return {
    id,
    name: m ? (locale === "zh" && m.zh ? m.zh : m.name) : id,
    en: m?.name ?? id,
    party: m?.party,
    has: !!media.people[id],
    role: roleShort(m, locale),
    chamber: m?.chamber,
  };
}

let tickIndex: Map<string, TickerRow> | null = null;
export function tickerRow(sym: string): TickerRow | undefined {
  if (!tickIndex) tickIndex = new Map(getTickers().map((t) => [t.sym, t]));
  return tickIndex.get(sym);
}

export function stock(sym: string, locale: Locale): { sym: string; name: string; kind?: 1 | 2 | 3; sec?: string } {
  const r = tickerRow(sym);
  const media = getMedia();
  return { sym, name: r ? (locale === "zh" && r.zh ? r.zh : r.name) : sym, kind: media.logos[sym], sec: r?.sec };
}
