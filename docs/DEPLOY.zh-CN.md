# 部署与维护指南（中文）

网站由两部分组成，全部免费、无需自己管理服务器：

| 部分 | 放在哪里 | 做什么 |
| --- | --- | --- |
| 数据更新 | GitHub Actions（美国机房） | 每天北京时间早上 6:17 自动抓取新披露、行情和 13F，重新生成数据并提交到仓库 |
| 网站 | Vercel（服务器区域：美国华盛顿 `iad1`） | 仓库一有新提交就自动重新部署 |

代码已经推送到 `Mzzzzzz-c/us-officials-trades`，你只需要完成下面 3 步（约 15 分钟）。

---

## 第 1 步：给 GitHub 添加 SEC 联系邮箱（必做）

SEC 要求自动抓取时留联系邮箱。邮箱放在私密的 Secret 里，不会出现在公开代码或网站上。

1. 打开 https://github.com/Mzzzzzz-c/us-officials-trades/settings/secrets/actions
2. 点 **New repository secret**
3. **Name** 填：`SEC_USER_AGENT`
4. **Secret** 填：`us-officials-trades 你的邮箱`（例如 `us-officials-trades name@example.com`）
5. 点 **Add secret**

> 不填也能运行，但“知名投资人”和“行业分类”两部分会跳过更新。

## 第 2 步：在 Vercel 上线网站（必做）

1. 打开 https://vercel.com/signup ，选 **Continue with GitHub**，用你的 GitHub 账号登录（选 Hobby 免费套餐）。
2. 登录后点 **Add New… → Project**。
3. 在列表里找到 `us-officials-trades`，点 **Import**（如果看不到，点 “Adjust GitHub App Permissions” 授权这个仓库）。
4. 所有设置保持默认（Framework 会自动识别为 Next.js），直接点 **Deploy**。
5. 等 3–5 分钟，出现 “Congratulations” 即上线，Vercel 会给你一个 `xxx.vercel.app` 的网址。

服务器区域已在代码里的 `vercel.json` 设为美国（`iad1`），不需要手动选。

## 第 3 步：确认每日自动更新（建议）

1. 打开 https://github.com/Mzzzzzz-c/us-officials-trades/actions
2. 左侧点 **Update data**，右侧点 **Run workflow → Run workflow** 手动跑一次。
3. 第一次运行需要重新下载全部行情，约 30–60 分钟；之后每天几分钟。
4. 跑完后仓库会多一个 `data: daily update …` 的提交，Vercel 随即自动更新网站。

之后每天都会自动运行，不用管它。

---

## 重要：中国大陆访问

`*.vercel.app` 域名在中国大陆经常无法打开或很慢。如果主要读者在国内，建议：

1. 买一个自己的域名（如在 Cloudflare、Namecheap、阿里云国际站购买）。服务器在美国，**不需要 ICP 备案**。
2. Vercel 项目 → **Settings → Domains** → 添加域名，按提示在域名服务商处添加 DNS 记录。
3. 绑定后在 Vercel 项目 **Settings → Environment Variables** 添加 `NEXT_PUBLIC_SITE_URL` = `https://你的域名`，然后重新部署一次（用于分享链接和搜索引擎）。

## 可选设置

| Secret 名称 | 作用 | 是否需要 |
| --- | --- | --- |
| `SEC_USER_AGENT` | SEC 联系方式 | 必需 |
| `OPENFIGI_API_KEY` | 13F 的 CUSIP 转股票代码更快（在 openfigi.com 免费申请） | 可选 |
| `ALPHAVANTAGE_API_KEY` | 把行情源换成 Alpha Vantage（还要把 `config/settings.yaml` 里的 `price_provider` 改成 `alphavantage`；完整历史需付费套餐） | 可选 |

## 日常修改

所有配置都是纯文本，直接在 GitHub 网页上编辑并保存即可，第二天自动生效（或手动 Run workflow）：

| 想改什么 | 改哪个文件 |
| --- | --- |
| 增删知名投资人 | `config/investors.yaml`（在 SEC EDGAR 查到机构的 CIK 编号，照格式加一条） |
| 官员中文译名 | `config/names_zh.yaml`（格式：`BioGuide编号: "中文名"`；编号可在官员页网址里看到） |
| 行政官员中文名、党派 | `config/executive.yaml`（格式：`姓-名: {zh: "中文名", party: R}`；新官员有交易报告时会自动出现，这里只补充中文信息） |
| 总统报告里公司名匹配错误 | `config/oge_tickers.yaml`（格式：`"报告里的公司名": 股票代码`） |
| 公司中文名 | `config/tickers_zh.yaml`（格式：`股票代码: "中文名"`；没列的显示英文名） |
| 收录起始年份、收益窗口、行情源 | `config/settings.yaml` |
| 某位官员匹配错误 | 查看 `data/review.json` 里未匹配的申报人，在 `config/name_matches.yaml` 里手动指定 |
| 网站文字 | `lib/i18n.ts`（中英文案都在这里） |

## 费用与限制

- GitHub 公开仓库的 Actions 免费、不限时长。
- Vercel Hobby 免费套餐**仅限非商业用途**。本站免费、不收费，符合要求；如果以后要放广告或收费，需要升级 Pro（$20/月），并先咨询律师（见网站“方法与声明”页的 5 U.S.C. §13107 说明）。
- 数据来源都是免费公开渠道，偶尔某个来源临时不可用时，当天会跳过那部分，第二天自动补上。

## 出问题怎么办

- **Actions 显示红色失败**：点进去看是哪一步。最常见的是某个数据源临时限流，通常第二天自动恢复；持续失败可以把日志发给 Claude 帮你修。
- **网站没更新**：看 Vercel 项目的 **Deployments** 页是否有新部署；没有的话检查 GitHub 是否有新的 `data: daily update` 提交。
- **本地运行（可选）**：
  ```bash
  pip install -r pipeline/requirements.txt
  cd pipeline && SEC_USER_AGENT="名字 你的邮箱" python -m otrack all   # 抓取并生成数据
  cd .. && npm install && npm run dev                                    # 打开 http://localhost:3000
  ```
