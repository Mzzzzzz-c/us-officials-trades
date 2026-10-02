// Policy events drawn on stock charts: a short, hand-kept list of dated federal actions that moved
// whole sectors. `sectors: null` means every stock. Add to it as things happen.
import type { Locale } from "./i18n";

export interface PolicyEvent {
  d: string;
  zh: string;
  en: string;
  sectors: string[] | null;
}

export const POLICY_EVENTS: PolicyEvent[] = [
  { d: "2020-03-27", zh: "《CARES 法案》签署（2.2 万亿美元疫情救助）", en: "CARES Act signed ($2.2tn pandemic relief)", sectors: null },
  { d: "2021-03-11", zh: "《美国救援计划》签署（1.9 万亿美元）", en: "American Rescue Plan signed ($1.9tn)", sectors: null },
  { d: "2021-11-15", zh: "《基础设施投资和就业法案》签署", en: "Infrastructure Investment and Jobs Act signed", sectors: ["ind", "mat", "util", "energy"] },
  { d: "2022-08-09", zh: "《芯片与科学法案》签署", en: "CHIPS and Science Act signed", sectors: ["tech"] },
  { d: "2022-08-16", zh: "《通胀削减法案》签署", en: "Inflation Reduction Act signed", sectors: ["energy", "util", "health", "disc"] },
  { d: "2023-03-10", zh: "硅谷银行倒闭", en: "Silicon Valley Bank fails", sectors: ["fin"] },
  { d: "2023-06-03", zh: "《财政责任法案》签署（债务上限）", en: "Fiscal Responsibility Act signed (debt ceiling)", sectors: null },
  { d: "2024-04-24", zh: "对外援助法案签署（含 TikTok 剥离条款）", en: "Foreign-aid package signed (with TikTok divestiture)", sectors: ["ind", "comm", "tech"] },
  { d: "2025-04-02", zh: "“对等关税”宣布", en: "\"Reciprocal\" tariffs announced", sectors: null },
  { d: "2025-04-09", zh: "对等关税暂缓 90 天", en: "90-day pause on reciprocal tariffs", sectors: null },
  { d: "2025-07-04", zh: "《大而美法案》签署", en: "One Big Beautiful Bill Act signed", sectors: null },
  { d: "2025-07-18", zh: "《GENIUS 法案》签署（稳定币）", en: "GENIUS Act signed (stablecoins)", sectors: ["fin"] },
];

export function policyEventsFor(sector: string | undefined, locale: Locale): { d: string; label: string }[] {
  return POLICY_EVENTS.filter((e) => !e.sectors || (sector != null && e.sectors.includes(sector))).map((e) => ({ d: e.d, label: locale === "zh" ? e.zh : e.en }));
}
