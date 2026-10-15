# Claude 降本方案复核

日期：2026-10-13，Asia/Taipei。范围：核实 12 条建议并补充优化方向。本轮只读线上状态、用量与代码，未修改套餐、调度、联系人、密钥或应用代码；仅保存本报告和脱敏证据。

**结论：优先优化推特抓取、个人日报输出和对话上下文；Langfuse 采样值得做。Claude 的多项“直接停、省固定金额”基于过时状态，不能相加成可兑现收益。Resend 联系人清理尤其不能照做，事件数据已中断。**

同日此前已完成 Railway Hobby 和 staging 停机；Speed Insights Plus 原已有取消续订安排，于 10 月 14 日 15:00 台北时间结束。详见[执行记录](service-cost-actions-2026-10-13.md)，不重复计算这些收益。

## 逐项复核

| # | 建议 | 核实结果与处理意见 |
|---|---|---|
| 1 | 停 OKX MCP Railway，省 $5–15 | **不成立。** 两个环境的 OKX MCP 均已无 active deployment。完整镜像不等于持续占用运行内存；删除空服务不能算新增节省。 |
| 2 | 删除 Speed Insights、Analytics，省 $10+ | **部分成立，但节省已覆盖。** Plus 已安排结束；基础档免费额度耗尽会停止采集，保留组件本身不再产生 Plus 固定费。Analytics 除 landing 外，付费墙、结账打开和完成等也有埋点。可以合并观测工具，但不能依据“只有一处 track”直接删，也未发现可额外省下的固定 Analytics 月费。 |
| 3 | Tavily 降免费 | **方向合理，金额未核实。** 活跃代码中的调用集中于已暂停的 watchlist_monitor。最近找到的是 8 月 $24.25 按量账单，不能当成每月 $30。需核对本项目专用账户是否仍自动充值、是否被其他项目共用。 |
| 4 | 撤销 OpenAI / OpenRouter key | **本项目缺少使用依赖，但账户级零调用未证实。** 生产活跃源码未见直接调用链；OpenAI key 仍配置，OpenRouter key 未配置。InsForge gateway 的 embedding 不代表免费。先查共享用途和网关上游配置，再决定充值与密钥清理。密钥存在本身不产生费用。 |
| 5 | 删除 Onboarding / Watchlist 定时任务 | **现状已过时。** 线上 17 个任务中 13 个 active、4 个 inactive；Onboarding Drip 和 Watchlist Monitor Paid Universe 均已 inactive，未找到 Test Universe。保留暂停定义便于恢复，删除没有可确认节省。 |
| 6 | 检查 Render / Vercel 遗留后端 | **Vercel 已排除当前团队内的独立后端项目；Render 未完成账户核实。** Vercel 项目列表只有 stock-agent，根目录 frontend。Render 文档和 experimentalServices 配置只是历史线索，不能证明部署计费。近期邮件未找到 Render 账单，但后台需要登录授权，不能据此宣称没有费用。 |
| 7 | FMP Ultimate $149 → Premium $59，省 $90 | **不成立。** 最近实付已是 Premium $69/月。当前官网 Premium 年付 $588，相当于 $49/月，若确定使用一年可少付 $240/年，但增加预付承诺。Starter 的 $40/月价差需替换或放弃部分数据能力，不能无损直接降。 |
| 8 | research-kb/chat 是无配额成本漏洞 | **当前不可用，不是活跃成本入口。** 全局 FeaturePauseMiddleware 拦截，生产 GET 返回 403 / feature_paused；agent 入口也 require_active，10 月统计无 research_kb.chat 用量。当前共享生成模型是 gemini-3.8-flash。将来恢复时应补权益、配额和限流，现在无需为暂停模块优化模型。 |
| 9 | 全面降低 thinking，可明显省钱 | **收益被高估。** 生产结构化生成助手已有 LOW，enrichment 已为 Flash-Lite + MINIMAL。按 10 月 1–12 日已记录 token 等速折月，全项目 thinking 约 $2.06/月；核心成本是正常输入和输出，不是 thinking。 |
| 10 | 1.5h 改 1.1–1.2h，推特账单省 20–30% | **值得优化，比例未证实。** 生产确为每小时抓、回看 1.5 小时，但付费按返回条目、分页边界和失败补抓影响实际收益。当前 enabled KOL 为 354，非 229；直接改短可能漏掉延迟数据。建议按每个列表上次成功完整抓取的位置推进，并保留小幅重叠及失败补抓。 |
| 11 | 依据 email_events 删除 90 天未打开联系人 | **现在不能据此执行。** Resend webhook 仍 disabled，email_events 最新打开事件停在 9 月 5 日，近 30 天所有类型均无新事件。未记录不等于未阅读。需恢复或补齐供应商侧活跃数据后再评估。 |
| 12 | Langfuse cron 采样以维持免费档 | **方向成立，当前费用未知。** 生产 LANGFUSE_ENABLED=true，有凭据，未设置 SAMPLE_RATE，初始化也未传采样率，按 SDK 默认属于全量采样配置。配置启用不证明每条导出成功；未拿到当前套餐、导入量及账单，不能承诺采样后免费。 |

定价与能力依据：[Vercel Speed Insights](https://vercel.com/docs/speed-insights/limits-and-pricing)、[FMP](https://site.financialmodelingprep.com/developer/docs/pricing)、[Gemini](https://ai.google.dev/gemini-api/docs/pricing)、[Langfuse sampling](https://langfuse.com/docs/observability/features/sampling)。FMP 对外展示数据的授权须另核对已有协议，不能只按官网个人套餐推断。

## 更值得做的优化

### 1. 推特抓取：先减少付费返回，再缩短本地处理

10 月 1–12 日两个列表共 576 次运行、3,608 页、71,740 条 API 返回。数据库 upsert 数不能当作新增独立推文数，因此不能用 fetched 减 stored 计算重复率。

- 使用“上次成功完整覆盖到的位置 + 小幅重叠”，失败、超时或分页截断时不推进完成位置；保留补抓和覆盖监测。比固定从 1.5 缩到 1.1 小时更能控制漏抓风险。
- `enabled` 过滤发生在付费响应之后。仅在本地禁用账号，主要减少后续处理，不能消除已经返回的 API 费用。真正压缩抓取量要调整上游列表或抓取来源。
- 每日列表同步会写入 `enabled=True`，本地手动禁用可能被覆盖。若要长期屏蔽，应将明确排除规则与上游成员同步分开。
- 当前 Starter 固定 $29/月。减少 credits 消耗不等于马上减少付款；先测真实扣费和额外充值，再判断是否改按量。

理论上，均匀到达、无分页浪费时，1.5h → 1.2h 的返回量降幅是 20%，→ 1.1h 是约 26.7%；这是窗口比例情景，不是已证实账单节省。“一半返回是重复”的说法也不准确，理想稳态下重叠占 1.5h 总量的约三分之一。接口按返回推文计费参见 [TwitterAPI 逐端点价格](https://twitterapi.io/pricing/details)。

### 2. AI：个人日报压输出，对话压重复输入

以下为 10 月前 12 个完整 UTC 日按标准 token 价折算 30 天，**不是发票，也不是已实现节省**。

| 功能 | 输入 | 正常输出 | thinking | 合计 | 优先动作 |
|---|---:|---:|---:|---:|---|
| 付费个人日报 Brew | $11.22 | $14.59 | $1.47 | $27.27 | 限制重复背景和长输出，复用公共事实；保留个性化判断 |
| KOL enrichment | $9.93 | $10.44 | $0.00 | $20.36 | 已使用小模型；减少无价值候选与不必要输出，先验证标签质量 |
| Frank / Serenity 对话 | $14.16 | $2.98 | $0.00 | $17.15 | 控制历史与重复工具结果的输入，保留必要证据和对话连续性 |

只把 Brew 正常输出减少 30%，对应约 **$4.38/月**的 token 成本情景；把 Frank / Serenity 输入成本减少 30%，对应约 **$4.25/月**。这两项比继续压 thinking 更值得先测。不能把模型已设 LOW 当作零 thinking，也不能未经质量检查降低全部生成模型。

本次额外检查了 thoughts_tokens 为空的行：total_tokens 均不为空，且均等于 prompt + output，没有额外未归类残差。因此 $2.06/月是当前记录支持的估值；仍不能保证覆盖供应商全部计费。

内部全项目估值约 $73.84/月，与 Google 页面 $56.92 的月预测尚未对账。先统一时间窗与调用归因，优化前后同时看内部 token 和供应商账单，避免把估算比例当现金节省。

### 3. Langfuse：采样观测，保留完整成本统计

生产仍有 Langfuse 初始化和 ADK / GenAI instrumentation；本地工作区的相关源码已不同，单看本地会误判线上状态。

可先为高频后台 trace 设计 10–20% 采样，保留对排错有价值的记录；`llm_usage` 成本计量继续完整记录。全局设置 SAMPLE_RATE 会连用户对话一起采样，若只采 cron，需要按根 trace 或功能区分，不能把一个环境变量说成只影响 enrichment。

7 月邮件曾提示免费额度用尽，但不是当前账单证据。应先核对当前 Langfuse 用量与付费状态，再决定采样幅度或取消付费。

### 4. Resend：先补回活跃数据，再谈 $40

当前共有 1,898 联系人，其中 215 已退订、1,683 仍订阅。即使仅移除全部已退订联系人，仍高于已核实的免费 Marketing 1,000 联系人上限。

若要最终省下 $40/月，需要真实活跃审计与触达范围调整：供应商侧送达/点击、近期新订阅、付费身份、站内使用，并将打开作为辅助信号。不能用已中断的事件表生成清退名单。恢复 webhook 属于另一个已识别的维护任务，本轮未操作。

## 待核实项与建议顺序

1. 先做推特抓取覆盖与重复量的基线，再改增量抓取；同时评估 Brew 输出长度和对话上下文预算。
2. 查 Langfuse 当前账单并做适度采样，保留完整 token 计量。
3. 修复或补齐 Resend 活跃观测，再决定是否收缩免费邮件受众。
4. 如果确定一年继续使用 FMP，再考虑年付；暂不进一步降档。
5. 补齐 Render 登录核查、Tavily / OpenAI 等账户充值状态、InsForge 旧套餐发票和 TwitterAPI 实际扣费。尚未验证的固定费不计入节省。

本轮没有发现可以再“无损直接停掉且确认省下大额月费”的新服务。优先投入小范围、可衡量的优化，避免为每月几美元引入明显交付风险。

## 证据入口

- [本轮脱敏聚合证据](cost-optimization-proposal-evidence-2026-10-13.json)
- [原月度审计与账单链接](monthly-service-cost-audit-2026-10-13.md)
- [同日已授权执行结果](service-cost-actions-2026-10-13.md)
- Twitter 实现：[抓取与列表同步](../../backend/app/features/twitter/service.py)；前端埋点：[paywall-analytics](../../frontend/src/lib/paywall-analytics.ts)
- 暂停策略：[feature_pause](../../backend/app/core/feature_pause.py)；Research-KB 二次保护：[agent](../../backend/app/features/research_kb/agent.py)

源码链接指向当前工作区；涉及实际运行状态的结论另用线上源码、数据库及供应商 API 复核。Render 后台停在登录授权页，Langfuse 账单页停在登录页；本轮未新增授权或接受条款。
