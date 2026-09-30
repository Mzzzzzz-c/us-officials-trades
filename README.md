# 美国官员交易追踪 · US Officials Trade Tracker

中英双语网站：汇总美国国会议员依《STOCK 法案》披露的每一笔证券交易，推测成交价与股数，还原每位官员在每只股票上的建仓→加仓→减仓→清仓步骤，并对比“官员”与“跟单者”（披露公开后才买入）的收益；另收录知名投资人的 SEC 13F 季度持仓。数据每天自动更新。

A bilingual (Chinese / English) site that collects every securities trade disclosed by members of the US Congress, estimates the traded price and share count, reconstructs each official's open → add → trim → close steps per stock, compares the official's return with a copier who could only act after the filing went public, and tracks famous investors' SEC 13F holdings. Updated daily.

**部署步骤见 [docs/DEPLOY.zh-CN.md](docs/DEPLOY.zh-CN.md)。**

## How it works

```
GitHub Actions (daily, US)                         Vercel (region iad1, US)
┌──────────────────────────────────────────┐      ┌──────────────────────────┐
│ pipeline/  (Python)                      │      │ Next.js app (repo root)  │
│  house.py    House PTR PDFs → rows       │      │  /zh  /en                │
│  senate.py   Senate eFD tables → rows    │ git  │  reads data/site/*.json  │
│  sec13f.py   SEC 13F holdings            │ ───▶ │  rebuilt on every push   │
│  prices.py   daily OHLC (Yahoo / AV)     │      └──────────────────────────┘
│  estimate / positions / performance      │
│  build.py  → data/site/*.json            │
└──────────────────────────────────────────┘
```

| Path | What |
| --- | --- |
| `pipeline/otrack/` | Fetchers, parsers and analytics (`python -m otrack all`) |
| `pipeline/tests/` | Parser and analytics tests (`python -m pytest pipeline/tests`) |
| `config/` | Settings, tracked investors, Chinese names, manual name matches |
| `data/raw/` | Parsed filings, one JSON per filing (committed, so history is kept) |
| `data/ref/` | Small reference data: legislators, CUSIP→ticker, company sectors |
| `data/site/` | Everything the website reads (regenerated daily) |
| `data/cache/` | Prices and PDFs (not committed; kept in the Actions cache) |
| `app/`, `components/`, `lib/` | The Next.js website |

## Method in one paragraph

Filings give a trade date and an amount band. The estimated price is that day's typical price (High+Low+Close)/3 with the day's low–high range; shares range from `min / High` to `max / Low`. Later splits are undone so the price is what actually traded. If the filer wrote an exact price, it is used. Returns are measured from the official's estimated price and from the next open after the filing became public, always next to SPY over the same window. Full details are on the site's Methodology page.

## Local development

```bash
pip install -r pipeline/requirements.txt
cd pipeline && SEC_USER_AGENT="your-name you@example.com" python -m otrack all   # first run takes a while
cd .. && npm install && npm run dev
```

## Data sources and notices

Clerk of the House (financial disclosures), Senate Office of Public Records (eFD), SEC EDGAR, the public-domain [congress-legislators](https://github.com/unitedstates/congress-legislators) project, OpenFIGI, and daily market data. Under 5 U.S.C. §13107, officials' financial disclosure reports may not be used for commercial purposes other than by news and communications media for dissemination to the general public. This project is free and non-commercial. Nothing here is investment advice.
