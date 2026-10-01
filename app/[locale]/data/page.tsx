import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DataCenter from "@/components/client/DataCenter";
import { Container, PageHeader } from "@/components/layout";
import type { Enums } from "@/lib/datasets";
import { dict, isLocale } from "@/lib/i18n";

const TITLE = { zh: "数据下载", en: "Download data" };
const SUB = {
  zh: "全部官员交易、官员与股票统计、13F 持仓和回测结果，可整包下载，也可按条件筛选后导出为 CSV、Excel 或 JSON。",
  en: "Every officials' trade, the official and stock statistics, 13F holdings and backtests: download it all at once, or filter and export just what you need as CSV, Excel or JSON.",
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: TITLE[locale], description: SUB[locale] } : {};
}

/** Written by scripts/build-exports.mjs, which runs before every build. */
function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "exports", "index.json"), "utf8"));
  } catch {
    return { generated: "", asof: null, sets: {} };
  }
}

export default async function DataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  const enums: Enums = {
    types: t.types,
    owners: t.owners,
    party: t.party,
    chamber: t.chamber,
    acts: t.acts,
    chg: t.chg,
    sectors: t.sectors,
    lab: t.x.labRules,
    sig: { proven: t.x.sigProven, big: t.x.sigBig, cluster: t.x.sigCluster, ov: t.x.sigOv },
    yes: t.common.yes,
  };
  return (
    <div>
      <PageHeader title={TITLE[locale]} sub={SUB[locale]} />
      <Container className="pb-16">
        <DataCenter locale={locale} index={readIndex()} enums={enums} />
      </Container>
    </div>
  );
}
