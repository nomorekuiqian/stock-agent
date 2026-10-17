# TheMarketBrew 2026Q4 重启 Engineering Plan

> Status: 第 0 步进行中（2026-10-17）
> **2026-10-17 更新**：「定位」和第 1、2 步已被 [mvp-portfolio-tracker.md](mvp-portfolio-tracker.md) 取代（回到持仓追踪 + 每日推送，KOL 观点降为档案里的一个信息源）。**本文第 0 步继续有效。**
> Related: backend/app/features/twitter_digest/.context.md、backend/app/features/kol_research/.context.md、backend/app/features/webhooks/.context.md、frontend/src/app/.context.md、docs/analysis/remaining-features-usage-2026-09-04.md、docs/analysis/monthly-service-cost-audit-2026-10-13.md
> Vision: 本文取代 `portfolio-first-refresh-proposal.md` 的「持仓简报为招牌」定位；持仓个性化降为付费层能力

## 目标

把 TMB 从「功能很多、没人用」的投研产品，收敛成**以内容为主、产品为辅**的服务：定位为中文美股散户的「博主共识地图」，用一条日更数据流水线同时产出 SEO 页面、原生平台内容和邮件，用一套可度量、能自我调整的 agentic growth system 获取用户。

## 现状（2026-10-15）

**工程**
- git 有效开发停在 2026-06-26（`67893fb` 是 8/10 软退休监控台）。9–10 月的四次生产发布全部绕开 git，用隔离发布包上线：
  - 9/04 功能暂停 + 模型统一（`.codex/artifacts/feature-pause-2026-09-04/`）
  - 9/22 恢复 Frank/Serenity persona（`.codex/artifacts/persona-chat-2026-09-22/`）
  - 10/13 Railway 降为 Hobby、停 staging（`docs/analysis/service-cost-actions-2026-10-13.md`）
  - 10/13 内存优化（`.codex/artifacts/railway-memory-2026-10-13/`）
- **当前线上基线**：
  - 后端：Railway production `333381af-e501-440f-a698-30832fc4cb27` = `railway-memory-2026-10-13/baseline` + `release.patch`（共 10 个文件，见 `release-changed-files.json`）
  - 前端：Vercel `dpl_vDYUPisf1WmJD9Q7PBMTByXSYw4j`（`persona-chat-2026-09-22/release/frontend`）
  - Edge Functions：以 Insforge 线上版本为准。本地 `llm-usage.js` 比线上旧，**不能直接部署**
- 本地工作区有 171 个未提交文件（120 个修改，其余未跟踪），既有已上线的改动，也有只在本地的 WIP，混在一起。
- staging 已停，自动部署已关闭。

**用户与营收**（来自 9 月审计）
- 每周登录的外部用户约 22 人；32 个持续扣费订阅（28 个在 legacy Stripe 账户），40 个 Pro/Max 权益。
- 产品实质是邮件交付：

| 邮件 | 收件人 | 打开率 |
|---|---:|---:|
| 专属日报 | ~39 | 61% |
| KOL 日报 | ~42（29 人连续打开，点击率全站最高） | 56% |
| 盘前早报 | ~48 | 56% |
| 盘后晚报（广播） | ~1,665 | 23% |

  所有邮件的点击率都不到 1%。
- 历史上唯一一次打破自然获客基线（约 5–10 人/天）的，是 6/6 博主转发。

**度量是断的**
- Resend webhook 自 2026-09-05 起处于 disabled，`email_events` 从那天起断档。
- 注册时完全不记录来源：`frontend/src/app/actions/auth.ts` 的 `signUpAction` 只传 email、password、name。6 月写入的 metadata 是 `[object Object]`。
- PostHog 没有可用的看板访问。

**成本**：约 $245–275/月。最大的几项是 FMP $69、Gemini 约 $57–92、Resend $40、TwitterAPI $29。Gemini 3.8 Flash 单价从 2027-01-01 起翻倍。

**已有的 SEO 基础**：`sitemap.ts`、`robots.ts`；有 metadata 的页面包括 `/stock/[symbol]`、`/today/[id]`、`/morning/[id]`、`/macro/*`。`docs/analysis/` 里有两篇光模块长文草稿。

## 设计

### 定位：博主共识地图

用户自己的 Agent 能搜到新闻，主动监控也在被通用 Agent 拿走。我们只押一次性搜索产不出来的东西：

1. **观点的时间序列**：354 个中英文博主，每天结构化并积累。可以回答「谁什么时候怎么看、后来改口没有」。
2. **共识与分歧的统计**：「本周看多光模块的比例从 40% 升到 70%」。这类聚合信号单篇推文里没有。
3. **可追溯的战绩**：观点和随后的市场走势放在一起看。这是信任资产，也是和博主谈合作的筹码。

持仓或自选股个性化（「把共识地图映射到你的自选股」）是付费层能力，不是招牌。

### 一条流水线，三个出口

```
KOL 抓取 + enrichment（已有：twitter_digest / kol_research）
        ↓
每日信号层（新增）：共识占比、分歧、改口、热度变化，按 ticker / 主题 / 博主聚合
        ├─ SEO 页面（程序化、长期复利）
        │    /stock/[symbol]/views  博主怎么看 XX（时间线 + 战绩）
        │    /topic/[slug]          主题共识页（光模块、降息……）
        │    /consensus/[week]      每周共识变化归档
        ├─ 原生内容（短期获客）
        │    Agent 选题 → 草稿 + 图表 → 人工 2 分钟审定（合规闸门）→ 分渠道发布
        └─ 邮件（转化 + 留存）→ 单一付费档
                         ↓
        归因回路：UTM / 首次触达 → 注册 → 打开 → 付费 → 每周复盘 → 调整选题
```

- 原则是**轻产品**：网站只承担落地页、归档、订阅和付费。research 对话作为付费权益保留，不再投入开发。暂停的功能保持暂停。
- 合规闸门：所有对外内容只描述「谁说了什么、共识怎么变」，不给买卖建议。发布前必须经过人工确认。
- 没有归因回路，就只是一台发帖机器，不是 growth system。所以度量在第 0 步就要修好。

## 实施步骤

### 第 0 步：工程归位与度量修复（约 1 周；阻塞后面所有步骤）

完成标准：仓库可以复现线上；以后只从 git 发布；能回答「这周的注册从哪来、谁付了费」。

**0.1 把线上基线收回 git**（每一步 git 操作都需要用户确认）
1. [x] 把当前工作区原样保存到分支 `wip/2026-09-local`，作为备份，不合并（2026-10-15，commit `f7fb671`，252 个文件；2026-10-17 已推送到 origin 做异地备份）。
2. [x] 从 **`origin/master`（`f450ccf`）** 开分支 `restart/prod-baseline`。注意本地 `master` 落后它 7 个提交（6/27–8/10 的 Langfuse、研究流式响应、认证超时修复、AI monitor 退休合并），9 月的发布包就是以这些线上修复为底的。分支建好后：
   - 后端：用 `railway-memory-2026-10-13/baseline/` 覆盖 `backend/`，再应用 `release.patch`
   - 前端：用 `persona-chat-2026-09-22/release/frontend/` 覆盖 `frontend/`
   - 2026-10-17 完成：后端 commit `e69b155`（71 个文件，489/489 哈希一致）；前端 commit `50651cb`（31 个文件，416/416 哈希一致；仓库独有的 `e2e/`、`.claude/` 保留）。尚未推送。
3. [x] 用 Insforge CLI 拉取所有线上 Edge Functions 的源码，覆盖 `backend/app/edge_functions/`。特别核对 `llm-usage.js`、`cron-trigger.js`、`picker-conversations.js`。
   - 2026-10-17 完成：37 个线上函数全部写入 `backend/app/edge_functions/<slug>.js` 并逐字节核对；旧目录 `backend/edge_functions/` 已合并删除。发现的问题：`vector-store` 的 `search_text` 从未部署（后端有 REST 回退）；`mcp-auth`、`wechat-users` 只在仓库里。详见该目录的 `.context.md`。
4. [x] 导出线上 schedules 列表（应为 17 项：13 项启用、4 项暂停）和数据库 schema，作为基线证据存入 `docs/analysis/`。
   - 2026-10-17 完成：`docs/analysis/production-baseline-2026-10-17/`（17 个 schedules：13 个启用、4 个停用；48 张表、38 个函数；只有结构）。
5. [x] 用文件哈希和 `release-manifest.json` / `production-hashes.txt` 对照，确认重建的代码等于线上。
6. [ ] 对比 `wip/2026-09-local` 与基线，逐个文件分成三类：
   - 已在线上：丢弃
   - 本地独有且有价值：单独提交
   - 过时：丢弃

   分类清单写入本文附录。
   - 2026-10-17 完成，见附录 A。已在工作区应用（未提交）：B 类 140 个文件（不含个人权限配置、6 张概念图 PNG 和下面两个测试）；C 类 14 个文档做了三方合并。附录 A 的两处修正：`tests/test_llm_clients_unit.py` 以**线上为准**（备份版删掉了 Langfuse 断言）；`tests/test_kol_persona_unit.py`、`tests/test_llm_usage_edge_unit.py` 不合入（前者测的是未上线的时间衰减重排，后者测的是旧版 `llm-usage.js`）。
7. [ ] 按逻辑分组提交，包括 `docs/analysis/` 下 9–10 月的审计文档和 evidence。`.codex/artifacts/` 保持被忽略。
8. [x] 在基线分支上跑 `pytest`、`npm test`、`npm run build`，记录已知失败。
   - 2026-10-17：后端单元测试（不含 `tests/e2e`、`tests/eval`）2537 通过 / 90 失败；前端 vitest 748 通过 / 16 失败；`npm run build` 通过。**失败全部是基线自带的，与合入无关**，集中在已暂停的功能：zsxq_ingest 24、themarketbrew_mcp 28、watchlist_monitor 12、onboarding 8、research_kb 5、entitlement_gates 4、okx_mcp 3、community_access 2、kol_cockpit_v3 2、architecture 1、llm_clients 1；前端是 SubscriptionContext 6、OnboardingGate 4、AuthSubscriptionSync 3、HomeGuidedTour 3。处理方式：随 MVP 第 2 步下线这些模块时一并删除，或改为断言 `feature_paused`。
   - 注意：`pytest` 不加参数会收进 `tests/e2e`，那部分需要后端在运行。
9. [ ] 合回 `master`，推送。

**0.2 只从 git 发布**
1. [ ] 写发布 runbook `docs/guides/deploy-runbook.md`：
   - Railway production 从 git 部署（CLI 或 GitHub 集成二选一）
   - Vercel 跟 `master`
   - Edge Functions 统一用 `insforge functions deploy`
   - 发布前跑同一套 smoke 检查（参考 `railway-memory-2026-10-13/smoke_readonly.py`）
2. [ ] 用基线 commit 做一次「空发布」，确认线上行为不变（`/health`、`/ready` 返回 200；暂停接口返回 403；persona 接口未登录返回 401）。
3. [ ] 在 CLAUDE.md 或工程规则里写明：禁止再用 tarball 绕开 git 上线。

**0.3 修复度量**
1. [ ] 在 Resend 后台重新启用 webhook（发向 `/api/webhooks/resend`），确认 `email_events` 恢复写入。判断是否需要用 Resend API 回填 9/05 以来的打开和点击记录。
2. [ ] 记录注册来源：
   - 前端首次访问时，把 `utm_*`、`ref`、落地路径、`document.referrer` 写进一个首方 cookie
   - `signUpAction` 带上这个 cookie，注册成功后写入新表 `user_acquisition`（user_id、first_touch、last_touch、created_at）。不再塞进 auth metadata，避免再出现 `[object Object]`
3. [ ] 统一 UTM 规范（source=平台、medium=organic/seo/email/kol、campaign=内容 id），写进 `docs/guides/`。
4. [ ] 恢复 PostHog 访问，定义漏斗：落地 → 注册 → 邮箱验证 → 首封邮件打开 → checkout → 付费。
5. [ ] 做一个每周增长报表（admin 页面或脚本）：按来源统计注册和付费、各邮件打开情况、各内容带来的注册。

**0.4 内容扩量前必须先修的雷**
1. [ ] 广播幂等：按 `docs/analysis/backend-reliability-review-2026-10-02.md` 的 A 项，在创建 Resend broadcast 之前，用唯一约束原子抢锁。邮件名单扩大后，重复发送的代价会成倍上升。
2. [ ] 确认广播名单已经过滤 `@example.com` 等测试地址。8 月晚报连续 20 天发送失败就是这个原因。
3. [ ] 收缩 KOL 抓取名单，只保留对日报和信号层有贡献的来源，并在 2027-01-01 涨价前评估 enrichment 和 Brew 的模型选择。
4. [ ] 跑一次 `/subscription-audit`，把 legacy 账户中断期丢失的取消事件对上账。

### 第 1 步：内容 MVP（2–3 周；先人工跑通，后自动化）

1. [ ] 信号层 v0：基于现有 `kol_*` 表，每天产出按 ticker 和主题聚合的「共识占比 / 分歧 / 改口」。先离线生成 JSON，不建新服务。
2. [ ] 定下 3 种固定内容形态，例如：
   - 每周共识变化（图表）
   - 单只股票的博主分歧
   - 博主改口追踪
3. [ ] 每天由 Agent 出 2–3 个选题和草稿，人工审定后发布，全部带 UTM。
4. [ ] 上线 `/stock/[symbol]/views` 程序化页面，覆盖讨论量最高的 50–100 只 ticker，并加入 sitemap。
5. [ ] 落地页改成「共识地图」叙事：唯一的主 CTA 是订阅邮件，免费层是每周共识邮件。

### 第 2 步：自动化闭环（4–6 周）

1. [ ] 把第 1 步中被归因数据证明有效的形态做成自动产出，人工只保留审定这一步。
2. [ ] 每周由 Agent 复盘：读增长报表，调整下周的选题和渠道配比，产出复盘记录。
3. [ ] 加上 `/topic/[slug]` 和 `/consensus/[week]` 页面。
4. [ ] 启动博主合作：把内容引擎提供给博主（见 [[project_creator_channel]] 的模型 B），换取分发，可以谈分成。
5. [ ] 简化付费：一个付费档，权益包括完整共识地图、自选股映射和 research 对话。老订阅保持原样。

### 继续或停止的条件（初始阈值，待用户确认）

- 6 周内，自然搜索加原生内容带来的注册，能否稳定超过约 5–10 人/天的自然基线。
- 每周共识邮件的连续打开人数，是否持续增长。
- 达不到时，复查定位和内容形态，不用加功能来补。

## 依赖

- 第 0.1 步依赖 `.codex/artifacts/` 里的三份快照完好（已确认存在）。
- 第 0.3 步需要用户操作 Resend 后台和 PostHog 账号。
- 第 1 步依赖 KOL 抓取在收缩名单后仍然稳定运行。

## 待定问题

1. 原生内容主攻哪一两个平台（小红书、X、公众号、即刻）？
2. 博主合作的节奏：第 1 步就把 Frank/Serenity 拉进来，还是先用公开数据把引擎跑通？
3. 战绩（观点与之后走势对照）的展示边界：如何在合规上避免被解读为荐股？
4. 盘前早报、晚报、宏观周报是否并入「共识地图」叙事，还是维持现状作为背景内容？
5. 免费层与付费层的具体切分，以及价格。

## 附录 A：备份分支分类清单（第 0.1.6 步，2026-10-17，待用户确认后再合入）

方法：对备份 commit `f7fb671` 改过的 252 个文件做三方比较（旧本地 `67893fb` / 备份 / 线上基线 HEAD）。

| 类别 | 数量 | 含义 | 建议 |
|---|---:|---|---|
| A 与线上一致 | 77 | 这些改动已经上线，基线里已有 | 丢弃，无需操作 |
| B 只在本地 | 149 | 线上从没动过，只有本地改了 | 大部分合入（见下） |
| C 两边都改了 | 26 | 线上和本地各改各的 | 逐个处理（见下） |

**B 的构成**
- `docs/analysis/` 92 个：9–10 月的审计报告和证据。**合入**（这是 9 月到 10 月唯一的决策记录）
- `docs/plans/` 15 个：其中包括 `portfolio-first-refresh-*` 方案和概念图（约 8MB）。**合入文字，概念图待定**（已被本计划取代）
- `backend/tests/` 13 个：功能暂停、模型统一、persona 恢复、临时会话清理等测试。发布包不含测试，所以线上代码对应的测试只存在于备份里。**合入，并跑一遍确认和基线代码匹配**
- 约 20 个 `.context.md`、`AGENTS.md`（重写为 ~20 行的精简版）、`CLAUDE.md`（模型名改成 gemini-3.8-flash）、`docs/constraints/engineering-rules.md`（CLI 上传目录约定）、`docs/guides/llm-usage-metering.md`：**合入**，并与附录 B 的文档清理一起核对
- `docs/agents/` 3 个、`skills/kol-methodology-distillation/SKILL.md`：合入
- `.claude/settings.local.json`：个人权限配置，**不合入**，建议改为 git 忽略

**C 的处理**
- 线上更新、备份落后（以线上为准，丢弃备份版本）：`main.py`、`screener/research_agent.py`、`screener/router.py`、`kol_research/agent.py`、`llm_clients/structured.py`、`edge_functions/llm-usage.js`，差异主要是 Langfuse 观测和流式响应
- **备份里有、从没上线的功能**：`shared/kol_persona/tools.py` 的「按时间衰减的检索重排」（Recency-aware re-ranking，让旧观点不再压过新观点）。与「博主共识地图」直接相关，**建议作为独立改动重新合入并测试**
- 备份更新的测试：`tests/test_llm_clients_unit.py` 用的是 Gemini 的 `cached_tokens`/`thoughts_tokens` 字段，线上代码已统一 Gemini，**以备份为准**
- 备份多出的本地 env 加载：`core/config.py`、`scripts/enrich_tweet_canonical.py` 会读取 `backend/env`，但这个文件不存在。**丢弃**
- `docs/constraints/auth.md` 和其余 `.context.md`：两边都有有效更新，**手工合并**

## 附录 B：仓库冗余清单（2026-10-17，只列清单，未删除）

**1. 已暂停功能的代码**（9/04 起暂停，入口返回 403）。是否删除取决于重启后的取舍：

| 模块 | 规模 | 建议 |
|---|---|---|
| `frontend/src/app/kol/`（博主研究室） | 51 个文件 / 13.7k 行 | 共识地图可能复用其中的组件（观点时间线、板块观点），先保留，第 1 步后再定 |
| `watchlist_monitor`（后端 + `for-you/monitor` 前端） | 4.7k + 3.5k 行 | 删除候选（8/10 已软退休，9/04 暂停） |
| `zsxq_ingest` + `community_access` + `frontend/app/panda` | 3.4k + 0.7k + 0.6k 行 | 删除候选（Panda 合作暂停）；先确认合作是否结束 |
| `holdings_sync`、`portfolio_health`、`for-you/health` | 2.5k + 1k + 0.3k 行 | 删除候选（实仓同步只有 7 人用过） |
| `research_kb`、`onboarding` | 0.5k + 0.1k 行 | 删除候选 |
| `okx_mcp`、`frank_mcp`、`frontend/app/mcp`、根目录 `mcp/` | 0.9k + 0.2k + 0.1k + 2.9k 行 | 看 MCP 是否还作为分发渠道；你本机仍在用 `themarketbrew` MCP，先保留 |

**2. 看起来已废弃的旁支**
- `miniprogram/`（微信小程序，44 个文件 / 25k 行，最后改动 4/15；对应的 `wechat-users` 函数也没部署）：删除候选
- `frontend/src/app/frank-agent`、`frontend/src/app/qinbafrank`：旧落地页跳转，先确认是否还有外链指向
- `backend/vercel.json`（4/19 的实验配置，后端已在 Railway）：删除候选

**3. 重复或散乱的配置**
- 两套 migration 目录：根目录 `migrations/`（20 个）和 `backend/migrations/`（19 个）。合并为一处
- 根目录 `package.json` 里有前端依赖（tailwindcss、@vercel/analytics 等），应该只留 husky 和 lint-staged
- `CLAUDE.md` 和 `AGENTS.md` 两套 AI 指令内容重复，且 `CLAUDE.md` 已过时（例如「`services/`、`models/` 是死代码」，这两个目录其实已经不存在）。保留一份为主，另一份引用它
- `skills-lock.json` 在根目录和 `backend/` 各一份，外加 `.impeccable.md`、`.cclsp.json` 等工具配置。确认哪些还在用
- `backend/scripts/` 里有一批一次性脚本（Stripe 账户迁移 6 个、ultra→max 迁移、各种 backfill/audit）：已完成的移到 `backend/scripts/archive/` 或删除

**4. 文档**
- `docs/plans/active/` 有 13 个计划，大部分已停滞或被暂停：`ai-watchlist-monitor`、`watchlist-monitor-earnings-panel`、`panda-*`（3 个）、`okx-context-mcp`、`agent-file-image-transfer`、`cancel-ultra-merge-kol-to-max`、`onboarding-education-conversion`、`portfolio-first-refresh-proposal`。移到 `completed/` 或新建 `archived/`
- `docs/architecture.md` 已过时（仍写 Render 和旧模型，见 10/02 可靠性审视）

**5. 本机杂物（不在 git 里，只占磁盘）**
- `.codex/artifacts/` 1.3GB，其中 `railway-memory-2026-10-13/venv` 476MB。基线已收回 git，可以只保留各次的清单和补丁
- 各种 AI 工具的配置目录：`.augment/`、`.kilocode/`、`.qoder/`、`.qwen/`、`.roo/`、`.trae/`、`.windsurf/`、`.agents/`、`.gstack/`。用不到的可以删掉
- `skills/stripe-*`（3 个，git 忽略，像是被技能安装器放进来的）

**6. git 分支**：远端 42 个分支，大多是已合并的 `claude/*`、`codex/*`。确认后批量删除已合并的分支。
