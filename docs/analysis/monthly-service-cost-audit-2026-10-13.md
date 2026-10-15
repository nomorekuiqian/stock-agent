# TheMarketBrew 每月服务成本审计

审计日：2026-10-13（Asia/Taipei）。生产数据库用量窗口为 10 月 1–12 日完整 UTC 日；Google 页面展示 10 月 1–13 日已入账数据。

**同日执行更新：** Railway 已降为 Hobby，staging 已停止且自动部署已关闭；Vercel Plus 经核实早已安排于 10 月 14 日 15:00（台北时间）结束，基础 Pro 保留。详见[执行记录](service-cost-actions-2026-10-13.md)。以下为执行前的审计快照。

**建议先降 Vercel Speed Insights Plus，评估 Railway Pro → Hobby，并将 staging 改为需要时运行。FMP、Resend、TwitterAPI 和生产数据库都有实际依赖，不能直接停。**

本次读取了近期账单邮件、Google Cloud Billing、生产数据库、InsForge 调度和 Railway 部署状态。未修改套餐、调度、代码或生产数据；未发送邮件。工作区已有大量其他修改，本次仅新增本报告及脱敏聚合证据。

## 1. 每月花费：实付、预测与未知项分开

金额均为美元。套餐按最近已核实收据；账户级服务尚未完全拆分其他项目的分摊。

| 服务 | 已核实费用 | 用途与判断 |
|---|---:|---|
| FMP Premium Monthly | $69/月 | 行情、新闻、财务、日历、技术指标等核心数据，保留 |
| Resend Marketing Pro | $40/月 | 广播和联系人管理，当前规模不能直接免费化 |
| TwitterAPI Starter | $29/月 | KOL 抓取；包含额度，不能把取消订阅等同于省下全部 $29 |
| Railway Pro | $20/月 | 生产及 staging 后端；最有条件降档的基础服务 |
| Vercel Pro | $22.11/月，含税；税前 $20 | 前端及服务端认证，保留基础套餐 |
| themarketbrew.com 域名 | 已付 $12.18/年，摊 $1.02/月 | 历史注册价，不代表下一次续费价 |
| Namecheap Private Email Starter | 已付 $14.88/年，摊 $1.24/月 | 独立收件箱，已付至 2027-04-04；与 Resend 发信不是同一功能 |
| Gemini API | 9 月 $82.95 + 税 $8.75 = **$91.70** | Google 页面与 10 月 7 日付款邮件一致，全部归属 Stock-Agent |
| InsForge | **旧 Starter，金额待核** | 账户 API 已证实套餐；没有取得发票，不能用当前 Pro $25 代填 |
| Stripe | **交易及 Billing 费用待核** | 与收款额、笔数相关，不是可直接停掉的固定服务 |
| Tavily / OpenAI / OpenRouter / DeepSeek / PostHog 等 | 未发现近期固定月费证据 | 无账单证据不等于免费；备选接口、开发工具和其他项目消费不直接计入本项目 |

可复核的合计：

- 五项月付服务：`69 + 40 + 29 + 20 + 22.11 = $180.11/月`。
- 加域名及邮箱精确年费分摊：`180.11 + (12.18 + 14.88) / 12 = $182.37/月`。
- 加 9 月 Gemini 实付，作为近期成本基准：**$274.07/月**。这是以当前套餐归一化的月成本，不是同一日历月现金流水之和。
- Google 当前已入账 **$21.96**，10 月全月预测 **$56.92（未税）**。按此预测，已知部分为 **$239.29 + Gemini 税费/月**；若税率仍为 10.55%，约 **$245.29/月**。
- 以上均还需加 InsForge 实付分摊、Stripe 手续费、未核实的 API 超额/充值、新增 Vercel 附加费。**不是完整总账。**

注意：FMP 9 月付款 $30.33 是 $69 减 $38.67 余额抵扣，10 月已恢复付 $69。Railway $11.24 资源费已被 Pro 额度抵扣，不能在 $20 之外再加一次。TwitterAPI 套餐已含额度，也不能把按量估算重复加进总额。

## 2. 可以优先降级的项目

### A. Vercel Speed Insights Plus：优先降回基础档

9 月 29 日 Vercel 通知：TheMarketBrew 有 1 个项目开启 Plus，之前漏收，下一账期起新增 **$10/月，税前**；不追收历史费用。最近基础套餐账期为 9 月 14 日至 10 月 13 日，值得现在核对附加项。

项目同时接入 Vercel Analytics、Speed Insights 和 PostHog。Plus 属于性能观测附加能力，对当前主营交付没有直接依赖；建议保留基础观测，降掉 Plus。**本次没有读取 Vercel 当前开关，因此节省是“若仍启用，避免新增 $10/月”，不是已支付费用退款。**

9 月收据中的 Observability Plus 为 $0，本次不虚算这一项节省。Vercel 10 月 9 日还通知：10 月 23 日起 Deployment Storage 与 Functions Storage 各按 $0.10/GB-month 计费，受额度影响。若 30 天部署保留期够用，可采用通知中的默认收缩；实际存储量未核，不估算节省。

Vercel Hobby 仅允许个人非商业使用；本项目有付费订阅，不建议直接换免费档。迁移其他托管平台是另一项工程，不应把整笔 $22.11 当作立即可省。

### B. Railway Pro → Hobby：按最近用量可省约 $8.76/月

最近两个账期资源费：

| 资源账期 | 内存 | CPU | 网络 | 合计 | 实付套餐 |
|---|---:|---:|---:|---:|---:|
| 08-04 → 09-04 | $19.15 | $0.18 | $0.18 | $19.51 | $20 |
| 09-04 → 10-04 | $11.01 | $0.08 | $0.15 | $11.24 | $20 |

当前官方价格：Hobby 为 $5 最低消费、包含 $5 额度；Pro 为 $20 最低消费、包含 $20 额度。若维持上期资源量，Hobby 账单约 $11.24，**省 $8.76**，不是降档就固定省 $15。若用量回到 $19.51，节省仅 $0.49。

线上证实 production 和 staging 各有一个成功运行的 stock-agent 实例，均未开启休眠。建议 staging 改为测试时启动，生产保持运行。实际 staging 分项资源账单未取得，不假定它占一半；单独停 staging 后，若仍留在 Pro 的 $20 最低消费内，也不一定立即减少付款。

降档条件：不需要 Pro 的团队协作、支持、较高可用性目标和 30 天日志保留；接受 Hobby 的 7 天日志等差异，并核对整个 workspace 的其他项目。两个 OKX MCP service 均没有 active deployment，不能把删除空 service 壳算成新的运行费节省。

## 3. 有潜力，但需要先调整范围

### FMP：$69 是最大固定项，但直接降档会影响数据

当前代码实际调用的不只是新闻和报价，还包括 technical-indicators、economic-calendar、earnings-calendar、季度财务报表、ratios/key-metrics、analyst-estimates 等。

- Premium $69 → Starter $29：价格差 **$40/月**，但 Starter 与 Premium 的历史深度、完整财务、技术指标、日历能力不同。必须先逐个核对保留功能的端点权限及替代数据，不能现在直接降。
- 保持 Premium 改年付：官网为 $49/月等值、年付 $588，较月付少 $240/年。仅适合已决定持续使用 12 个月的情况；不是减少服务需求，也增加预付承诺。
- FMP 官网个人套餐价格与数据展示授权分开。已有授权协议未取得，因此价格差只是候选，不能据此断言低价档适用于全部对外展示。

### TwitterAPI：先缩小抓取，再考虑按量付费

生产有 **354 个 enabled KOL**，每小时跑抓取和 enrichment。9 月记录 9,223 页、184,154 条返回推文；10 月前 12 个 UTC 日为 3,608 页、71,740 条。这里是 API 返回量，包含可能重复拉取，不能当成独立新增推文数。

官网当前 Starter 每月给约 313.2 万 credits（$29 本金额度 + 8% bonus）。按公开推文单价 $0.15/千条，仅 9 月返回量就约 **$27.62**；10 月当前速度约 **$26.90/30 天**，尚未含 list/member 相关费用。官网列表调用说明与逐端点页面的表达存在差异，未取得本账户逐端点扣费明细，不能将附加 list 费用重复或漏计后当作最终账单。

因此**现有负载下不推荐直接取消 Starter**。先按最终日报贡献缩小抓取名单，保留 Frank、Serenity 和关键宏观来源，减少重叠时间窗的重复返回；观察真实扣费低于 $29 后再改充值制。当前额度余额、额外充值和返还权益仍待核。

只把小时任务改成每天、但仍处理同样多的数据，不会按任务次数比例省钱；同时需要修改回看窗口，避免漏推文。

### Resend：当前不能直接省下 $40

本次按官方 Contacts API 完整翻页：**1,898 个联系人，215 个已退订，仍订阅 1,683 个**。当前免费 Marketing 档上限 1,000 个联系人；即使移除全部已退订联系人仍超限。

若愿意收缩免费邮件分发，可先按点击、近期主动订阅、付费身份和打开信号审计低活跃名单，在保留退订记录及付费权益的前提下，把供应商计费联系人降至 1,000 内，再核对实际计划规则。潜在节省 $40，但会改变免费用户触达，**不列入无损节省**；不能只靠“没打开”判定无价值。

8 月曾支付 Transactional Pro $20，9、10 月未找到续费收据。其当前是否已降级尚未取得后台确认，不能重复承诺再省 $20。Marketing 与 Transactional 是两种计费口径，免费事务邮件的 100 封/日限额也不能忽略。

## 4. AI 费用应优化交付方式，而非再统一换模型

生产 `llm_usage` 10 月 1–12 日按当前官方标准 token 单价重算：

| 功能 | 12 天估值 | 30 天等速估值 |
|---|---:|---:|
| 付费个人日报 Brew | $10.91 | $27.27 |
| KOL 推文筛选 enrichment | $8.15 | $20.36 |
| Frank / Serenity 对话 | $6.86 | $17.15 |
| 通用研究助手 | $1.43 | $3.57 |
| KOL 最终日报编排 | $1.23 | $3.07 |
| 早报、晚报、宏观周报及其他 | $0.97 | $2.42 |
| 合计 | **$29.54** | **$73.84** |

这是归因估算，不是发票。与 Google $21.96 已入账金额、$56.92 月预测尚未对齐；两者时间窗、入账延迟、计量或重复记录等原因未逐项验证，不把差额直接归咎于供应商。预算以供应商为准，内部数据用于排序。

已确认 enrichment 在用 `gemini-3.5-flash-lite`，10 月记录没有 thinking token；之前的换小模型优化已生效，不重复计算。付费个人日报应优先复用公共事实、缩短重复背景和输出；若这项单位 token 费用减少 30%，按内部口径约省 $8/月。推文候选筛选若减少一半对应 token 工作量，约省 $10/月。这些是目标情景，不是已验证收益，也不能直接同比例扣减 Google 发票。

早报、晚报、宏观周报三项合计约 $1.89/30 天，停它们节省很小。已暂停的 Panda、AI Monitor、Onboarding、向量索引四个 schedule 仍停用；13 个其他任务启用。`kol_research` 用量包含已恢复的 Frank/Serenity 对话，不能当成暂停功能泄漏。

价格风险：Google 当前说明 Gemini 3.8 Flash 标准 token 单价于 2027-01-01 翻倍，Flash-Lite 不在这项翻倍说明内。若当前模型与 token 结构不变，3.8 部分内部估值约 $53.48/30 天将增加同量，需在年底前重新评估。

## 5. 可停止付费依赖与仍需核对的账单

- **Tavily**：代码调用集中在已暂停的 AI Monitor，最近找到的收费为 8 月 1 日 $24.25 按量账单，未找到 9、10 月收费。可将本项目对应付费/自动充值作为停用候选；若密钥与其他项目共用，先核对。当前不能承诺固定月费节省。
- **独立 OpenAI / OpenRouter / DeepSeek 充值**：本次代码未见必须保留的独立 OpenAI/OpenRouter生成链路；向量检索通过 InsForge gateway，DeepSeek 摘要入口属于已暂停监控功能。可核对本项目专用账户自动充值，保留其他项目所需。没有当前固定扣款证据，不写成已确认省钱。
- **PostHog**：在用，未找到收费收据。优先免费额度与用量限制，不为未知费用移除核心行为观测。
- **InsForge**：账户是旧 Starter；生产物理数据库 **1,310 MB**，与供应商计费尺寸可能不同，但已不适合直接假定能落入 500 MB 免费额度。保留数据、认证和调度；须拿到旧套餐发票及实例明细。组织还有 active 的 atoms-demo 和两个 paused 的 Craftly 项目，不能全部归给 TMB，也不能未经确认停掉其他项目。
- **Stripe**：本地配置未提供可用 live key，本次未取得两账户手续费流水。需要 primary 与 legacy 一起核对；不能只按单账户或官网费率推算为已付。
- **Private Email**：只有 $1.24/月等值，当前年度已付款。除非确认完全不用独立收信并完成邮件迁移，否则优先级低；取消未来续费不等于本月马上退款。
- Codex/ChatGPT/Claude 等开发订阅属共享开发成本，本次没有武断计为 TMB 独占运行成本。

## 6. 建议执行顺序

1. 核对并降掉仍启用的 Speed Insights Plus：避免新增 $10/月税前。
2. 核对 Railway workspace 条件后降 Hobby；staging 按需启停。按最近账单，降档本身约省 $8.76/月，staging 的额外收益另测，不重复加。
3. 收缩 KOL 抓取和简化 Brew：争取约 $15–20/月 token 估值改善，先验证质量和供应商实际账单。
4. 只有决定缩小产品范围时，才做 FMP Starter 端点替代或 Resend 联系人收缩。两项理论价格差合计 $80/月，但目前条件未满足。
5. 补齐 InsForge 旧套餐、Stripe 双账户手续费、TwitterAPI credits、Vercel 附加项及存储账单后，形成完整月度总账。

**当前较明确的选择是省约 $8.76/月，并避免将来新增 $10/月税前；其他节省均有用量、功能或预付条件。** 不建议为了凑降本金额删除已经暂停的代码、停付费用户交付、或把现有基础服务直接换免费档。

## 证据

近期收据：

- [FMP 10 月收据](https://mail.google.com/mail/u/0/#all/1a11f5ae10e48012)、[9 月抵扣收据](https://mail.google.com/mail/u/0/#all/1a084dafd2a599f2)
- [Resend 10 月收据](https://mail.google.com/mail/u/0/#all/1a11a55747320be8)、[8 月 Transactional 收据](https://mail.google.com/mail/u/0/#all/19fe890cfd551270)
- [TwitterAPI 9 月收据](https://mail.google.com/mail/u/0/#all/1a0adeaa2d204fed)
- [Railway 10 月收据](https://mail.google.com/mail/u/0/#all/1a1089a02258ffdf)、[9 月收据](https://mail.google.com/mail/u/0/#all/1a06e1af442d9e9e)
- [Vercel 基础套餐](https://mail.google.com/mail/u/0/#all/1a0a1aca0f6158a2)、[Plus 补收费通知](https://mail.google.com/mail/u/0/#all/1a0ed857439ea327)、[存储计费通知](https://mail.google.com/mail/u/0/#all/1a1230adddf65fee)
- [Google 付款 $91.70](https://mail.google.com/mail/u/0/#all/1a115a0149803b9c)、[Google Cloud Billing](https://console.cloud.google.com/billing)
- [域名注册](https://mail.google.com/mail/u/0/#all/19b303116c0e4372)、[Private Email 年付](https://mail.google.com/mail/u/0/#all/19d3e9e204122e78)、[Tavily 历史按量费用](https://mail.google.com/mail/u/0/#all/19fbb0901c3b44e1)

官方定价与限制（本次访问）：[Railway](https://railway.com/pricing)、[Vercel Hobby](https://vercel.com/docs/plans/hobby)、[FMP](https://site.financialmodelingprep.com/developer/docs/pricing)、[Resend](https://resend.com/pricing)、[Resend 联系人计费说明](https://resend.com/migrate/mailchimp)、[TwitterAPI Starter](https://twitterapi.io/subscribe)、[TwitterAPI 逐端点价格](https://twitterapi.io/pricing/details)、[Gemini](https://ai.google.dev/gemini-api/docs/pricing)、[InsForge 当前价格](https://insforge.dev/pricing)、[InsForge 旧套餐保留说明](https://insforge.dev/blog/insforge-pricing-update)。

本次脱敏聚合数据见 [monthly-service-cost-evidence-2026-10-13.json](monthly-service-cost-evidence-2026-10-13.json)。历史报告只用于定位，不把旧快照当当前用量；生产状态已重新核对。
