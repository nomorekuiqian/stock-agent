> 历史交接验收记录。2026-10-18 新版实施计划的当前结果见 [plan_implementation_status.md](plan_implementation_status.md)；下文旧口径不代表当前实现。

# SEO v2 执行与验收记录

日期：2026-10-18。范围：本次交接的 P0/P1 本地实现、内容准备和统一验收。尚未提交、推送或部署；不把本地可抓取等同于线上收录、排名或 IndexNow 已被生产端接受。

## 条目落实

| 交接条目 | 实现与边界 |
|---|---|
| P0-1 技术修复 | 无效股票 HTTP 404/noindex，源故障 503；未知根路径真实 404；小写代码 308；BRK.B canonical 保留点号；公开 KOL、llms.txt、KOL sitemap。修复 PageShell 加载占位重复输出正文的根因，HTML 只保留一份正文/H1。 |
| P0-1 股息 | 删除前端二次乘 100。扫描全部 3,914 条缓存股票记录；每次现有 screener 刷新对 >25% 记录告警。四只基准股与 Yahoo 原始小数独立对照一致。 |
| P0-1 推特日期页 | 采用方案 B：日期页 noindex,follow，移除日期 sitemap shard；hub/归档保持可访问和索引。 |
| P0-1 公开摘要 | 早报期货与全球市场首段公开，最多 600 字；真实最新早报公开 351 字。个股已有 AI 缓存只公开首段、最多 250 字。付费全文接口鉴权不变，缺失缓存不临时生成。早报锁定段落使用 paywall schema，公开行情和摘要不在付费 selector 内。 |
| P0-2 个股模板 | 中文标题、H1、别名、数据直接答案、公司/涨跌事件/KOL/财报/分析师/FAQ 模块、同行中文内链、最近日报和相关博主、Corporation/WebPage/Breadcrumb/FAQ。无数据整句/模块隐藏；0 报价不当成行情。原完整交互工作台保留在 `?view=workspace`，noindex。 |
| P0-3 70 只样本 | 70/70 公司简介入本地版本化 SQLite，均为 150–300 字，记录来源/hash/时间。7/70 做来源对照抽检并修正 BRK.B 的成立年份、QBTS 的总部及 META/UNH 的业务表述。页面请求不会调用 LLM。 |
| P0-3 内容门禁 | 对 70 样本＋57 对照共 127 只计算实际正文字符比例。分母与真实 HTML 对照一致；重复 FAQ 不重复计入独特内容。当前 15 只达到 >=40%，进入 sitemap；其余 112 只保持 noindex。27 只新增候选也必须经过门禁，不能仅凭名单进入索引。lastmod 按持久化内容指纹变更。 |
| P0-4 KOL | 两位博主公开人物页和 hub，真实最近 30 天时间线、原帖、个股排行、头像、框架、FAQ、ProfilePage/Person/Breadcrumb。人物页静态框架本身 >=800 中文字。每小时读取缓存更新；不恢复 studio APIs 或专用暂停任务。 |
| P0-5 日报/早报 | 固定目标 title/H1、首屏答案、WebPage + Article、最近 7 篇入口及 archive。日期页 self-canonical；早报日期页补 H1。 |
| P1-1 交易时间 | NYSE 官网导入 2026–2028 休市与半日市数据；八时区夏/冬令时间表、实时开闭市状态，未知年份不猜测。含 2026-11-01 DST、周末、节日及半日市边界测试。 |
| P1-2 财报日历 | FMP 本周/下周数据、预期 EPS、盘前/盘后、个股财报锚点链接，每小时缓存；源未提供时段时明确标注。 |
| P1-3 财报子页 | 前 20 只、至少 8 季度、已有 AI 财报/指引 >=600 字才开放；其余在 middleware 返回真实 404，主页面保留原财报模块。当前合格子页为 0，没有为拆页编造分析。 |
| P1-4 AI 研究页 | 能力介绍、实际日报截图（注明历史日期）、Free/Pro $10/Max $20、与通用聊天工具的差异、FAQ、pricing 内链。 |
| P1-5 宏观 | 情绪、通胀利率、流动性三个页面的首屏数据服务端预取/hydrate，更新 title/H1、解释与 WebPage schema。 |
| P1-6 IndexNow | 公开 ownership key、生产环境开关、失败重试与提交状态日志；日报/早报保存、现有推文入库、个股分析保存接通知。cron-secret 保护的刷新接口用于内容更新后刷新指纹/提交。开发环境不发外部通知；200/202 接受与 503 重试由隔离测试验证。 |

P2 的主题、繁体、对比和入门页保持交接原定的条件暂缓；目前没有样本效果/GSC 对比查询证据，不提前扩页。

## 统一验证

| 范围 | 验证 | 结果 |
|---|---|---|
| 前端 | 相关 ESLint | 0 error；8 条原有组件 warning |
| 前端 | TypeScript / production build | 通过 |
| 前端 | Vitest：SEO、门禁、时区、暂停边界、摘要和外壳 | 79 项通过 |
| 后端 | 摘要、SEO 投影、IndexNow、stock auth、早报、暂停、screener | 242 项通过 |
| 页面 | Googlebot 原始 HTML、未知路径/无效代码/财报子页状态 | 已检查，见 http-acceptance.json |
| 结构化数据 | 10 只间隔抽样＋BRK.B/QBTS 的标题、canonical、FAQ 可见文本、禁止 schema、正文比例 | 12/12 通过，见 schema-content-checks.json |
| sitemap | 全量 URL 状态、robots、canonical、H1、禁用词 | 418/418：200、index、self-canonical、单个 H1、禁用词零命中 |
| 浏览器 | 六个真实页面＋390px 个股移动视口 | 无横向溢出，见 browser-acceptance.json |
| 内容 | 70 篇公司简介与 127 只内容比例 | 见 company-content-review.json / content-audit.json |
| 股息 | 全库扫描＋四基准股独立来源 | 单位核验通过；保留 6 条高股息告警，见 dividend-audit.json |

股息告警：IEP、PSEC、IVR、ABR、PNNT、OXSQ。第二来源也显示 >25%，部分来源因统计口径/日期不同而有差异。未将数值置零或强制压到阈值内；因此“全库没有 >25%”这条不能标为通过。缺失股息数据为缺失，不补零。

## 发布时必须保留的操作

1. 将版本化 `company_content.sqlite` 随后端发布；长期运行建议复制到持久化卷并设置 `SEO_CONTENT_DB`，保存内容指纹/lastmod/IndexNow 回执，避免重部署丢失状态。具体契约见 backend/app/features/seo/.context.md。
2. 先发布后端 `/api/seo`，再构建/发布前端；`npm run build` 自动执行 `seo:audit`，需要可读的 `NEXT_PUBLIC_API_URL`。IndexNow key 必须两端一致。发布后核验生产 `/indexnow-key.txt`，再用现有 cron-secret 调用 `/api/seo/refresh` 并检查实际推送日志。没有新增或恢复暂停的专用任务。
3. 在生产域名复跑 HTTP/sitemap 验收，再用 Google Rich Results Test/Schema Validator 与 Search Console 验证。当前记录是本地 HTML/JSON-LD 一致性校验，不声称已经通过外部验证器、收录或排名验收。

本次未触发真实邮件、付款或生产 IndexNow 通知；生成的公司简介尚未发布到生产。数据验证使用读取既有公开/市场来源；未改动暂停产品访问权限。
