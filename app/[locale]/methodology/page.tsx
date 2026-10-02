import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeta } from "@/lib/data";
import { dict, isLocale } from "@/lib/i18n";
import { REPO_URL } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dict(locale).nav.methodology } : {};
}

export default async function Methodology({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const meta = getMeta();
  const c = meta?.counts ?? {};
  return locale === "zh" ? <Zh meta={meta} c={c} /> : <En meta={meta} c={c} />;
}

type P = { meta: ReturnType<typeof getMeta>; c: Record<string, number> };

function Zh({ meta, c }: P) {
  return (
    <article className="prose-page mx-auto w-full max-w-[1100px] px-5 pt-12 sm:pt-16 max-w-3xl">
      <h1 className="headline">方法与声明</h1>
      <p className="mt-3 text-muted">
        本站免费、非商业，目的是让公众更容易读懂美国官员依法公开的财务披露。数据每天自动更新
        {meta ? `，当前收录 ${meta.start_year} 年以来 ${c.trades?.toLocaleString() ?? "—"} 笔交易、${c.members ?? "—"} 位官员、${c.investors ?? "—"} 位投资人` : ""}。
      </p>

      <h2>数据来源</h2>
      <ul>
        <li>
          众议院：书记官办公室的<a className="link" href="https://disclosures-clerk.house.gov/FinancialDisclosure">财务披露库</a>，逐份下载定期交易报告（PTR）PDF 并按版面解析。
        </li>
        <li>
          参议院：<a className="link" href="https://efdsearch.senate.gov/search/">eFD 电子披露系统</a>中的电子版 PTR 表格。
        </li>
        <li>
          行政部门（总统、副总统、内阁部长及其他经参议院确认的官员）：美国政府道德办公室（OGE）
          <a className="link" href="https://www.oge.gov/web/oge.nsf/Officials%20Individual%20Disclosures%20Search%20Collection?OpenForm">公开文件库</a>
          中可直接下载的 278-T 交易报告。电子版按文字解析；总统的报告是扫描件，用文字识别（OCR）读取，公司名通过 SEC 公司名单匹配股票代码，个别行可能读错或遗漏。只能书面申请的报告无法收录。行政官员的“公开日”是 OGE 发布日期，比本人提交日期晚，因此不计逾期。
        </li>
        <li>
          投资人：<a className="link" href="https://www.sec.gov/edgar/search/">SEC EDGAR</a> 的 13F-HR 季报；CUSIP 通过 OpenFIGI 转换为股票代码。
        </li>
        <li>
          官员资料与委员会：公共领域项目 <a className="link" href="https://github.com/unitedstates/congress-legislators">congress-legislators</a>；行业分类来自 SEC 的 SIC 代码。
        </li>
        <li>行情：每日开高低收（默认免费来源，可切换为 Alpha Vantage）。</li>
      </ul>
      <p>
        手写或扫描的纸质申报暂未自动解析，列在<Link className="link" href="/zh/unparsed">未解析的申报</Link>中，可点开原件查看。
      </p>

      <h2>价格与股数怎么推测</h2>
      <p>披露只给出交易日期和金额档位（例如 1,001–15,000 美元），不给价格和股数。本站用交易当天的行情推测：</p>
      <ul>
        <li>
          推测成交价 = 当天典型价 <span className="formula">(最高 + 最低 + 收盘) / 3</span>，并给出当天的最低–最高价区间。
        </li>
        <li>
          股数区间：最少 <span className="formula">金额下限 / 当天最高价</span>，最多 <span className="formula">金额上限 / 当天最低价</span>；点估计 <span className="formula">金额中值 / 典型价</span>。
        </li>
        <li>价格是当天实际交易的价格：如果之后发生过拆股，会先还原。“超过 X 美元”这类没有上限的档位只给股数下限。</li>
        <li>如果申报人在说明里写明了成交价（例如“25 股 @ $209.40”），直接使用，置信度标为“申报价”；只写明股数（例如“买入 10,000 股”）时，直接采用该股数。</li>
        <li>
          置信度：<b>高</b> = 普通股、日期有效、当天振幅小于 2%；<b>中</b> = 振幅 2%–8% 或资产类型不是普通股；<b>低</b> = 日期不是交易日或振幅超过 8%。期权、债券、共同基金和没有股票代码的资产不估算。
        </li>
      </ul>

      <h2>操作步骤怎么还原</h2>
      <p>同一官员对同一只股票的交易按日期串起来，按账户（持有人本人、配偶、联名、子女，以及众议院申报中写明的子账户）分别累计估算股数，再合并显示：</p>
      <ul>
        <li>持仓为零时买入 = <b>建仓</b>；已有持仓时买入 = <b>加仓</b>；部分卖出 = <b>减仓</b>；全部卖出且合计归零 = <b>清仓</b>；参议院未区分全部/部分的“卖出”记为<b>卖出</b>。</li>
        <li>持仓以今日股本口径的股数区间表示。本站看不到数据起点之前的持仓，所以第一笔买入可能是加仓；卖出超过已知买入时会标注“卖出前的持仓早于本站数据”。</li>
      </ul>

      <h2>收益怎么算</h2>
      <ul>
        <li><b>官员口径</b>：从交易日的推测价算起。</li>
        <li><b>跟单口径</b>：从申报公开后下一个交易日的开盘价算起——这是普通人最早能跟上的价格。两者之差就是信息滞后的代价。</li>
        <li>固定持有期 30 / 90 / 180 / 365 天，满期后数值固定不变；“至今”按最新收盘价实时计算。</li>
        <li>所有收益都和同期标普500 ETF（SPY）对比；为价格收益，不含股息。</li>
      </ul>

      <h2>知名投资人（13F）的局限</h2>
      <ul>
        <li>13F 是季度末快照，季度结束后最多 45 天才公开；季度初的买入最晚要约 4 个半月后才能看到。</li>
        <li>只含美国上市的多头仓位，不含空头、现金、多数债券和非美国上市股票；个人名下账户不需申报。</li>
        <li>部分“人—机构”对应关系是市场推断（例如 H&amp;H International Investment 被普遍认为由段永平管理），页面上标注“推断”。</li>
        <li>估算成本 = 该季度内每日典型价的平均值，区间为季度最低价至最高价。</li>
      </ul>

      <h2>数据洞察怎么算</h2>
      <ul>
        <li>跟单回测：把每一笔股票买入，在报告公开后第一个交易日的开盘价买入、持有 90 天；所有持仓等权重，每日按平均收益复利计算，与同期标普 500 ETF（SPY）比较。“官员自己的时点”用同样方法，但从估算的成交价开始。只用股价收益，不含股息、手续费和税。</li>
        <li>官员排行：至少 20 笔可评估买入的官员，按跟单者 90 天平均超额收益排序；样本少的官员波动很大，仅供参考。</li>
        <li>集中买入：近 12 个月内，30 天窗口里有 3 位以上官员买入同一只股票。</li>
        <li>职权相关交易：按公司的 SEC 行业代码（SIC），对照议员现任委员会（如军事委员会—国防、金融服务委员会—金融）或官员所在部门的管辖范围。委员会任职按现任计算，过去的交易可能发生在不同任职期间；标记只提示值得关注，不代表违规。</li>
        <li>资金流向：按每笔交易金额档位的中值估算。</li>
        <li>策略实验室：同一套回测换不同的跟单规则（持有期、金额、群体、信号）。“过往表现好的官员”和“集中买入”只用该笔买入公开当天已知的信息判断：官员此前已有 10 笔以上满 90 天的买入、平均跑赢标普 500 且胜率过半；或 30 天内已有 3 位以上官员公开买入同一只股票。不足一年的组合只显示累计收益，不做年化。</li>
        <li>最新值得关注：近 45 天公开的股票买入中，属于上述信号、或金额 25 万美元以上的交易；每位官员每类最多列 2 笔。</li>
        <li>交易风格：单笔金额按档位中值取中位数；持有时间是从建仓到清仓的完整周期取中位数。</li>
        <li>改名的股票代码（如 FB→META、SQ→XYZ）统一按现在的代码计算，以便取得完整行情。申报日期早于交易日期的明显笔误不参与估算，表格中以 * 标出。</li>
        <li>公司内部人交易：来自 SEC Form 4（季度打包数据集加各公司最新申报）。只保留非衍生证券的公开市场买入（代码 P）和卖出（代码 S），不含股权激励、期权行权、赠与和缴税扣股；标注“预设计划”的是按 10b5-1 计划执行的交易。以申报文件写明的发行人为准，公司作为别家公司大股东的申报不计入。新申报按公司轮流补充，交易多的公司优先。内部人页面按 SEC 给每位申报人的编号归并同一个人在不同公司的交易，姓名按申报写法显示。个别申报把总金额填进了“每股价格”一栏：成交价超过同公司其他交易 20 倍时，若按总金额换算后价格合理就改用换算值，否则剔除该笔。</li>
        <li>财报日：取自公司向 SEC 提交的 8-K 文件中 2.02 项（经营业绩）的申报日期。“财报前 30 天内的交易占比”与随机水平（30 天 × 财报次数 ÷ 总天数）对比，只说明时间上的集中程度，不代表利用了未公开信息。</li>
        <li>政策事件：走势图上的政策标记是人工整理的少量重大联邦法案与政策日期，按受影响行业显示。</li>
        <li>委员会页面：成员按现任委员会名单；“监管相关”即上面的职权相关标记。每周回顾按申报公开日统计，周一至周日。</li>
      </ul>

      <h2>照片、标志与实时股价</h2>
      <p>
        国会议员照片来自国会官方照片（由 unitedstates/images 项目整理，属公共领域）；行政官员与知名投资人的照片来自维基百科/维基共享资源（各人页面底部附原图链接，可查看作者与授权），个别来自所在部门官网的官方照片。公司标志来自 Parqet 与 Financial Modeling Prep。实时股价（含盘前盘后）和走势图来自 CNBC 的公开行情，Yahoo Finance 作为备用，盘中约每 30 秒刷新；页面上的历史收益与回测使用每日收盘数据（来自 Yahoo Finance）。
      </p>

      <h2>申报延迟</h2>
      <p>《STOCK法案》要求在知悉交易后 30 天内、最迟交易后 45 天内申报。本站把交易日到公开日超过 45 天的记为逾期（部分延迟可能来自知悉日期较晚，属正常情况）。</p>

      <h2>法律声明</h2>
      <p>
        根据 <a className="link" href="https://www.law.cornell.edu/uscode/text/5/13107">5 U.S.C. §13107</a>
        ，官员财务披露报告不得用于除新闻与传播媒体向公众传播以外的商业目的、个人信用评级或募款。本站免费向公众提供信息，不收费、不出售数据。
      </p>
      <p>
        本站不构成投资建议，也不对任何官员的行为作出判断。数据可能存在错误或遗漏；推测值仅为估算；历史表现不代表未来。发现错误请到{" "}
        <a className="link" href={`${REPO_URL}/issues`}>GitHub</a> 反馈，我们会核对原始文件后更正。
      </p>
    </article>
  );
}

function En({ meta, c }: P) {
  return (
    <article className="prose-page mx-auto w-full max-w-[1100px] px-5 pt-12 sm:pt-16 max-w-3xl">
      <h1 className="headline">Methodology &amp; notices</h1>
      <p className="mt-3 text-muted">
        A free, non-commercial site that makes officials&apos; legally required financial disclosures easier to read. Data refreshes daily
        {meta ? `; it currently covers ${c.trades?.toLocaleString() ?? "—"} trades by ${c.members ?? "—"} officials since ${meta.start_year}, plus ${c.investors ?? "—"} investors` : ""}.
      </p>

      <h2>Sources</h2>
      <ul>
        <li>
          House: the Clerk&apos;s <a className="link" href="https://disclosures-clerk.house.gov/FinancialDisclosure">financial disclosure database</a>; every Periodic Transaction Report (PTR) PDF is downloaded and parsed by layout.
        </li>
        <li>
          Senate: electronic PTR tables from the <a className="link" href="https://efdsearch.senate.gov/search/">eFD system</a>.
        </li>
        <li>
          Executive branch (the President, Vice President, Cabinet and other Senate-confirmed officials): every 278-T periodic transaction report that the Office of Government Ethics posts for download in its
          {" "}<a className="link" href="https://www.oge.gov/web/oge.nsf/Officials%20Individual%20Disclosures%20Search%20Collection?OpenForm">public collection</a>.
          Electronic reports are read as text; the President&apos;s reports are scans read with OCR, company names are matched to tickers with SEC&apos;s company list, and a few lines may be misread or missed. Reports available only on request cannot be included. For these officials the public date is when OGE posted the report, later than the filing date, so lateness is not scored.
        </li>
        <li>
          Investors: Form 13F-HR from <a className="link" href="https://www.sec.gov/edgar/search/">SEC EDGAR</a>; CUSIPs are mapped to tickers with OpenFIGI.
        </li>
        <li>
          Officials and committees: the public-domain <a className="link" href="https://github.com/unitedstates/congress-legislators">congress-legislators</a> project; sectors from SEC SIC codes.
        </li>
        <li>Market data: daily open/high/low/close (a free source by default; Alpha Vantage optional).</li>
      </ul>
      <p>
        Handwritten or scanned paper filings are not parsed yet; they are listed under <Link className="link" href="/en/unparsed">unparsed filings</Link> with links to the originals.
      </p>

      <h2>Estimated price and shares</h2>
      <p>Filings give only the trade date and an amount band (e.g. $1,001–$15,000). We estimate from that day&apos;s market data:</p>
      <ul>
        <li>
          Estimated price = the day&apos;s typical price <span className="formula">(High + Low + Close) / 3</span>, shown with the day&apos;s low–high range.
        </li>
        <li>
          Share range: at least <span className="formula">amount min / High</span>, at most <span className="formula">amount max / Low</span>; point estimate <span className="formula">amount midpoint / typical price</span>.
        </li>
        <li>Prices are what actually traded that day: later splits are undone first. Open-ended bands (&ldquo;over $X&rdquo;) give only a minimum.</li>
        <li>When the filer wrote the execution price in the description (e.g. &ldquo;25 shares @ $209.40&rdquo;), that price is used and marked &ldquo;Reported&rdquo;; when only the share count is stated (e.g. &ldquo;Purchased 10,000 shares&rdquo;), that count is used.</li>
        <li>
          Confidence: <b>High</b> = common stock, valid date, day&apos;s range under 2%; <b>Medium</b> = range 2%–8% or not common stock; <b>Low</b> = not a market day or range above 8%. Options, bonds, mutual funds and assets without a ticker are not estimated.
        </li>
      </ul>

      <h2>Reconstructed steps</h2>
      <p>Each official&apos;s trades in one stock are chained by date, tracked per account (self, spouse, joint, child, plus any sub-account named in House filings) and shown combined:</p>
      <ul>
        <li>Buy from zero = <b>Open</b>; buy with a position = <b>Add</b>; partial sale = <b>Trim</b>; full sale bringing the total to zero = <b>Close</b>; Senate &ldquo;Sale&rdquo; without full/partial = <b>Sell</b>.</li>
        <li>Holdings are share ranges in today&apos;s share basis. We cannot see holdings from before our data starts, so the first buy may be an add; sales larger than the buys we saw are flagged.</li>
      </ul>

      <h2>Returns</h2>
      <ul>
        <li><b>Official</b>: from the estimated trade-day price.</li>
        <li><b>Copier</b>: from the opening price on the first trading day after the filing became public - the earliest price an outsider could get. The gap is the cost of the delay.</li>
        <li>Fixed windows of 30 / 90 / 180 / 365 days are frozen once elapsed; &ldquo;to date&rdquo; uses the latest close.</li>
        <li>Every return is shown next to the S&amp;P 500 ETF (SPY) over the same window; price returns, dividends excluded.</li>
      </ul>

      <h2>Limits of 13F data</h2>
      <ul>
        <li>A 13F is a quarter-end snapshot published up to 45 days later; a buy early in a quarter can surface about four and a half months later.</li>
        <li>Only US-listed long positions: no shorts, cash, most bonds or foreign listings; accounts in an individual&apos;s own name are not reported.</li>
        <li>Some person-to-fund links are market inferences (e.g. H&amp;H International Investment is widely believed to be managed by Duan Yongping) and are labelled &ldquo;Inferred&rdquo;.</li>
        <li>Estimated cost = the average daily typical price during the quarter; the range is the quarter&apos;s low to high.</li>
      </ul>

      <h2>How the insights are computed</h2>
      <ul>
        <li>Copy-trade backtest: every stock buy is bought at the open of the first trading day after the report became public and held 90 days; open positions are equal-weighted and the daily average return is compounded, against the S&amp;P 500 ETF (SPY) over the same days. &ldquo;At the officials&apos; own timing&rdquo; is the same, starting from the estimated trade price. Price returns only: no dividends, fees or taxes.</li>
        <li>Leaderboard: officials with at least 20 scorable buys, ranked by a copier&apos;s average 90-day excess return; small samples are noisy.</li>
        <li>Cluster buys: three or more officials buying the same stock within a 30-day window in the last 12 months.</li>
        <li>Oversight flags: the company&apos;s SEC industry code (SIC) against the remit of the member&apos;s current committees (e.g. Armed Services and defense, Financial Services and finance) or the official&apos;s department. Committee seats are current ones, so older trades may date from other assignments; a flag invites a closer look and is not an accusation.</li>
        <li>Money flows: estimated from the midpoint of each amount band.</li>
        <li>Strategy lab: the same backtest under different copy rules (holding period, size, group, signal). &ldquo;Good copy record&rdquo; and &ldquo;cluster buys&rdquo; use only what was known the day the buy went public: the official already had 10+ buys with a finished 90-day result that beat the S&amp;P 500 on average and won more than half the time; or 3+ officials had publicly bought the same stock within 30 days. Portfolios with under a year of history show cumulative returns, not annualised ones.</li>
        <li>Worth a look now: stock buys made public in the last 45 days that match those signals or exceed $250,000; at most two per official in each list.</li>
        <li>Trading style: median trade size from band midpoints; holding period is the median length of complete open-to-close round trips.</li>
        <li>Renamed tickers (FB to META, SQ to XYZ, …) are tracked under today&apos;s symbol so the full price history is available. Trade dates that come after their own filing date are typos; they are left out of estimates and marked with * in tables.</li>
        <li>Company insiders: from SEC Form 4 (the quarterly data sets plus each company's newest filings). Only open-market purchases (code P) and sales (code S) of non-derivative securities are kept: no grants, option exercises, gifts or tax withholding. "Plan" marks trades made under a 10b5-1 plan. The issuer is taken from the filing itself, so a company's filings as a large holder of other companies are not counted as its own. New filings are added company by company, busiest first. Insider pages group one person's trades across companies by the number the SEC gives each filer; names are shown as filed. A few filings carry the total proceeds in the price-per-share box: a price more than 20 times the company's other trades is read as the total when that gives a sensible price, and the row is left out otherwise.</li>
        <li>Earnings dates: the filing dates of the company's 8-Ks with item 2.02 (results of operations). The share of trades in the 30 days before a release is set against chance (30 days x releases / total days); it shows clustering in time, not use of non-public information.</li>
        <li>Policy events: the policy marks on charts are a short hand-kept list of major federal laws and actions, shown for the sectors they affected.</li>
        <li>Committee pages use current committee rosters; "within remit" is the oversight flag described above. The weekly review counts by the day a filing became public, Monday to Sunday.</li>
      </ul>

      <h2>Photos, logos and live prices</h2>
      <p>
        Congressional portraits are the official public-domain photos collected by the unitedstates/images project; executive officials&apos; and investors&apos; photos come from Wikipedia / Wikimedia Commons (each page links the original file with its author and licence), a few from official agency portraits. Logos come from Parqet and Financial Modeling Prep. Live prices (including pre- and after-market) and charts come from CNBC&apos;s public quotes with Yahoo Finance as a fallback, refreshing about every 30 seconds; historical returns and backtests use daily closes (from Yahoo Finance).
      </p>

      <h2>Filing delay</h2>
      <p>The STOCK Act requires a report within 30 days of learning of a trade and no later than 45 days after it. Trades made public more than 45 days after the trade date are marked late (some delays reflect a late notification and are legitimate).</p>

      <h2>Legal notice</h2>
      <p>
        Under <a className="link" href="https://www.law.cornell.edu/uscode/text/5/13107">5 U.S.C. §13107</a>, officials&apos; financial disclosure reports may not be used for any commercial purpose other than by news and communications media for dissemination to the general public, for credit ratings, or for soliciting money. This site is free, charges nothing and sells no data.
      </p>
      <p>
        Nothing here is investment advice or a judgement about any official. Data may contain errors or omissions; estimates are estimates; past performance does not predict future results. Report errors on{" "}
        <a className="link" href={`${REPO_URL}/issues`}>GitHub</a> and we will check the original filing and correct it.
      </p>
    </article>
  );
}
