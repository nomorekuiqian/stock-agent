# Panda 知识星球 Pipeline 自动化手册

这份手册给负责设计自动化流程的 Agent 使用。目标不是先写爬虫，而是先理解现有数据契约、入库方式、enrichment 和 embedding 的边界，再设计可重复、可审计、可回滚的自动化 pipeline。

## 目标

把现在的人工流程：

```text
同事手动抓取知识星球内容
  -> 手动整理为 threads.jsonl
  -> 手动运行入库 / enrichment / embedding
  -> Panda persona 可在 KOL Agent 里检索
```

改造成：

```text
授权采集 / 导出
  -> raw archive
  -> normalize + validate
  -> deterministic enrichment
  -> vector indexing
  -> audit + retrieval smoke test
```

自动化设计必须保持两个不变量：

- `threads.jsonl` 或等价 normalized JSONL 是可复现的 source of truth。
- 最终仍写入通用 vector 层，不要为 Panda 知识星球另建一套孤立 RAG 表。

## 当前系统事实

Panda 知识星球当前是 `pandacircle` persona 的一部分。它不是 Twitter/KOL tweet ingestion pipeline。

当前代码路径：

- `backend/scripts/index_zsxq_threads.py`：知识星球导出入库和 embedding 入口。
- `backend/app/features/vector/service.py`：通用 vector indexing / search orchestration。
- `backend/app/features/vector/chunking.py`：chunking 和 content hash。
- `backend/app/features/vector/embeddings.py`：通过 Insforge AI gateway 生成 embedding。
- `backend/app/edge_functions/vector-store.js`：写 `vector_documents` / `vector_chunks`，并提供 embed/search/upsert。
- `backend/app/shared/kol_persona/registry.py`：把 `pandacircle` persona 绑定到 `zsxq_thread` corpus。
- `backend/app/shared/kol_persona/tools.py`：`search_kol_tweets` 做 hybrid retrieval。

`pandacircle` 现在绑定两个 corpus：

| Corpus | `source_type` | Metadata filter | 说明 |
| --- | --- | --- | --- |
| Panda 知识星球 | `zsxq_thread` | `author_username=pandacircle` | 知识星球动态，一条 thread 是一个 vector document |
| Johnson/Panda 相关 X/Twitter | `kol_tweet` | `author_username=JohnsonZ91127`, `quality=keep` | 走 Twitter/KOL pipeline，不属于知识星球入库 |

这份手册主要讲第一条：Panda 知识星球。

## 当前入库流程

### 输入是什么

当前脚本读取一个清洗后的 JSONL 文件，默认路径来自：

```text
ZSXQ_THREADS 环境变量
或 /Users/kedeng/projects/zsxq/threads.jsonl
```

也可以显式传入：

```bash
cd backend
python scripts/index_zsxq_threads.py --input /path/to/threads.jsonl --dry-run
```

每一行是一条知识星球动态。脚本实际使用这些字段：

| 字段 | 用途 |
| --- | --- |
| `topic_id` | 最终 `source_id`，一条动态一个 document |
| `type` | 判断是否是 `q&a`，并进入 metadata 的 `topic_type` |
| `text` | 普通动态正文 |
| `question.text` | Q&A 的问题文本 |
| `answer.text` | Q&A 的回答文本，作为主要正文 |
| `title` | document title；缺失时取正文第一行 |
| `url` | document URL |
| `author.name` | 真实子作者，写入 `source_author_username` |
| `author.role` | 过滤 owner / creator；也写入 `author_role` |
| `create_time` | `created_at` metadata 和 `report_date` |
| `tags` | 原样复用为 tags enrichment |
| `digested` | 是否精华 |
| `likes_count` | 热度 metadata |
| `group_name` | 来源圈子名 |

### 哪些内容会入库

`index_zsxq_threads.py` 会先做 eligibility 过滤：

- 只保留 `author.role` 是 `owner` 或 `creator` 的内容。
- 跳过空正文。
- 跳过明显的「欢迎加入知识星球」样板内容。
- `--min-chars` 默认是 `0`，可在 dry-run 后提高，用于过滤太短碎片。

Q&A 的正文逻辑：

- `question.text` 被保留为“提问”。
- `answer.text` 是主要可检索正文。
- 如果没有 answer，则 fallback 到 `text`。

普通动态的正文逻辑：

- 直接使用 `text`。

### 怎么写入

每条 eligible 动态会被转换为一个 `VectorDocumentInput`：

```text
source_type = zsxq_thread
source_id   = topic_id
title       = cleaned title
url         = rec.url
symbol      = tickers[0] if any
report_date = create_time[:10]
visibility  = public
content     = retrieval-friendly enriched text
metadata    = deterministic metadata
```

然后调用：

```python
app.features.vector.service.index_document(VectorIndexRequest(...))
```

所以它没有先写 `kol_tweets`，也没有单独的 `zsxq_threads` 业务表。当前入库就是直接进入通用 vector tables：

```text
vector_documents
vector_chunks
```

## 当前 Enrichment

Panda 知识星球当前只做 Tier 0 deterministic enrichment，不调用 LLM。

### content_type

`content_type` 由规则判断：

| 条件 | `content_type` |
| --- | --- |
| `type == "q&a"` | `qa` |
| 正文少于 150 字 | `fragment` |
| 正文大于等于 800 字 | `analysis` |
| 其他 | `note` |

### tags

`tags` 直接复用知识星球导出里的标签。它既进入 metadata，也会写进 embedded text 的头部。

### tickers

Ticker 用确定性词典匹配：

- 主词典来自 `app.features.kol_research.cockpit.TICKER_ALIASES`。
- 如果导入失败，fallback 到脚本内的小词典。
- 额外总是补充 crypto 相关 alias，例如 `COIN`、`MSTR`、`CRCL`、`HOOD`、`BTC`、`ETH`。

中文 alias 用 substring match；英文 alias 用 word boundary match；短全大写 ticker 采用大小写敏感匹配，避免把普通英文单词误判成 ticker。

### metadata

写入 metadata 的核心字段：

```text
persona_username = pandacircle
author_username = pandacircle
source_author_username = 知识星球真实子作者
author_role
is_research_assistant
created_at
topic_type
content_type
tags
tickers
digested
likes_count
group_name
```

注意：`author_username` 故意固定为 `pandacircle`，这是 retrieval pin。真实子作者放在 `source_author_username`，用于引用时显示 `@子作者 / persona @pandacircle`。

### enriched content

Enrichment 不只是 metadata。脚本会把 enrichment 写进要 embedding 的正文头部，因为 metadata 本身不会参与纯 semantic recall。

示意结构：

```text
来源: 潘大的科技交流圈（知识星球动态）
作者: <source_author_username>（<author_role>）
日期: YYYY-MM-DD
类型: <content_type> · 动态类型: <topic_type>
标签: #tag1# #tag2#
标的: NVDA, TSM
标题: <title>

提问: <question>   # 仅 Q&A

回答:
<body>
```

## 当前 Embedding

Embedding 由 `features.vector` 通用层完成。

### 幂等性

`index_document()` 会先计算正文 hash：

```text
content_hash = sha256(normalized_whitespace(content))
```

如果没有 `--force`，并且已经存在相同 `(source_type, source_id, content_hash)`，脚本会跳过该 document。

这意味着：

- 重跑同一份 export 是安全的。
- 只要正文或 enrichment 头部变了，就会产生新的 content hash。
- `--force` 主要用于同一 content hash 下刷新 metadata / chunks。
- 如果同一 `topic_id` 的正文被修正，旧 hash 对应的 document 可能仍在库里；自动化方案需要显式按 `(source_type, source_id)` 删除旧版本，或设计 reconcile/cleanup 步骤。

### Chunking

`chunk_document()` 会：

- 按 markdown heading 做 sectionize。
- 单 chunk 默认最多约 `3200` 字符。
- 长文用约 `350` 字符 overlap。
- 每个 chunk 前面加通用 header：

```text
Source: zsxq_thread
Source ID: <topic_id>
Title: <title>
```

每个 chunk 继承 document metadata。

### Embedding model

`embed_texts()` 调用 Insforge Edge Function：

```text
vector-store?action=embed
```

默认模型来自 `VECTOR_EMBEDDING_MODEL`，当前约定是：

```text
openai/text-embedding-3-small
```

当前 pgvector 维度是 `1536`。

### 写入表

`vector-store?action=upsert_document` 写：

```text
vector_documents
unique (source_type, source_id, content_hash)
```

`vector-store?action=upsert_chunks` 写：

```text
vector_chunks
unique (document_id, chunk_index)
```

chunk 行保存：

```text
content
metadata
embedding
embedding_model
source_type
source_id
title
url
symbol
report_date
visibility
```

## 当前检索怎么用这些数据

Panda Agent 的 `search_kol_tweets` 不只做向量搜索。它会对每个 persona corpus binding 跑 hybrid lanes：

- exact text search：标题、正文、metadata 关键字匹配。
- ticker metadata search：如果问题里识别到 ticker，会按 `metadata.tickers` 过滤。
- semantic vector search：query embedding 对 `vector_chunks.embedding`。

对 Panda 知识星球，检索过滤大致是：

```text
source_types = ["zsxq_thread"]
metadata.author_username = "pandacircle"
```

因此自动化 pipeline 的产物必须保持这两个字段，否则 Panda persona 搜不到。

## 自动化设计思路

### 1. 先固定数据契约，不要先固定爬虫

同事的 Agent 应先定义“自动化抓取后必须产出的 normalized JSONL schema”，并让它兼容当前脚本使用的字段。

建议保留两层产物：

```text
raw archive:
  原始抓取结果，尽量不改字段，按 batch/date 保存

normalized JSONL:
  兼容 index_zsxq_threads.py 的 threads.jsonl
```

不要让后续 embedding 直接依赖网页 DOM。网页结构变化时，只需要修 source adapter，不应该影响 enrichment/indexing。

### 2. 抓取层只负责“完整、去重、可恢复”

抓取层设计重点：

- 增量游标：保存 last seen `topic_id` / `create_time` / batch id。
- 幂等去重：同一个 `topic_id` 多次出现时，以最新完整版本覆盖 normalized record。
- 原文归档：每次抓取 batch 都落 raw file，方便回溯。
- 速率限制和重试：网络失败不能产生“空结果成功”。
- 登录态隔离：不要把 cookie/token 写入 repo；从本机 secret store 或 env 读取。
- 权限边界：只抓取已授权账号可访问的内容，不绕过平台访问控制。

### 3. Normalize 层要对齐当前字段

Normalize 输出至少要保证：

```json
{
  "topic_id": "required-stable-id",
  "type": "q&a or other type",
  "text": "plain text for non-Q&A",
  "question": {"text": "question text"},
  "answer": {"text": "answer text"},
  "title": "optional title",
  "url": "source url",
  "author": {"name": "sub-author", "role": "owner|creator"},
  "create_time": "YYYY-MM-DDTHH:mm:ss+08:00",
  "tags": ["AI", "半导体"],
  "digested": true,
  "likes_count": 12,
  "group_name": "潘大的科技交流圈"
}
```

如果抓取不到某些字段，要明确 fallback：

- 没 title：后续脚本会取正文第一行。
- Q&A 没 answer：后续脚本会 fallback 到 `text`，但 audit 应标记。
- 没 tags：允许空数组。
- 没 author role：不要默默入库；否则会被 eligibility 过滤或污染来源。

### 4. Enrichment 先保持 deterministic，再评估 LLM

Panda 知识星球 v1 不需要 LLM enrichment。自动化第一版应该复用当前 deterministic enrichment：

- content_type by rule。
- tags from export。
- tickers by alias dictionary。
- source author / role / date / digested / likes metadata。
- enrichment header baked into embedded content。

只有当检索质量不足时，再考虑第二阶段 LLM enrichment，例如：

- `summary_zh`
- `key_claim`
- `stance`
- `sector`
- `ticker_stances`

如果引入 LLM，必须把 LLM 输出写成结构化字段，并加：

```text
enriched_model
enriched_at
enrichment_version
enrichment_status
```

同时保留 deterministic fields，避免 LLM 失败导致基础检索不可用。

### 5. Embedding 继续走现有 vector service

不要新建 embedding client。自动化任务应调用现有入口之一：

- 直接复用 `backend/scripts/index_zsxq_threads.py`。
- 或把脚本里的 parse / prepare / index 逻辑抽成可调用 service，再由 cron/job 调用。

第一版建议先把现有脚本 job 化：

```bash
cd backend
python scripts/index_zsxq_threads.py \
  --input /path/to/normalized/threads.jsonl \
  --dry-run

python scripts/index_zsxq_threads.py \
  --input /path/to/normalized/threads.jsonl
```

上线自动化时，每个 batch 先 dry-run 产出 audit，再实际写 embedding。

### 6. Audit 是 pipeline 的一部分

自动化完成不等于脚本退出码为 0。每次运行应输出并保存：

```text
input total
selected count
dropped reasons
content_type distribution
assistant posts count
ticker coverage ratio
top tickers
multi-chunk docs count
indexed / skipped / failed
```

这些字段当前 dry-run 已经打印，自动化可以先采集 stdout，后续再改成 JSON report。

最小 smoke test：

- 随机抽 5 条 `topic_id`，确认 `vector_documents` 有对应 `(source_type=zsxq_thread, source_id=topic_id)`。
- 查 `vector_chunks.metadata.author_username == "pandacircle"`。
- 对一个确定有覆盖的 ticker 跑 `search_kol_tweets`，确认返回 Knowledge Planet chunk。
- 确认 citation 里能看到真实子作者，而不是全部显示成 `pandacircle`。

## 推荐自动化架构

```text
zsxq_fetch_job
  -> raw/zsxq/YYYY-MM-DD/<batch>.json
  -> normalize_zsxq_export.py
  -> normalized/zsxq/threads.jsonl
  -> index_zsxq_threads.py --dry-run --input ...
  -> audit report
  -> index_zsxq_threads.py --input ...
  -> retrieval smoke test
  -> notify success/failure
```

### 状态表或状态文件

最小可用版本可以用文件：

```text
state/pandacircle-zsxq.json
```

字段建议：

```json
{
  "last_success_at": "2026-06-18T00:00:00Z",
  "last_seen_topic_id": "123",
  "last_seen_create_time": "2026-06-17T12:34:56+08:00",
  "last_input_hash": "sha256",
  "last_index_summary": {
    "selected": 748,
    "indexed": 12,
    "skipped": 736,
    "failed": 0
  }
}
```

生产化后可以迁入 Insforge job table，但第一版不要为了状态管理阻塞主流程。

### 失败处理

| 失败点 | 正确行为 |
| --- | --- |
| 抓取失败 | 不生成空 normalized JSONL，不触发 indexing |
| normalize 失败 | 保留 raw batch，输出坏记录样本 |
| dry-run selected 异常下降 | 阻断实际 indexing，要求人工确认 |
| embedding 失败 | 保留 audit，允许重跑同一 input |
| 部分 document failed | 记录 topic_id，重试失败 subset |
| 检索 smoke test 无结果 | 标记 pipeline degraded，不报告成功 |

## 不要混淆的 Twitter/Panda companion pipeline

`pandacircle` 还检索 `JohnsonZ91127` 的 X/Twitter corpus。这条不是知识星球 pipeline。

如果要自动化 Twitter companion corpus，走现有 KOL tweet 流程：

```text
backfill_user_tweets.py
  -> kol_tweets
  -> enrich_tweet_canonical.py
       uses gemini-3.5-flash for image OCR / vision canonical text
  -> claude_enrich/fetch_for_enrich.py
  -> Codex in-session v3 classification
       content_type, key_claim, tickers, ticker_stances, sectors
  -> claude_enrich/push_enrichments.py
  -> index_kol_tweets.py
       source_type=kol_tweet
```

知识星球 v1 目前没有这套 LLM v3 classification，也没有 image OCR canonicalization。

## 给同事 Agent 的设计提示

请让 Agent 先回答这些问题，再写实现方案：

1. 抓取层能否稳定拿到 `topic_id`、正文、Q&A、作者、角色、时间、标签、URL？
2. raw archive 和 normalized JSONL 放在哪里？是否会被误提交？是否需要加密或脱敏？
3. 如何证明一次增量抓取没有漏页、没有把失败当成空结果？
4. normalized JSONL 是否能直接被 `index_zsxq_threads.py --dry-run` 消费？
5. dry-run 的 selected/dropped/ticker coverage 是否在合理范围？
6. 是否保持 `source_type=zsxq_thread` 和 `metadata.author_username=pandacircle`？
7. embedding 是否继续使用 `VECTOR_EMBEDDING_MODEL=openai/text-embedding-3-small`？
8. 如何验证 Panda Agent 真的能搜到新内容？
9. 如何回滚一次错误导入？内容修正时是否按 `(source_type, source_id)` 删除旧版本再重建？
10. 是否需要把当前脚本抽成 service，还是第一版 cron 直接调用脚本更简单？

## 第一版交付标准

第一版自动化可以很朴素，但必须满足：

- 能从授权来源生成 normalized `threads.jsonl`。
- 能重跑，不产生重复 chunk。
- 能在失败时停止，不把空数据写成成功。
- 能输出 audit report。
- 能调用现有 `index_zsxq_threads.py` 完成 embedding。
- 能跑 retrieval smoke test。
- 不修改 `pandacircle` 的 corpus binding。
- 不把知识星球内容误写进 `kol_tweets`。

做到这些后，再考虑更复杂的 LLM enrichment、dashboard、alerting、UI 审核台。
