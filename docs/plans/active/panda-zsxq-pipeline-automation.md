# Panda 知识星球 Pipeline 自动化设计

> 状态：设计已对齐，待写实现 plan。
> 关联文档：`docs/guides/panda-zsxq-automation.md`（数据契约手册）、`docs/plans/active/panda-community-agent.md`（消费侧 persona agent，非本文范围）。
> 日期：2026-06-21

## 1. 背景与现状

`pandacircle` persona 当前从两个 corpus 检索，本文只覆盖**知识星球**这条：

- corpus：`source_type=zsxq_thread`，`metadata.author_username=pandacircle`
- 一条动态（topic）= 一个 vector document，写入通用 `vector_documents` / `vector_chunks`

**当前是 4 段人工流程：**

| 段 | 工具 | 产物 |
| --- | --- | --- |
| 1. 抓取 | `zsxq-crawler-workspace`（FastAPI+React，浏览器 cookie） | 每群组 SQLite（`output/databases/{gid}/zsxq_topics_{gid}.db` 等） |
| 2. 归一化 | `zsxq-crawler-workspace/scripts/export_corpus.py` | `output/corpus/{gid}/threads.jsonl`（全保真，含评论/附件/标签） |
| 3. 入库/embedding | `stock-agent/backend/scripts/index_zsxq_threads.py` | Insforge pgvector |
| 4. 检索 | `shared/kol_persona/tools.search_kol_tweets` | 不变 |

工程师手动跑 1→2，把 `threads.jsonl` 交给另一名工程师跑 3。目标：端到端自动化 + 定时。

## 2. 关键约束（已验证）

**官方 API / MCP 对我们不可用。** 存在官方托管 MCP（`mcp.zsxq.com`，稳定 api_key）和 `zsxq-cli`（OAuth 永久 token）。实测：本账号（金黄，`user_id 841581241812212`）是 潘大的科技交流圈（`group_id 15554581218512`，群主 潘驴邓晓闲缺一 `15555428815112`）的**普通成员**，任意内容调用都返回：

> `该星球内容仅限成员在星球内查看，暂不支持通过 API 访问`

官方 API 仅对星球 admin 开放。作为普通成员，**只能用浏览器 cookie 爬虫**走 app 内部接口（`api.zsxq.com/v2/...` + 成员 session cookie），这正是现有爬虫工具一直在做的、且对该群组已验证可用（`output/corpus/15554581218512/` 已有产物）。

→ **cookie 会过期，cookie 刷新是 pipeline 的固有人工环节**（本设计唯一可接受的人工步骤），通过邮件通知管理员处理。

**两类"认证级"失败都需走刷新流程**（来自现有 crawler 实测）：HTTP `401`（cookie 过期）与 API `code=14210`（**会员/订阅过期**，星球付费成员身份失效）。两者都让本账号失去成员视图，必须邮件通知管理员（401→换 cookie；14210→续费成员身份）。

## 2.1 实代码 live 验证（2026-06-21，2 次只读请求，未写 Insforge）

用提供的测试 cookie 跑真实 `iter_topics`（生产代码路径，单页）验证：
- ✅ cookie 爬路径对 panda 群组可用（官方 API 被禁，cookie 内部接口返回内容）。
- ✅ 真实 topic 形状与 `crawl.py`/`normalize.py` 一致：`talk.{owner,text,images}`、无顶层 `hashtags`、标签来自 `<e type="hashtag">`。
- ✅ `creator_ids` 修复有效：非群主作者（如「超」`824454248122`）正确判为 `creator` 并入选（未被当作 member 丢弃）。
- ✅ normalize→indexing 产出正确：`author_username=pandacircle` pin + 真实 `source_author`，eligible 子集 prepared。

## 2.2 存量内容 + 幂等性验证（2026-06-21，只读）

Insforge 生产库**已有 748 个 `zsxq_thread` document / 880 chunk**（前工程师手动 `index_zsxq_threads.py` 入的 PoC；`embedding_model=openai/text-embedding-3-small`）。其 metadata 与本 pipeline 的 `indexing.py` **完全一致**（`author_username=pandacircle`、`source_author_username=<真实子作者>`、`content_type/topic_type/author_role/tickers`）。

**幂等性已对真实数据验证（5/5）**：对已入库的 5 个 topic，用本 pipeline（raw JSON → `normalize.py` → `indexing.py`）本地计算的 `content_hash` 与库内存量 `content_hash` **逐一字节相同**。结论：raw-JSON 归一化路径与旧 SQLite(`export_corpus.py`) 路径产出**逐字节一致的 embedded content** → **重跑存量 748 会 skip，不产生重复**。`content_hash` 即 vector 层的去重/检查点。

**对比 Twitter/X(`kol_tweet`) pipeline**：两者最终共用通用 vector 层（不同 `source_type`，无冲突），`pandacircle` 同时检索两个 corpus。差异：X 用稳定服务 API key，zsxq 用会过期的成员 cookie（→ 邮件刷新）；X 有 `kol_tweets` 领域表（可查询、LLM enrich 字段 canonical_*），zsxq **无领域表**（raw+normalized 存 bucket → 直接进 vector，`threads.jsonl` 为 source of truth，4 张表仅运维用）；X 做 LLM enrich，zsxq v1 仅 Tier-0。

## 3. 目标与不变量

**目标**：把 1→2→3 做成可重复、可审计、可回滚的自动化 pipeline，定时执行；Insforge 承载 infra（cron / 文件存储 / pgvector / 表 / 邮件触发），计算在现有 Railway Python 后端。

**不变量（不得破坏）**：

1. `threads.jsonl`（或等价 normalized JSONL）是可复现的 source of truth。
2. 最终写入通用 vector 层；不为知识星球新建孤立 RAG 表。
3. 保持 `source_type=zsxq_thread`、`metadata.author_username=pandacircle`、真实子作者放 `source_author_username`。
4. v1 只做 Tier-0 deterministic enrichment（content_type / tags / tickers），**不调用 LLM**。
5. embedding 继续走现有 vector service（`VECTOR_EMBEDDING_MODEL=openai/text-embedding-3-small`，pgvector 1536 维）。
6. 不改 `pandacircle` 的 corpus binding；不把知识星球内容误写进 `kol_tweets`。

## 4. 已对齐的决策

| # | 决策 | 选择 |
| --- | --- | --- |
| D1 | 计算位置 | **Python 后端**（Railway），Insforge 负责 cron/存储/db/邮件。复用现有 Python，对齐 Twitter KOL pipeline 模式，无 edge function 时长限制 |
| D2 | 抓取保真度 | **全保真 raw archive**：评论 + 附件 + 图片都进 archive（RAG 索引仍只 embed owner/creator 的 topic + Q&A + 专栏正文） |
| D3 | cookie 刷新 | cookie 存 Insforge 表（热更新，免重部署）；401 时 Resend 邮件给 `ADMIN_EMAILS`，含 token 保护的 `/api/zsxq/cookie` 管理端点链接，管理员粘贴新 cookie |
| D4 | 二进制文件 | **下载二进制**（附件/图片）进 Insforge bucket，做成自包含离线 archive |
| D5 | 增量/对账 | **v1 仅增量**（按游标每日增量爬）；提供手动全量重爬开关（`full=true`），但不定时跑全量对账 |

**采用的子方案：Raw-JSON archive + 轻量后端爬虫**（self-contained 在 stock-agent 内）。爬虫分页拉 `api.zsxq.com/v2` 的 topic + 评论，把**原始 zsxq JSON 响应**按日期/batch 存进 Insforge bucket；normalizer 读 raw JSON → 全保真 `threads.jsonl`，复用 `export_corpus.py` 的 `clean_text` / `_render_e_tag` / 角色判定逻辑。
（被否方案：把 crawler 工具 278KB 的 FastAPI 爬虫引擎 vendor 进来——耦合外部 repo，难维护。）

## 5. 架构（端到端）

```text
Insforge Schedule（每日）
  → cron-trigger.js  [新 job: zsxq_panda_ingestion，短超时校验 accepted]
      → POST {BACKEND_URL}/api/zsxq/ingest   (X-Cron-Secret)
          ── 立即返回 {accepted:true, run_id}，后台异步执行 ──
          （爬虫刻意慢：页间随机秒级延迟 + 每 N 页 3–5 分钟长休眠，
            全量回补可能数小时，故必须异步，不能同步等待）
          1. CRAWL     从 Insforge 表读 cookie → 按游标增量分页拉 topics
                       + 拉每条 topic 的评论 → 下载附件/图片二进制
                       → 原始 JSON + 二进制 archive 到 Insforge bucket:
                         raw/zsxq/{gid}/{date}/{batch}.json
                         raw/zsxq/{gid}/files/{topic_id}/...
                       → 每个 topic_id 写 thread ledger（见 §7.4）
          2. NORMALIZE raw JSON → 全保真 threads.jsonl（复用 export_corpus 清洗）
                       → archive 到 bucket: normalized/zsxq/{gid}/threads.jsonl
          3. AUDIT     dry-run 分布报告；GATE：selected 相对上次异常下降则中止入库
          4. INDEX     复用 index_zsxq_threads service → pgvector
                       （content_hash 幂等；只 embed owner/creator 子集）
          5. SMOKE     抽样 topic_id 校验 vector_documents + 跑一次
                       search_kol_tweets；无结果 → 标记 degraded
      → 全程更新 zsxq_ingest_runs（run 级）+ zsxq_thread_ledger（thread 级）
  进度/结果真相源 = ledger + runs 表（非 HTTP 返回值）
  失败（任一步骤）→ 见 §9 失败处理表

CRAWL 遇 401 / code=14210（认证级失败）:
  → Resend 邮件给 ADMIN_EMAILS，含 token 保护的 /api/zsxq/cookie 链接
  → 管理员粘贴新 cookie / 续费成员 → 写回 zsxq_credentials 表 → 下次 cron 自动恢复
```

> **同步还是异步**：cron-trigger 的 job step 设短超时（如 30s），后端 `/api/zsxq/ingest` 收到后落 `zsxq_ingest_runs` 一行（`status=running`）并立即返回 `accepted:true`，真正的 crawl→…→smoke 在后台任务里跑（对齐现有 `watchlist_monitor_paid_universe` 的 accepted 模式）。下次 cron 或 `/api/zsxq/runs/{run_id}` 读取最终状态。增量日常 delta 很小、跑得快；全量 `full=true` 回补才会数小时。

## 6. 新增组件：`backend/app/features/zsxq_ingest/`

遵循 feature 模块标准结构。每个 unit 单一职责、接口清晰、可独立测试。

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `crawl.py` | cookie-based zsxq API client：topic 分页 + 评论拉取 + 二进制下载 + raw-JSON/二进制 archive 到 bucket；逐 topic 写 ledger。**忠实移植**现有 crawler 的游标 offset / smart_delay / 长休眠 / 错误分流（§8）。检测认证级失败 → 触发邮件 | `shared/insforge`（bucket）、`httpx`、`zsxq_credentials`/`zsxq_thread_ledger` 表 |
| `normalize.py` | raw JSON → `threads.jsonl`（vendor `export_corpus` 的 `clean_text`/角色判定，改为读 JSON 而非 SQLite） | 无外部 |
| `indexing.py` | 把 `index_zsxq_threads.py` 的 parse/prepare/index 抽成可复用 service | `features.vector.service` |
| `service.py` | 编排 crawl→normalize→audit→index→smoke；后台异步执行，全程更新 runs + ledger | 上述 + `notification`（邮件） |
| `router.py` | `POST /api/zsxq/ingest`（`verify_cron_secret`，落 run 后立即 `accepted:true` 异步跑）+ `GET /api/zsxq/runs/{run_id}`（进度/ledger 聚合）+ `POST/GET /api/zsxq/cookie`（admin token） | `service` |
| `db.py` / `models.py` | Insforge 表读写（credentials/state/runs/ledger）+ Pydantic models | `shared/insforge` |

**重构**：`backend/scripts/index_zsxq_threads.py` 改为薄 CLI，调用 `zsxq_ingest.indexing` 的 service，使 CLI 和 endpoint 共用同一份 parse/prepare/index 逻辑（零重复）。CLI 行为与现状保持兼容（`--input` / `--dry-run` / `--force` 不变）。

## 7. 数据契约

### 7.1 raw archive（Insforge bucket）

- `raw/zsxq/{gid}/{date}/topics-{batch}.json` — 原始 topic 列表分页响应
- `raw/zsxq/{gid}/{date}/topic-{topic_id}.json` — 原始 topic 详情（含评论、附件/图片 URL）
- `raw/zsxq/{gid}/files/{topic_id}/{file_id}-{safe_name}` — 下载的二进制

raw archive 不做字段改写，最大保真、可回放。

### 7.2 normalized `threads.jsonl`

与 `index_zsxq_threads.py` 现用字段对齐（见 `docs/guides/panda-zsxq-automation.md` §Normalize）。每行一条 topic：`topic_id` / `type` / `text` / `question.text` / `answer.text` / `title` / `url` / `author.{name,role}` / `create_time` / `tags` / `digested` / `likes_count` / `group_name`，附 `comments[]` / `files[]` / `images[]`（全保真，索引层忽略）。

fallback 规则不变：缺 title → 取正文首行；Q&A 缺 answer → fallback `text` 并 audit 标记；缺 tags → 空数组；缺 author role → 不静默入库（被 eligibility 过滤）。

### 7.3 Insforge 表

- `zsxq_credentials`：`group_id`、`cookie`（密文/受限）、`status`（active/expired/membership_expired）、`updated_at`、`updated_by`。热更新，免重部署。
- `zsxq_ingest_state`（按 group）：`last_success_at`、`last_seen_create_time`、`last_seen_topic_id`、`last_input_hash`、`last_summary`（jsonb）。
- `zsxq_ingest_runs`（run 级，参照现有 crawler 的 `crawl_log`）：`run_id`、`group_id`、`crawl_type`（incremental/full）、`started_at`、`finished_at`、`status`（running/done/degraded/failed/auth_failed）、`pages_fetched`、`topics_seen`、`topics_new`、`topics_updated`、`comments_fetched`、`files_downloaded`、`indexed`、`skipped`、`failed`、`error_message`、`report`（jsonb：§8 AUDIT 全量分布）。

### 7.4 thread ledger（按要求新增——逐 thread 记录爬的过程）

现有 crawler **只有 run 级 `crawl_log`，没有逐 thread 状态**。本设计新增 `zsxq_thread_ledger`，让"总共有哪些 thread、每个 thread 处于什么状态"可查、可审计、可重试：

```text
zsxq_thread_ledger (
  group_id            text,
  topic_id            text,          -- 唯一键 (group_id, topic_id)
  first_seen_run_id   text,
  last_run_id         text,
  topic_type          text,          -- talk / q&a / task / solution / column
  author_role         text,          -- owner / creator / member / unknown
  create_time         text,          -- 原始 zsxq 时间
  content_hash        text,          -- 入库正文 hash（与 vector_documents 对齐）
  -- 逐阶段状态：pending / done / skipped / failed
  stage_crawled       text,          -- 原始 JSON 是否已抓
  stage_comments      text,          -- 评论是否已抓全（comments_count>8 才需补）
  stage_binaries      text,          -- 附件/图片二进制是否下完（含部分失败计数）
  stage_normalized    text,          -- 是否进了 threads.jsonl
  stage_indexed       text,          -- 是否写入 pgvector（skipped=hash 未变；非 owner/creator=skipped:not_eligible）
  drop_reason         text,          -- 若未入库：non_authored/empty/boilerplate/too_short
  binaries_total      int,
  binaries_failed     int,
  last_error          text,
  updated_at          timestamptz
)
```

**用途**：① 进度可观测（一次 run 扫了多少 thread、各阶段 done/failed 分布）；② 失败可定位重试（按 `stage_*=failed` 的 topic_id 重跑该阶段）；③ 与 `vector_documents` 对账（ledger 标 indexed 的 topic_id 应在库里有对应 `(zsxq_thread, topic_id)`）；④ 增量去重依据（已 `stage_crawled=done` 且 `create_time` ≤ 游标的可跳过）。run 结束时把 ledger 聚合进 `zsxq_ingest_runs.report`。

## 8. 各阶段细节

**CRAWL**（须忠实移植现有 crawler `zsxq_interactive_crawler.py` 的机制，逐项见下）：

- **endpoint**：`GET api.zsxq.com/v2/groups/{gid}/topics?scope=all&count=20[&end_time=...]`（成员 session cookie + stealth headers）。
- **游标分页**：取本页**最后一条** topic 的 `create_time`，**减去毫秒级 offset**，格式化为 `YYYY-MM-DDTHH:MM:SS.fff+0800` 作为下一页 `end_time`（避免重复抓边界 topic）。`resp_data.topics` 为空即到底。
- **增量停止**：增量爬按 `zsxq_ingest_state.last_seen_create_time` 游标，遇到 ledger 中已 `stage_crawled=done` 且时间 ≤ 游标的 topic 即停（对齐现有 `crawl_latest_until_complete`）；`full=true` 忽略游标全量回补。
- **评论**：timeline 内嵌 ≤8 条；`comments_count>8` 才单独分页拉 `GET /v2/topics/{tid}/comments`（按上一页最后评论 `create_time` 翻页，`max_retries≈10`）。评论失败不影响该 topic 入库。
- **二进制**：附件 `GET /v2/files/{file_id}/download_url` 取签名 URL 即时下载；图片用 topic JSON 内 URL。增量时 URL 新鲜，下载即时规避过期。失败计入 ledger `binaries_failed`，不阻断主流程。
- **限速（anti-ban，关键）**：页间 `smart_delay` 随机秒级延迟（历史爬更长）；每 N 页 `check_page_long_delay` **长休眠 3–5 分钟**；可中断 sleep（配合 stop flag）。日常增量保守低频（每日一次）。
- **错误分流**：`401`→cookie 过期 / `code=14210`→会员过期（均走认证级失败邮件流程）；`403`→访问被拒（更新 cookie/反检测）；`429`→频率限制（加大延迟）；可重试错误码按退避重试；网络失败/超时**不得当成"空结果成功"**。

**NORMALIZE**：raw JSON → `threads.jsonl`。复用 `export_corpus.clean_text`/`_render_e_tag`（`<e>` 标签、URL 解码、加粗/斜体还原）+ 角色判定（owner = 群主 user_id；creator = 发过主题/回答的人；member = 仅评论/提问）。

> **实测修正（Task 1.2，2026-06-21）**：raw zsxq topic JSON **没有顶层 `hashtags` 列表**——标签是 `talk.text` 里的 `<e type="hashtag" title="%23AI%23" />` 内联标签，须在 `clean_text` 渲染前扫描原文提取。正文作者在 `talk.owner.{user_id,name}`（talk 类型）；`show_comments` 为可选。**对 Phase 2 crawler 的约束**：raw archive 必须原样保留含 `<e>` 标签的 `text`，否则标签丢失。真实 topic JSON 顶层键：`topic_id/topic_uid/group/type/talk/annotation/likes_count/comments_count/reading_count/readers_count/digested/sticky/create_time/user_specific/title/columns`。

**AUDIT（gate）**：复用 `index_zsxq_threads` dry-run 分布（total/selected/dropped/content_type/ticker coverage/multi-chunk）。GATE：`selected` 相对 `last_summary` 异常下降 → 中止 INDEX，要求人工确认。报告写 `zsxq_ingest_runs` + bucket。

**INDEX**：`indexing` service 处理 owner/creator eligible 子集 → `index_document()`。`content_hash` 幂等，重跑安全。

**SMOKE**：抽 5 个本次 topic_id 校验 `vector_documents` 有对应 `(zsxq_thread, topic_id)`；校验 `vector_chunks.metadata.author_username == pandacircle`；对一个有覆盖的 ticker 跑 `search_kol_tweets` 确认返回知识星球 chunk + 引用显示真实子作者。无结果 → degraded，不报成功。

## 9. 失败处理（对齐手册失败表）

| 失败点 | 行为 |
| --- | --- |
| 抓取失败 | 不生成空 normalized JSONL，不触发 indexing；保留已抓 raw；run 标 `failed` |
| 认证级失败（401→`cookie_expired` / 403→`access_denied` / code=14210→`membership_expired`，均由 `ZsxqAuthError.kind` 携带） | 标记 `zsxq_credentials.status`，run 标 `auth_failed`，发邮件（三种 kind 都属认证级失败，都通知管理员），本次中止 |
| 429（`ZsxqRateLimitError`） | crawler 内已做一次退避；**orchestrator 须捕获并施加更长冷却**后再续爬；持续失败则中止记录，不当成功 |
| 评论页遇 anti-crawl 码 1059 | crawler 内按 `_GLOBAL_MAX_RETRIES=10` + 2/5/10s 退避重试（与 topic 抓取一致），仍失败则返回部分评论不阻断 topic |
| normalize 失败 | 保留 raw batch，输出坏记录样本 |
| dry-run selected 异常下降 | GATE 阻断 indexing，要求人工确认 |
| embedding 失败 | 保留 audit，允许重跑同一 input |
| 部分 document failed | 记录 topic_id，重试失败 subset |
| 二进制下载失败 | 不阻断主流程；记录失败 URL，可重试 |
| smoke test 无结果 | 标记 degraded，不报告成功 |

## 10. 幂等 / 检查点 / 回滚

- `index_document()` 的 `(source_type, source_id, content_hash)` 唯一约束保证重跑不产生重复 chunk。**已对存量 748 验证 5/5 hash 一致**（§2.2）——重跑 skip。
- **检查点是三层，与 `threads.jsonl` 无关**（`threads.jsonl` 只是每次 run 的归一化快照，存 bucket 供审计/replay，不是状态源）：
  1. `zsxq_ingest_state.last_seen_create_time` —— 增量游标（从哪继续爬）。
  2. `zsxq_thread_ledger` —— 逐 topic stage 状态（中途崩溃后据此续跑）。
  3. vector 层 `content_hash` —— 已入库即 skip。
- **原文双archive**：raw API JSON（`raw/zsxq/...`，最高保真、可 replay/重归一化）与归一化 `threads.jsonl` 都保留 —— 比 X（只有 `kol_tweets`）更稳，且为未来 LLM re-enrich 留出「无需重爬即可重处理」的源。
- **LLM enrich 扩展位**：metadata 写 `enrichment_version`（v1=`tier0-v1`）+ `enrichment_status`（v1=`deterministic`），均为 **metadata-only、不进 embedded content**（故不改 content_hash、不破坏存量幂等）。未来 LLM tier 只需 bump version/flip status；新增结构化字段直接进 `metadata` jsonb（无需改表，类比 X 的 `canonical_*`）。存量 748 在 force 重建或 metadata backfill 前不带该键（向后兼容）。
- **re-enrich 的代价**：若未来 LLM enrich 改动 embedded content → 新 content_hash → 需按 `(source_type, source_id)` 删旧再 re-embed（`delete_vector_source` 已具备）。这是「baked-into-content 提升 recall」的已知取舍。
- **回滚/内容修正**：`delete_vector_source("zsxq_thread", topic_id)` 删旧版本再重建。v1 仅增量，编辑/删除不自动传播，需手动 `full=true` 全量重爬 + reconcile。

## 11. Insforge infra 落地（用 insforge-cli skill）

- **Schedule**：新增每日触发 `cron-trigger.js?job=zsxq_panda_ingestion`。
- **edge function**：`cron-trigger.js` 增加 `zsxq_panda_ingestion` job（一步：POST `/api/zsxq/ingest`，校验返回 report 的 `success` / `degraded` / `failed`）。
- **bucket**：raw archive + normalized JSONL + 二进制。
- **db**：§7.3 三张表（迁移用 `insforge db sql`）+ 既有 `vector_documents`/`vector_chunks`。
- **邮件**：复用 `notification` / Resend，发给 `ADMIN_EMAILS`。

## 12. 测试策略

- **单元**：`normalize.py`（raw JSON fixture → 期望 threads.jsonl，含 `<e>` 标签/Q&A/角色/缺字段 fallback）；`crawl.py` 分页游标与限速（mock httpx）；audit gate 阈值。
- **集成**：用一份固定 raw JSON fixture 跑 normalize→audit→index(dry-run)，断言分布在合理范围。
- **回归**：重构后 `index_zsxq_threads.py` CLI 对同一 `threads.jsonl` 产出与现状一致（dry-run 输出对比）。
- **smoke**：§8 SMOKE 即 pipeline 内置 smoke test。

## 13. 技术风险 / 难点（需记录，按要求与用户讨论）

1. **cookie 无法全自动获取**：zsxq 登录是扫码/短信，成员 session cookie 必须人工从浏览器 devtools 抓取。这是设计接受的唯一人工步骤（邮件通知 + 管理端点粘贴）。无法消除。
2. **限速 / 反爬**：`api.zsxq.com/v2` 高频访问可能触发风控甚至封号。必须保守限速 + 退避；建议低频（每日一次）增量。
3. **二进制存储成本**：全保真下载附件/图片，bucket 占用随时间增长；需关注 Insforge bucket 配额/计费，可能需保留策略。
4. **签名 URL 过期**：zsxq 媒体 URL 带签名有效期；增量爬时即时下载可规避，但历史回补/全量重爬旧 topic 时 URL 可能已失效（部分二进制不可得）。
5. **计算不在 Insforge**：用户要求"尽可能在 Insforge"，但 D1 选择 Railway 后端承载计算（复用 Python + 规避 edge function 时长限制）。Insforge-native 的是 cron/bucket/pgvector/表/邮件触发。纯 Insforge edge function 爬虫方案因时长限制 + 跨语言被否，作为权衡记录。
6. **normalize 重写**：`export_corpus.py` 读 SQLite 聚合，本方案改读 raw JSON——清洗函数可复用，但 topic/评论/附件/标签的聚合逻辑需按 JSON 结构重写并测试。
7. **Insforge bucket 能力待确认**：存大体积二进制 + 批量 JSON 的 API/限制需在实现前用 insforge-cli 验证。
8. **爬虫刻意慢 → 必须异步**：现有 crawler 页间秒级延迟 + 每 N 页 3–5 分钟长休眠，全量回补可能数小时；ingest 必须 accepted + 后台跑，进度落 runs/ledger 表，不能同步等待（否则 cron/HTTP 超时）。后端进程重启会中断长跑任务，需支持按 ledger 断点续爬。
9. **忠实移植的成本**：crawler 的游标 ms-offset、stealth headers、smart_delay/长休眠、429/403/401/14210 分流、评论分页（>8）、可重试错误码等都需逐项移植并测试；偷工会直接导致漏页或封号。

## 14. 不在 v1 范围（v2 候选）

- LLM enrichment（`summary_zh` / `key_claim` / `stance` / `sector` / `ticker_stances`）+ `enriched_model`/`enriched_at`/`enrichment_version`/`enrichment_status` 字段。
- 定时全量对账（自动传播编辑/删除）。
- 审核台 UI / dashboard / alerting。
- 多群组扩展（本设计聚焦 `15554581218512` 单群组，但表结构按 group_id 设计以便扩展）。

## 15. v1 交付标准（对齐手册）

- 能从授权 cookie 自动生成 normalized `threads.jsonl`。
- 能重跑不产生重复 chunk。
- 失败时停止，不把空数据写成成功。
- 输出 audit report。
- 复用 `index_zsxq_threads` 完成 embedding。
- 跑 retrieval smoke test。
- 不改 `pandacircle` corpus binding；不误写 `kol_tweets`。
- cookie 过期能邮件通知管理员并支持热更新。
