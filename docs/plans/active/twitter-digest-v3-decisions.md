# Twitter Digest V3 Implementation Decisions Log

> Created: 2026-05-04
> Purpose: 在 V3 一次性实现期间,我对没有明确答案的细节做了哪些决定。每条都列出 (问题, 我的决定, 理由)。Ke 后续可以推翻或确认。

## 1. `kol_tweets.symbols` 列的 schema 演进

**问题**: 旧的 `symbols` 是一个 array (`["NVDA", "INTC"]`)。V3 要换成 object (`{quality, ..., tickers, sectors, events}`)。

**决定**: 直接用新的 object 形式覆盖,不做向后兼容。

**理由**:
- Phase 1 的 array 形式从来没大规模写过(plan 里写"留位")
- 兼容两种形式会让所有读路径变复杂
- enrichment cron 会把所有 36h 内的旧推文增量重写为新形式
- 如果有遗留 array 数据,enrichment cron 会把它当作"未 enrichment"重新处理

**风险**: 万一生产已经有 array 形式的 symbols 数据,要先迁移再上线。
**Ke 复核**: 生产 `kol_tweets.symbols` 现在是空还是已有数据?

## 2. `quality_features` 用枚举字符串还是结构化对象

**问题**: 5 个特征 (data, reasoning, catalyst, comparison, risk) 该如何在 schema 里表达。

**决定**: 用 `list[str]` + `Literal` 限定值。例如 `["data", "reasoning"]`。

**理由**:
- 简单、易于查询(JSONB 包含查询)
- LLM 输出稳定
- 后续要做 KOL 画像 / 趋势分析时容易聚合

## 3. `content_summary_zh` 长度

**问题**: plan 写 "15-40 字",该硬约束还是软约束?

**决定**: schema 软约束 (`max_length=80`,留 buffer),prompt 强 instruct 15-40 字。

**理由**:
- 太严会导致 pydantic 校验失败,整个 enrichment 中断
- 软约束 + prompt 已足够引导
- 80 字给 LLM 一些缓冲空间

## 4. `enriched_at` / `enriched_model` 写在哪

**问题**: 写到 `symbols` JSONB 里(随 quality 一起),还是放成独立列?

**决定**: 写到 `symbols` JSONB 里,不加新列。

**理由**:
- 避免改动 `kol_tweets` 表 schema(权限和迁移成本)
- 这两个字段查询频率低,不需要单独索引
- 如果将来要做 model 版本统计,JSONB 路径查询足够

## 5. Edge function actions for enrichment

**问题**: `kol-tweets` edge function 已有很多 action。新增 enrichment 相关的怎么命名?

**决定**:
- `list_unenriched`(GET): 拉 `symbols IS NULL` 且 `created_at >= since` 的推文
- `upsert_enrichment`(POST): 单条或批量更新 `kol_tweets.symbols`

**理由**:
- 命名和现有的 `list_batch` / `upsert_batch` 风格一致
- 写操作走现有 EDGE_FUNCTION_SECRET 鉴权

## 6. Quality filter 在哪一层做

**问题**: digest pipeline 的 `pull_candidate_tweets` 现在拉所有 36h tweets。V3 应该只拉 high+medium。该在 edge function 层过滤还是 Python 层?

**决定**: Python 层过滤(`pull_candidate_tweets` 内部)。

**理由**:
- edge function 接口保持稳定,不变签名
- Python 层有更明确的日志(low 被丢了多少条)
- 性能差异可忽略(36h 推文最多几百条)

## 7. V2 → V3 backward compatibility 怎么做

**问题**: 已有 V2 数据存在 `kol_daily_digests` 表中。V3 上线后旧的页面能不能继续读?

**决定**: 双 schema 并存:
- DB 加 V3 列(headline / intro / topics / briefs / solo_voices / crosscut / watch_next / schema_version)
- 不删 V2 列(macro_picks / industry_picks / stock_picks / takeaway)
- `DailyDigest` model 同时含 V2 和 V3 字段,V2 字段对 V3 行而言就是 `[]`
- 前端按 `schema_version` 分路渲染:`v3` 走新组件,`v2` 走旧组件

**理由**:
- V2 数据有价值(几天的真实输出),不该作废
- 双路径在 schema_version 推广完成后(比如 30 天)再清理旧代码
- 风险可控:V2 写路径不再触发,只读

## 8. `EnrichmentOutput` schema 是否需要 prefilter 已知 ticker 词典

**问题**: ticker 词典反查校验放在 LLM prompt 里,还是 Python 后处理里?

**决定**: 双重保险:prompt instruct + Python 后处理过滤。

**理由**:
- prompt 防止 LLM 把"DCA" / "ETH" / 用户名当 ticker
- Python 后处理用一个"已知 ticker 集合"再过一遍,词典外的(且非纯数字 A 股代码)丢弃
- 词典初始集合用一个简单的"全大写 2-5 字符 + 是 NASDAQ/NYSE 的常见 ticker"来近似,后续可以接 FMP/yfinance 完整列表

## 9. Topic 的 stance_distribution 字段怎么生成

**问题**: 是 LLM 直接输出(可能写错)还是 Python 后处理计算?

**决定**: Python 后处理基于 `key_arguments[].stance` 计算。LLM 只输出 `key_arguments` 的 stance,Python 数 bullish/bearish/neutral 拼字符串。

**理由**:
- LLM 数数不可靠
- 计数和拼字符串是确定性逻辑,放 Python 更稳

## 10. Brief 的 `one_liner_zh` 是直接复用 `content_summary_zh` 还是 LLM 重写

**问题**: plan 说"直接用 summary",但 LLM 在 digest 阶段是否需要做 contextual 调整?

**决定**: 默认直接用 `content_summary_zh` 作为 brief 的 `one_liner_zh`,**Python 后处理填充**,LLM 不重写。

**理由**:
- 减少 LLM 输出 token
- summary 已经是该推文的客观描述
- 节省 pro context 给 topics 综合用

## 11. 测试环境"生成"按钮可见性

**问题**: 怎么判定"测试环境"?

**决定**: 用 `process.env.NEXT_PUBLIC_API_URL` 是否包含 `localhost` 或 `staging`,在客户端渲染时判断。

**理由**:
- 我没找到现有的环境变量(`NEXT_PUBLIC_ENVIRONMENT` 之类),暂用 URL 嗅探
- prod 上 API URL 是 themarketbrew.com,绝对不会匹配
- 后续可以加专用的环境变量

**Ke 复核**: 是否需要加一个 `NEXT_PUBLIC_ENVIRONMENT=development|production` 环境变量来更显式地判断?

## 12. Cron 鉴权方式

**问题**: enrichment endpoint 沿用现有的 `verify_admin_or_nonprod_or_cron`?

**决定**: 沿用。不新增鉴权 dep。

**理由**:
- 和 `/api/twitter-digest/generate` 一致
- nonprod 可以手动调
- prod 只有 cron 能调(走 X-Cron-Secret header)

## 13. Enrichment 失败时是否阻塞 digest cron

**问题**: 如果 enrichment cron 失败,06:00 的 digest cron 会用 unenriched 数据生成低质量结果。要不要 hard fail?

**决定**: digest pipeline 看到 unenriched 推文(symbols IS NULL)就**跳过它们**,不阻塞。但如果 36h 内 enrichment 覆盖率 < 50%,日志 warning。

**理由**:
- 优先保证 digest 出 — 哪怕只用 50% 推文,也比没有强
- Warning 让运维注意 enrichment cron 的健康度
- Hard fail 等于 enrichment 一挂全挂,运营风险大

## 14. `model_version` 字段在 V3 怎么写

**问题**: V2 用 `model_version="gemini-3.1-pro-preview"`。V3 涉及 enrichment(flash-lite) + digest(pro) 两个模型。

**决定**: `model_version = "v3:enrich=flash-lite/digest=pro-preview"` 或类似格式,把两个模型都记下来。

**理由**:
- 重跑 / 回归排查时知道每个阶段用的是什么
- 字符串格式比 JSON 简单且向后兼容(旧 model_version 是 string)

---

## Codex 二次审查结果(2026-05-04 实施完毕后)

用 `/codex` 跑了一遍独立 review。codex 找出 11 条真问题。已经直接修复 7 条,延后处理 4 条(下面 #15-#18 记录)。

### 已修复(实施期间)

1. **SoloVoice.tweet_type 用 `str` 而不是 Literal** — 改成 `Literal["thread", "article"]`,前端 TS 同步。LLM 偶尔会输出 `original` 类型,Literal 会在 pydantic 校验阶段直接拒绝。
2. **Ticker 子串匹配** — `META` 会匹配 `metaverse`。改成 word-boundary regex `(?<![A-Z0-9])\$?TICKER(?![A-Z0-9])`,加测试。
3. **`participating_kols` 只在为空时才重算** — 改成始终从 `key_arguments` 重算覆写。LLM 给错名单不会持久化。加测试。
4. **`Topic.key_arguments` / `SoloVoice` 不校验 tweet_id 来自输入** — 新增 `_enforce_source_provenance()`:丢掉 tweet_id 不在 raw_by_id 的 args/briefs/solos;solo 还要求源 `quality=high` 且 `tweet_type ∈ {thread, article}`。加 2 个测试。
5. **edge function fail-open** — `EDGE_FUNCTION_SECRET` 缺失时 POST 现在 fail-closed (503),不再放行。生产 misconfig 不再变成公网写入口。
6. **`list_unenriched` 跳过 legacy V2 array `symbols`** — JS 端 post-filter:除了 `symbols IS NULL`,Array / 缺 `quality` key 也算"需 enrichment"。
7. **email + 前端 URL 注入** — 新增 `_twitter_digest_safe_tweet_url` / `_twitter_digest_safe_user_url`(后端 Python)+ `safeTweetUrl` / `safeUserUrl`(前端 TS)。所有 V3 + V2 模板里的 `href={tweet_url}` / `href=https://x.com/{username}` 都过白名单(只接受 `https://x.com/<handle>/status/<digits>`)。加 2 个测试。

### 延后处理(已记录,以下 #15-#18)

## 15. 非原子的 upsert_digest

**问题**: `upsert_digest` 是 read-then-upsert(先读 generated_at 再写),并发场景下旧结果仍可能 last-writer-wins 覆盖新结果。

**决定**: 暂不修。当前 cron 设计是单路触发(每天一次,有 retry 但顺序串行),并发风险低。

**理由**:
- 修复需要 Insforge 的 RPC / DB-side trigger,工作量大
- 当前真实并发 = workflow_dispatch 手动触发 + cron 同时运行,概率极低
- 监控:如果观察到 last-writer-wins 实际发生,再补 `IF generated_at > existing` 的 RPC

**Ke 复核**: 是否需要在 V3 上线前修?我的建议是不修,等到 Phase 3 邮件发送实装后(那时多触发路径增多)再重新评估。

## 16. enrichment 覆盖率不足时只 warning

**问题**: `pull_candidate_tweets` 在 unenriched 比例 > 50% 时只 log warning 但继续生成 + 持久化。如果 05:30 enrichment 延迟,06:00 digest 会用部分样本生成低质量 digest 并覆盖。

**决定**: 暂不改 hard-fail。

**理由**:
- 当前空生成保护(`_digest_is_empty` 检查)已经避免空覆盖
- 部分覆盖 > 完全没有 digest
- 如果觉得覆盖率必须达标,可以把阈值改成 80%/90% 而不是 50%,但首版先观察实际覆盖情况
- cron 设计:enrichment 失败会 issue,运营层面会知道

**Ke 复核**: 上线后第一周要看 enrichment 覆盖率分布,决定是否加 hard-fail 阈值。

## 17. cron 时序 30 分钟可能不够

**问题**: enrichment cron BJT 05:30 触发,digest cron BJT 06:00。GitHub Actions cron 可能延迟 5-30 分钟,加上 enrichment 自己最长 900s,理论上 enrichment 还在跑时 digest 已经开始。

**决定**: 暂不改成 workflow 依赖(`needs:`),保持两个独立 cron。

**理由**:
- workflow `needs:` 只能在同一个 workflow 文件内,跨 workflow 依赖需要 `repository_dispatch` 或 GitHub API,工作量大
- 当前缓冲是:enrichment 真实 batch ~25 条 / 一天 ~200 条 = 8 batches × 几十秒 < 5 分钟实际跑,30 分钟够
- 如果 enrichment 延迟,digest pipeline 自带 unenriched 过滤,跳过未 enrichment 的推文,影响是当天 digest 缺一些内容,不是 fatal

**Ke 复核**: 上线第一周看实际跑时,需要时再调间隔到 60 分钟,或改 workflow 编排。

## 18. 邮件 V2 path 也有 URL 注入(更早就存在)

**问题**: codex 指出 V2 模板原来也有 `href={url}` 不校验。

**决定**: 一并修了(在 _twitter_digest_tweet_card 里改 url 来源)。

**理由**:
- 同一个 helper 顺手覆盖,减少未来事故面
- V2 是 backward compat 路径,虽然新数据不写 V2,但旧 V2 持久化数据仍会被读取并渲染,所以也得修

