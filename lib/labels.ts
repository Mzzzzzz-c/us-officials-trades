import type { Locale } from "./i18n";

// Full committees (congress-legislators thomas_id) -> Chinese name. English comes from the data.
const COMMITTEES_ZH: Record<string, string> = {
  HSAG: "众议院农业委员会",
  HSAP: "众议院拨款委员会",
  HSAS: "众议院军事委员会",
  HSBU: "众议院预算委员会",
  HSED: "众议院教育与劳动力委员会",
  HSIF: "众议院能源和商务委员会",
  HSSO: "众议院道德委员会",
  HSBA: "众议院金融服务委员会",
  HSFA: "众议院外交事务委员会",
  HSHM: "众议院国土安全委员会",
  HSHA: "众议院行政管理委员会",
  HSJU: "众议院司法委员会",
  HSII: "众议院自然资源委员会",
  HSGO: "众议院监督与政府改革委员会",
  HSRU: "众议院规则委员会",
  HSSY: "众议院科学、太空和技术委员会",
  HSSM: "众议院小企业委员会",
  HSPW: "众议院交通与基础设施委员会",
  HSVR: "众议院退伍军人事务委员会",
  HSWM: "众议院筹款委员会",
  HLIG: "众议院常设情报特别委员会",
  HSZS: "众议院美中战略竞争特别委员会",
  SSAF: "参议院农业、营养和林业委员会",
  SSAP: "参议院拨款委员会",
  SSAS: "参议院军事委员会",
  SSBK: "参议院银行、住房和城市事务委员会",
  SSBU: "参议院预算委员会",
  SSCM: "参议院商务、科学和交通委员会",
  SSEG: "参议院能源和自然资源委员会",
  SSEV: "参议院环境和公共工程委员会",
  SSFI: "参议院财政委员会",
  SSFR: "参议院外交关系委员会",
  SSHR: "参议院卫生、教育、劳工和养老金委员会",
  SSGA: "参议院国土安全和政府事务委员会",
  SSJU: "参议院司法委员会",
  SSRA: "参议院规则和行政委员会",
  SSSB: "参议院小企业和创业委员会",
  SSVA: "参议院退伍军人事务委员会",
  SLIN: "参议院情报特别委员会",
  SPAG: "参议院老龄问题特别委员会",
  SLIA: "参议院印第安事务委员会",
  SLET: "参议院道德特别委员会",
  SCNC: "参议院国际毒品管制核心小组",
  JSEC: "国会联合经济委员会",
  JSLC: "国会图书馆联合委员会",
  JSPR: "国会印刷联合委员会",
  JSTX: "国会联合税务委员会",
};

export function committeeName(id: string, en: string, locale: Locale): string {
  return locale === "zh" ? COMMITTEES_ZH[id] ?? en : en;
}

const STATES: Record<string, [string, string]> = {
  AL: ["阿拉巴马州", "Alabama"], AK: ["阿拉斯加州", "Alaska"], AZ: ["亚利桑那州", "Arizona"], AR: ["阿肯色州", "Arkansas"],
  CA: ["加利福尼亚州", "California"], CO: ["科罗拉多州", "Colorado"], CT: ["康涅狄格州", "Connecticut"], DE: ["特拉华州", "Delaware"],
  FL: ["佛罗里达州", "Florida"], GA: ["佐治亚州", "Georgia"], HI: ["夏威夷州", "Hawaii"], ID: ["爱达荷州", "Idaho"],
  IL: ["伊利诺伊州", "Illinois"], IN: ["印第安纳州", "Indiana"], IA: ["艾奥瓦州", "Iowa"], KS: ["堪萨斯州", "Kansas"],
  KY: ["肯塔基州", "Kentucky"], LA: ["路易斯安那州", "Louisiana"], ME: ["缅因州", "Maine"], MD: ["马里兰州", "Maryland"],
  MA: ["马萨诸塞州", "Massachusetts"], MI: ["密歇根州", "Michigan"], MN: ["明尼苏达州", "Minnesota"], MS: ["密西西比州", "Mississippi"],
  MO: ["密苏里州", "Missouri"], MT: ["蒙大拿州", "Montana"], NE: ["内布拉斯加州", "Nebraska"], NV: ["内华达州", "Nevada"],
  NH: ["新罕布什尔州", "New Hampshire"], NJ: ["新泽西州", "New Jersey"], NM: ["新墨西哥州", "New Mexico"], NY: ["纽约州", "New York"],
  NC: ["北卡罗来纳州", "North Carolina"], ND: ["北达科他州", "North Dakota"], OH: ["俄亥俄州", "Ohio"], OK: ["俄克拉何马州", "Oklahoma"],
  OR: ["俄勒冈州", "Oregon"], PA: ["宾夕法尼亚州", "Pennsylvania"], RI: ["罗得岛州", "Rhode Island"], SC: ["南卡罗来纳州", "South Carolina"],
  SD: ["南达科他州", "South Dakota"], TN: ["田纳西州", "Tennessee"], TX: ["得克萨斯州", "Texas"], UT: ["犹他州", "Utah"],
  VT: ["佛蒙特州", "Vermont"], VA: ["弗吉尼亚州", "Virginia"], WA: ["华盛顿州", "Washington"], WV: ["西弗吉尼亚州", "West Virginia"],
  WI: ["威斯康星州", "Wisconsin"], WY: ["怀俄明州", "Wyoming"], DC: ["哥伦比亚特区", "District of Columbia"],
  PR: ["波多黎各", "Puerto Rico"], GU: ["关岛", "Guam"], VI: ["美属维尔京群岛", "U.S. Virgin Islands"],
  AS: ["美属萨摩亚", "American Samoa"], MP: ["北马里亚纳群岛", "Northern Mariana Islands"],
};

export function stateName(code: string | undefined, locale: Locale): string {
  if (!code) return "";
  const s = STATES[code];
  return s ? (locale === "zh" ? s[0] : s[1]) : code;
}

const TITLES_ZH: Record<string, string> = {
  Chair: "主席",
  Chairman: "主席",
  Chairwoman: "主席",
  Cochairman: "联合主席",
  "Co-Chair": "联合主席",
  "Vice Chair": "副主席",
  "Vice Chairman": "副主席",
  "Ranking Member": "首席少数党成员",
  "Ex Officio": "当然成员",
};

export function committeeTitle(title: string, locale: Locale): string {
  return locale === "zh" ? TITLES_ZH[title] ?? title : title;
}

/** "财政部 部长" / "Secretary, Department of The Treasury" */
export function roleLabel(m: { title?: string; agency?: string; title_zh?: string; agency_zh?: string }, locale: Locale): string {
  if (locale === "zh") {
    const title = m.title_zh ?? m.title ?? "";
    const agency = m.agency_zh ?? m.agency ?? "";
    // titles that already name their agency ("联邦航空管理局局长") stand alone
    if (m.title_zh && /局|署|中心|总监|总统/.test(m.title_zh) && m.title?.includes(",")) return m.title_zh;
    if (m.title === "President" || m.title === "Vice President") return title;
    return `${agency} ${title}`.trim();
  }
  if (m.title === "President" || m.title === "Vice President") return m.title === "President" ? "President of the United States" : "Vice President of the United States";
  return [m.title, m.agency].filter(Boolean).join(", ");
}
