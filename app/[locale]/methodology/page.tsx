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
    <article className="prose-page max-w-3xl">
      <h1 className="text-2xl font-semibold">方法与声明</h1>
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
    <article className="prose-page max-w-3xl">
      <h1 className="text-2xl font-semibold">Methodology &amp; notices</h1>
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
