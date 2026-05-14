# KOL 蒸馏工程方案 v1：分类 + 方法论提取

> Status: 阶段 2 已合并到 V3 enrichment 并跑通，阶段 3 首批 qinbafrank L1 产物已完成
> Created: 2026-05-05
> Revised: 2026-05-14（阶段 3 执行记录）
> Parent: `docs/plans/active/kol-methodology-distillation.md`
> Scope: 阶段 2（分类）+ 阶段 3（方法论提取）的可执行工程细节
> 不在本方案范围: MVP-1~5（L2 RAG / L4 / L5 / 对话装配 / 前端），将在 L1 接近完成时另写 v2

---

## 2026-05-05 修订摘要

**最初设计**：阶段 2 是一条独立的"分类管道"（`classifier.py` + 9 类 + ticker 抽取），写 `category` 列 + `symbols` 数组。

**实际撞上的问题**：master 分支已经有未提交的 V3 enrichment 工作（`twitter_digest/enrichment.py`），它对每条推文做了几乎完全重叠的工作（quality / tickers / sectors / events / content_summary_zh），并把结果写到同一个 `symbols` 列（富对象形态）。两个管道在抢同一列，且都要跑一次 LLM。

**用户决议（合并方案）**：阶段 2 不再是独立管道，而是**给 V3 enrichment 加一个 `category` 字段**：

- ✅ 一次 LLM 调用同时产出 V3 的 6 字段 + 我的 `category`
- ✅ 写两处：`symbols` JSONB（V3）+ `category` TEXT 列（用既有索引）
- ✅ 删除并行的 `classifier.py` 三件套和 `/api/twitter/classify` 端点
- ✅ Edge function 只在 `upsert_enrichment` 加一个 category 字段、`list_unenriched` 加 username 过滤
- ✅ 加一个 `POST /api/twitter-digest/enrich-backfill?username=&limit=` 端点用于历史回填

详见下方修订后的「3. 阶段 2」章节。**section 4（阶段 3 方法论提取）不变**——它读的就是 `category` 列，无论填它的是哪条管道。

## 2026-05-14 阶段 3 执行记录

阶段 3 已工程化为：

- `backend/app/features/twitter/methodology_models.py` — `CategoryMethodology` schema
- `backend/app/features/twitter/methodology_prompts.py` — extraction prompt `v1.1`
- `backend/app/features/twitter/methodology_extractor.py` — category 读取、ADK 提取、YAML/审阅产物保存、evidence quote 修复与校验
- `POST /api/twitter/extract-methodology` — cron-secret protected 管理端点
- `backend/app/features/twitter/methodologies/qinbafrank/` — 首批 L1 方法论包

当前 qinbafrank 生成结果：

| Category | Source tweets | Output | Evidence validation |
|---|---:|---|---|
| `stock_analysis` | 296 | `stock_analysis.yaml` | pass |
| `macro_analysis` | 621 | `macro_analysis.yaml` | pass |
| `sector_analysis` | 202 | `sector_analysis.yaml` | pass |
| `methodology` | 53 | `methodology.yaml` | pass |
| `trading_strategy` | 23 | `trading_strategy.yaml` | pass, sparse |
| `risk_management` | 6 | not generated | evidence-insufficient |

每次提取会同时生成：

- `<category>.yaml` — runtime 可读取的结构化 L1 方法论
- `extraction_log/<date>-<category>-<version>.json` — schema 原始 JSON
- `extraction_log/<date>-<category>-<version>.md` — 人工审阅报告
- `extraction_log/<date>-<category>-<version>.prompt.md` — 当次完整 prompt
- `extraction_log/<date>-<category>-<version>.holdout.md` — 阶段 4 回测候选样本

剩余工程工作转入阶段 4 回测，以及 MVP-1/L2 RAG、L4 data lens、L5 sources 的工程化。

---

## 1. 范围说明

母 plan（`kol-methodology-distillation.md`）锁定了产品方向和 MVP 范围，但留下了大量工程决策没定。本方案把以下决策**全部锁死**，让任何执行者照着写代码就行：

- 分类 prompt v1 的具体内容
- DB / Edge function 的精确改动
- 服务层函数签名
- API 端点契约
- 失败处理与可恢复性策略
- 成本估算与批次参数
- Definition of Done

如果实施过程中发现某条决策错了，回到这里改，不要在代码里偏离方案不留记录。

## 2. 已就位的基础设施（不动）

实施前先确认这些**已经在 master 分支可用**，不需要重做：

- `kol_tweets` 表：含 `category TEXT`、`symbols JSONB` 列，索引齐
- `twitter_fetch_runs` 表：含 `run_id` / `status` / 计数 / 时间戳
- Edge function `kol-tweets.js`：已有 `upsert_batch`、`list`、`list_batch`、`stats`、`update_categories_batch`、`start_run`、`finish_run`、`list_runs`
- `db.py`：已封装 `upsert_tweets_batch`、`get_tweets`、`get_tweet_stats`、`update_categories_batch`、`start_fetch_run`、`finish_fetch_run`、`list_fetch_runs`
- `service.py`：TwitterAPI.io 客户端已通
- `router.py`：采集类端点齐
- ADK 模式：`twitter_digest/agents.py` 已建立 LlmAgent + InMemoryRunner singleton + Pydantic output_schema 范式
- 默认模型：`gemini-3.1-pro-preview`（per 用户全局指令 + twitter_digest 既有约定）
- 鉴权：`Depends(verify_cron_secret)` for 管理端点
- 日志：`get_logger(__name__)`

## 3. 阶段 2：内容分类

> ⚠️ **2026-05-05 修订**：以下 3.1–3.9 的设计（独立 classifier 管道、新增 edge function action、独立 router 端点）**已被合并方案取代**，留作设计决策记录。当前实施直接看 3.10「Definition of Done（合并版）」。
>
> 合并后的实际实施位置：
> - 提示词与 schema：`backend/app/features/twitter_digest/enrichment_prompts.py` 和 `models.py:EnrichmentOutput`
> - 数据流：`backend/app/features/twitter_digest/enrichment.py`（`enrich_unenriched_tweets`）
> - 端点：`POST /api/twitter-digest/enrich`（日 cron）和 `POST /api/twitter-digest/enrich-backfill?username=`（一次性回填）
> - 写入：`kol_tweets.symbols` JSONB（V3 富对象） + `kol_tweets.category` TEXT 列

### 3.1 分类体系（最终版）

保留母 plan 的 9 类，**单标签**（一条推文一个 category）。冲突时按优先级：

| 优先级 | Category | 说明 | 识别信号 |
|---|---|---|---|
| 1 | `stock_analysis` | 个股分析 | 提到具体 ticker + 财报/估值/基本面/护城河/管理层 |
| 2 | `sector_analysis` | 行业/板块 | 行业趋势、板块轮动、产业链分析 |
| 3 | `macro_analysis` | 宏观 | 利率、通胀、央行政策、经济周期、地缘 |
| 4 | `methodology` | 方法论阐述 | 直接讲分析框架、原则、思维方式（罕见但价值最高） |
| 5 | `trading_strategy` | 交易策略 | 进出场时机、技术指标、仓位管理动作 |
| 6 | `risk_management` | 风险管理 | 仓位、止损、风控、分散化（**讨论原则**而非具体动作） |
| 7 | `market_sentiment` | 市场情绪 | 贪婪/恐惧、散户行为、市场温度 |
| 8 | `opinion` | 观点/预测但无方法论 | 看多看空、预测但无支撑（次低优先级） |
| 9 | `other` | 闲聊/推荐/个人生活 | 兜底 |

**优先级仲裁规则**：

- 一条推文如果同时讲了 ticker + 行业，归 `stock_analysis`（更具体的赢）
- 讲了 ticker + 宏观背景，归 `stock_analysis`
- 只讲行业不讲个股，归 `sector_analysis`
- 既无个股也无行业，纯讲利率/通胀，归 `macro_analysis`
- 这条规则写进 prompt，由 LLM 执行，不在代码里做后处理

### 3.2 Symbol 提取

同一次分类调用**同时**提取 `symbols`（ticker 列表），避免双 LLM 调用。规则：

- 标准化为大写 ticker：`NVDA`、`TSLA`、`SPY`、`QQQ`
- 中文公司名归一到 ticker：「英伟达」→ `NVDA`，「特斯拉」→ `TSLA`
- 只提取上市公司 ticker；指数（SPX、NDX）也算 ticker
- 多 ticker 用数组：`["NVDA", "TSM"]`
- 没有 ticker：返回 `[]`（不是 null，便于 query）

### 3.3 单条 vs Thread

**决策：阶段 2 一律按单条推文分类**，不做 thread 拼接。原因：

- thread 拼接需要先识别"自我 thread"（同 author + 同 conversation_id），逻辑复杂
- 阶段 3 方法论提取是按 category 整体喂给 LLM，thread 上下文会在那时自然恢复
- 单条分类丢失少量上下文（reply 类推文可能歧义）→ 用 `quoted_tweet_text` 和 `in_reply_to_username` 字段补救：分类 prompt 里把这两个字段一并喂给 LLM

### 3.4 DB & Edge Function 改动

#### 3.4.1 Edge Function 改动（kol-tweets.js）

**改动 1**：扩展 `update_categories_batch` 支持 symbols（向后兼容）

```javascript
// POST ?action=update_categories_batch
// updates: [{id, category, symbols?}, ...]
for (const { id, category, symbols } of updates) {
  const update = { category };
  if (symbols !== undefined) update.symbols = symbols;
  const { error } = await client.database
    .from(TABLE)
    .update(update)
    .eq("id", id);
  // ...
}
```

**改动 2**：新增 `list_unclassified` action

```javascript
// GET ?action=list_unclassified&username=xxx&limit=50
if (request.method === "GET" && action === "list_unclassified") {
  const username = url.searchParams.get("username");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  if (!username) {
    return badRequest("username required");
  }
  const { data, error } = await client.database
    .from(TABLE)
    .select("id, author_username, text, tweet_type, conversation_id, quoted_tweet_text, in_reply_to_username, created_at, url")
    .eq("author_username", username)
    .is("category", null)
    .order("created_at", { ascending: true })  // 老的先分类，便于增量
    .range(0, limit - 1);
  // ...
}
```

**部署**：deploy 命令走现有 Insforge edge function 部署流程（参考 `backend/app/edge_functions/` 既有部署做法）。

#### 3.4.2 db.py 改动

**新增函数**：

```python
async def list_unclassified_tweets(username: str, limit: int = 50) -> list[dict]:
    """按 created_at 升序返回未分类推文（category IS NULL）。"""
    # 调用 GET ?action=list_unclassified

async def update_classifications_batch(
    updates: list[dict],  # [{"id": str, "category": str, "symbols": list[str]}]
) -> dict:
    """批量更新分类 + symbols。返回 {updated, errors}。"""
    # 复用扩展后的 update_categories_batch action
```

`update_categories_batch`（旧的）保留作为只更新 category 的简化入口，新代码走 `update_classifications_batch`。

### 3.5 分类服务层

#### 3.5.1 新建 `backend/app/features/twitter/classifier.py`

```python
"""KOL tweet classification — single-label category + ticker extraction."""

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner

from app.features.twitter.classifier_prompts import CLASSIFY_INSTRUCTION
from app.features.twitter.classifier_models import ClassificationBatchOutput

CLASSIFIER_VERSION = "v1.0"
MODEL = "gemini-3.1-pro-preview"
APP_NAME = "twitter_classifier"

classify_agent = LlmAgent(
    name="kol_tweet_classifier",
    model=MODEL,
    description="Classify a KOL tweet into one of 9 categories and extract tickers",
    instruction=CLASSIFY_INSTRUCTION,
    output_schema=ClassificationBatchOutput,
    output_key="classifications",
)
```

#### 3.5.2 输出 schema (`classifier_models.py`)

```python
from typing import Literal
from pydantic import BaseModel, Field

CategoryLiteral = Literal[
    "stock_analysis", "sector_analysis", "macro_analysis",
    "methodology", "trading_strategy", "risk_management",
    "market_sentiment", "opinion", "other",
]

class TweetClassification(BaseModel):
    id: str = Field(description="Tweet id from input")
    category: CategoryLiteral
    symbols: list[str] = Field(default_factory=list, description="Uppercase tickers, [] if none")

class ClassificationBatchOutput(BaseModel):
    items: list[TweetClassification]
```

#### 3.5.3 Prompt v1 (`classifier_prompts.py`)

```python
CLASSIFY_INSTRUCTION = """
你给金融博主的推文打分类标签，并提取其中提到的股票 ticker。

# 输入
JSON：`{"tweets": [{"id", "text", "tweet_type", "quoted_tweet_text",
"in_reply_to_username", "created_at"}]}`

# 输出（严格遵循 ClassificationBatchOutput schema）
对每条推文输出 `{id, category, symbols}`。

# 9 类别（按优先级排，冲突时取优先级高的）

1. stock_analysis — 提到具体 ticker + 财报/估值/基本面/护城河/管理层。
2. sector_analysis — 讲行业/板块/产业链趋势，但不聚焦单只股票。
3. macro_analysis — 利率/通胀/央行/经济周期/地缘宏观议题。
4. methodology — 直接阐述分析框架、原则、思维方式（罕见，重要）。
5. trading_strategy — 进出场时机、技术指标、具体仓位动作。
6. risk_management — 讨论风控原则、仓位管理、分散化（原则层，非动作层）。
7. market_sentiment — 市场情绪、贪婪恐惧、散户行为。
8. opinion — 看多看空但无方法论支撑。
9. other — 闲聊、推荐、个人生活、广告、表情包。

# 优先级仲裁

- 同时含 ticker + 行业 → stock_analysis
- 同时含 ticker + 宏观 → stock_analysis
- 只行业不个股 → sector_analysis
- 既无个股也无行业，纯宏观 → macro_analysis
- 既有具体动作（"我加仓了 X"）又有原则讨论 → trading_strategy（动作优先）
- 拿不准的边界 case → 选优先级**更高**的（数字小的）

# Symbols 抽取规则

- 标准化大写 ticker：NVDA、TSLA、SPY
- 中文公司名归一：英伟达 → NVDA，特斯拉 → TSLA，苹果 → AAPL，台积电 → TSM
- 指数算 ticker：SPX、NDX、DJI、QQQ、SPY
- 加密货币不算 ticker（BTC、ETH 不进 symbols）
- 没有：返回空数组 []，不要返回 null

# 上下文使用

`quoted_tweet_text` 是被引用推文的内容；`in_reply_to_username` 是回复对象。
分类时把这些当上下文用，但分类的还是 `text` 主体。

# 重要约束

- **每条推文只一个 category**，不能多标签
- ticker 大小写不敏感输入也要输出大写
- 输出顺序与输入顺序一致
- 不要遗漏任何一条输入推文
"""
```

#### 3.5.4 服务层入口

```python
# service.py 追加

async def classify_unclassified_batch(username: str, batch_size: int = 50) -> dict:
    """
    取最早的 N 条未分类推文 → LLM 批量分类 → 写回。
    返回 {fetched, classified, errors, remaining_estimate}.
    可重复调用，幂等。
    """
    tweets = await db.list_unclassified_tweets(username, limit=batch_size)
    if not tweets:
        return {"fetched": 0, "classified": 0, "errors": 0, "remaining_estimate": 0}

    # 构造 LLM 输入：只塞 LLM 需要的字段
    payload = {"tweets": [
        {
            "id": t["id"],
            "text": t["text"] or "",
            "tweet_type": t.get("tweet_type"),
            "quoted_tweet_text": t.get("quoted_tweet_text"),
            "in_reply_to_username": t.get("in_reply_to_username"),
            "created_at": t.get("created_at"),
        }
        for t in tweets
    ]}

    # 调用 ADK runner（参考 twitter_digest 模式）
    output = await _run_classifier(payload)  # ClassificationBatchOutput

    # 校验：返回数 == 输入数
    if len(output.items) != len(tweets):
        logger.error("Classifier returned %d items for %d inputs",
                     len(output.items), len(tweets))
        # 保守做法：标错的全部跳过，等下一次重试
        return {"fetched": len(tweets), "classified": 0, "errors": len(tweets), ...}

    # 写回
    updates = [
        {"id": item.id, "category": item.category, "symbols": item.symbols}
        for item in output.items
    ]
    result = await db.update_classifications_batch(updates)
    return {
        "fetched": len(tweets),
        "classified": result["updated"],
        "errors": result["errors"],
        "remaining_estimate": -1,  # 由调用方查 stats 拿真实数
    }
```

### 3.6 API 端点

`router.py` 追加：

```python
class ClassifyRequest(BaseModel):
    username: str = Field(..., description="KOL username")
    batch_size: int = Field(50, ge=1, le=200)
    max_batches: int = Field(1, ge=1, le=100,
                             description="一次调用跑几批，1 = 单批")

@router.post("/classify")
async def classify_endpoint(
    req: ClassifyRequest,
    _: None = Depends(verify_cron_secret),
):
    """
    管理端点：分类 N 批未分类推文。
    幂等，可反复调用直到分类完所有推文。
    """
    total = {"fetched": 0, "classified": 0, "errors": 0, "batches_run": 0}
    for _ in range(req.max_batches):
        result = await classify_unclassified_batch(req.username, req.batch_size)
        total["fetched"] += result["fetched"]
        total["classified"] += result["classified"]
        total["errors"] += result["errors"]
        total["batches_run"] += 1
        if result["fetched"] == 0:
            break  # 没有更多未分类的了
    return total
```

### 3.7 成本与批次参数

@qinbafrank 数据规模：2460 条推文。

**批次参数选择**：

| 参数 | 值 | 理由 |
|---|---|---|
| batch_size | 50 | 单次调用 ~16K 输入 token，留足 schema 输出空间 |
| max_batches per call | 10 | 单次 API 调用 ~5 分钟，避免超时 |
| 全量分类调用次数 | ~50 批 = 5 次 API 调用 | 操作员每次调一次，看返回的 fetched=0 就结束 |

**成本估算**（gemini-3.1-pro-preview，参考 twitter_digest 实际消耗）：

| 项目 | 量 |
|---|---|
| 输入 token | 50 batches × 16K = 800K |
| 输出 token | 50 batches × 2.5K = 125K |
| 估算成本 | $1.5 ~ $3.0 |

**重要：实际跑前先用 1 批 50 条测一下**，确认 prompt 效果和 token 消耗，再批量推。

### 3.8 错误处理与可恢复性

| 失败模式 | 处理 |
|---|---|
| LLM 调用网络失败 | ADK runner 自带重试，超时设 90 秒 |
| LLM 返回数 ≠ 输入数 | 整批回退（不写任何分类），等下次重跑 |
| 单条 update 失败 | 该条 category 仍为 NULL，下次会被重新拉到 |
| LLM 返回非法 category | Pydantic schema 验证会拒绝，整批回退 |
| 部分 ticker 抽取错 | 不阻塞 category；symbols 错可后续手工修 |

**幂等性保证**：所有写都靠 `category IS NULL` 过滤，已分类的不会被重新分。如果某条要重新分，先把 category 置回 NULL（手工 SQL 或加个 reset 端点，MVP 不做 reset）。

**进度可见性**：每批结束打 log；调用方靠 `/api/twitter/stats` 看 `by_category` 增长。

### 3.9 测试策略

**单元测试** (`tests/test_twitter_classifier.py`)：

```python
def test_priority_resolution():
    """优先级仲裁：ticker + 行业 → stock_analysis"""
    # mock LLM 输出，验证 service 层不做二次仲裁（信任 LLM）

def test_batch_size_mismatch_rolls_back():
    """LLM 返回数不一致 → 不写任何分类"""

def test_symbols_normalization():
    """schema 校验大写 ticker"""

def test_chinese_company_to_ticker():
    """中文公司名 → ticker（这是 prompt 行为，用真实 LLM 跑 1-2 个 case）"""
```

**真 LLM 集成测试**（标记 `@pytest.mark.run_generate`，默认跳过）：

```python
@pytest.mark.run_generate
async def test_classify_known_qinbafrank_tweets():
    """从已采集数据里挑 5 条人工标注好分类的推文，跑分类，断言结果"""
    fixtures = load_fixtures("test_data/qinbafrank_classification_fixtures.json")
    # 5 条推文，每条带预期 category 和预期 symbols
    output = await _run_classifier({"tweets": [f["tweet"] for f in fixtures]})
    for expected, actual in zip(fixtures, output.items):
        assert actual.category == expected["expected_category"]
        assert set(actual.symbols) == set(expected["expected_symbols"])
```

**人工抽查**：分类完全部 2460 条后，从每个 category 随机抽 10 条，人工看是否合理。如错误率 >15%，调 prompt 重跑。

### 3.10 Definition of Done

阶段 2（合并版）完成需要满足：

- [x] `EnrichmentOutput` 加 `category: CategoryLabel` 字段（9 类 Literal）
- [x] `enrichment_prompts.py` 的 `ENRICH_INSTRUCTION` 加 Category 章节（9 类 + 优先级仲裁）
- [x] `enrichment.py` 加 `_build_update`，update payload 同时含 `symbols`（JSONB）和 `category`（TEXT 列）
- [x] `enrichment.py` 的 `fetch_unenriched` / `enrich_unenriched_tweets` 支持 `window_hours=None` 和 `username` 过滤
- [x] Edge function `upsert_enrichment` 接受可选 `category` 字段并写到 `kol_tweets.category` 列
- [x] Edge function `list_unenriched` 接受可选 `username` 过滤
- [x] Edge function `needsEnrichment` 加 `row.category IS NULL` 触发条件（重做缺 category 的旧 V3 行）
- [x] `POST /api/twitter-digest/enrich-backfill?username=&limit=` 端点
- [x] 6 个新单元测试覆盖 category 字段 + backfill 行为（72/72 通过）
- [x] @qinbafrank 200 条 backfill 验证：8/9 类命中，0 错误，质量抽查 OK
- [ ] @qinbafrank 全部 2513 条 backfill 完毕（运行中）
- [ ] 人工抽查 9 类各 10 条样本，错误率 <15%
- [ ] `.context.md` 更新（新增端点、字段说明）
- [ ] 母 plan 加 2026-05-05 进度记录（合并 + 全量 backfill 完成）

> 已**删除**的早期设计产物（不再适用）：`backend/app/features/twitter/classifier.py`、
> `classifier_models.py`、`classifier_prompts.py`、`/api/twitter/classify` 端点、
> Edge function 的 `list_unclassified` action、`db.py` 里的 `list_unclassified_tweets`
> 和 `update_classifications_batch`。这些都被 V3 enrichment 一条管道吸收了。

---

## 4. 阶段 3：方法论提取

### 4.1 目录结构

```
backend/app/features/twitter/methodologies/
├── __init__.py
├── qinbafrank/
│   ├── metadata.yaml           # 博主信息、提取版本、prompt 版本
│   ├── stock_analysis.yaml     # 个股方法论
│   ├── sector_analysis.yaml
│   ├── macro_analysis.yaml
│   ├── trading_strategy.yaml
│   ├── risk_management.yaml
│   ├── methodology.yaml        # 博主直接阐述的方法论原话归档
│   └── extraction_log/         # 每次提取的原始 LLM 输出 + 报告
│       ├── 2026-05-XX-stock-analysis-v1.json   # raw LLM output
│       └── 2026-05-XX-stock-analysis-v1.md     # 人工 review 报告
└── README.md                   # 怎么读这个目录
```

**只对 6 个有意义的 category 提取**（stock / sector / macro / trading / risk / methodology），后 3 类（sentiment / opinion / other）跳过。

### 4.2 输出 schema (`extractor_models.py`)

```python
from pydantic import BaseModel, Field

class EvidenceCitation(BaseModel):
    tweet_id: str
    quote: str = Field(max_length=300, description="原文逐字引用，最长 300 字")

class DataIndicator(BaseModel):
    name: str = Field(description="指标/数据源名称，如 '自由现金流收益率'")
    frequency: str = Field(description="high / medium / low — 在源推文集合中出现频次")
    description: str = Field(description="博主如何使用该指标")
    evidence: list[EvidenceCitation] = Field(min_length=2, max_length=5)

class AnalyticalStep(BaseModel):
    order: int
    description: str
    evidence: list[EvidenceCitation] = Field(min_length=1, max_length=3)

class DecisionCriterion(BaseModel):
    condition: str = Field(description="什么样的信号触发这个判断")
    direction: str = Field(description="bullish / bearish / neutral")
    weight: str = Field(description="high / medium / low / veto（一票否决型）")
    evidence: list[EvidenceCitation] = Field(min_length=1, max_length=3)

class CommunicationPattern(BaseModel):
    context: str = Field(description="high_conviction / low_conviction / risk_warning / hedge")
    typical_phrases: list[str] = Field(min_length=2, max_length=8)
    evidence: list[EvidenceCitation] = Field(min_length=2, max_length=5)

class CategoryMethodology(BaseModel):
    analyst: str
    category: str
    source_tweet_count: int
    methodology_version: str
    prompt_version: str
    data_preferences: list[DataIndicator]
    analytical_process: list[AnalyticalStep]
    decision_criteria: list[DecisionCriterion]
    communication_patterns: list[CommunicationPattern]
    insufficient_evidence_notes: list[str] = Field(
        default_factory=list,
        description="某维度证据不足时诚实标注，而非编造"
    )
```

**Pydantic schema 直接 → YAML**：用 `model_dump()` + `yaml.safe_dump()` 序列化。

### 4.3 分块策略

**决策：单 category 单次调用，不分块。**

理由：
- @qinbafrank 推文已统计：分类后预估每类 50~800 条
- 中文每条平均 200 token，最大类 800 × 200 = 160K input token
- gemini-3.1-pro-preview 1M context，单次塞下绰绰有余
- 单次调用 = 全局视角，避免多次调用后的聚合问题

**例外**：如果某 category 经分类后超过 1500 条（预期不会），按时间倒序取最近 1000 条。

### 4.4 Extraction Prompt v1 (`extractor_prompts.py`)

为 6 个 category **共用一个模板**，category-specific 描述用变量注入：

```python
EXTRACT_INSTRUCTION_TEMPLATE = """
你是一位方法论分析师。以下是 @{analyst} 关于 **{category_chinese}** 的所有推文。

你的任务**不是总结他的观点**，而是**提取他的思维方式**。
要识别的是「他怎么想」，不是「他说了什么」。

# 你需要提取的 4 个维度

## 1. 数据偏好（data_preferences）

他反复关注哪些数据、指标、信息源？识别那些跨多条推文重复出现的、用来支撑判断的指标。

每个 indicator 输出：
- `name`: 指标名（中文）
- `frequency`: high（出现 5+ 次） / medium（2-4 次） / low（仅 1 次但显著）
- `description`: 他是怎么用这个指标的（一两句话）
- `evidence`: 至少 2 条原文引用，每条带 `tweet_id` 和 `quote`

## 2. 分析流程（analytical_process）

拿到一个 {category_chinese} 问题，他通常按什么顺序分析？识别那些跨多条推文重复出现的步骤序列。

每个 step 输出：
- `order`: 步骤序号
- `description`: 这一步在做什么
- `evidence`: 至少 1 条原文引用

## 3. 判断标准（decision_criteria）

什么条件触发他的正面判断？什么条件触发负面判断？有没有「一票否决」型条件？

每个 criterion 输出：
- `condition`: 条件描述
- `direction`: bullish / bearish / neutral
- `weight`: high / medium / low / veto
- `evidence`: 至少 1 条原文引用

## 4. 表达模式（communication_patterns）

他用什么语言表达不同程度的确信？识别 4 种 context：
- `high_conviction`: 强烈看多/看空时的用词
- `low_conviction`: 不确定、试探性观点时的用词
- `risk_warning`: 警示风险时的用词
- `hedge`: 留余地、对冲表达时的用词

每个 context 输出 2-8 个 typical phrases + 至少 2 条原文引用。

# 关键约束

1. **每个发现必须配证据**：不许凭印象总结，每条都要 `tweet_id` 和原文 `quote`。
2. **区分明说 vs 推断**：博主明确说过的优先；你从行为模式推断的也可，但要在 evidence 里看得出。
3. **证据不足要诚实标注**：如果某个维度找不到 ≥2 条证据支撑，把这个发现写进
   `insufficient_evidence_notes` 而不是放进正式条目。
4. **逐字引用**：`quote` 字段必须是推文原文的连续片段，不许改写、压缩、翻译。
5. **每条 evidence 的 tweet_id** 必须来自输入 tweets 列表。

# 输入

```json
{tweets_json}
```

输出严格遵循 CategoryMethodology schema。

# 元数据

- analyst: "{analyst}"
- category: "{category}"
- source_tweet_count: {tweet_count}
- methodology_version: "{methodology_version}"
- prompt_version: "{prompt_version}"
"""

# Category 中文名映射
CATEGORY_CHINESE = {
    "stock_analysis": "个股分析",
    "sector_analysis": "行业/板块分析",
    "macro_analysis": "宏观分析",
    "trading_strategy": "交易策略",
    "risk_management": "风险管理",
    "methodology": "方法论阐述",
}

PROMPT_VERSION = "v1.0"
```

### 4.5 提取服务层

#### 4.5.1 `extractor.py`

```python
"""KOL methodology extraction — per-category single-shot extraction."""

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner

from app.features.twitter.extractor_models import CategoryMethodology
# Note: instruction 是动态注入的，不能像 classifier 那样在 module 顶层 build agent
# 改成每次调用动态构造

EXTRACTOR_VERSION = "v1.0"
MODEL = "gemini-3.1-pro-preview"
APP_NAME = "twitter_extractor"


def build_extract_agent(instruction: str) -> LlmAgent:
    return LlmAgent(
        name="kol_methodology_extractor",
        model=MODEL,
        description="Extract methodology framework from a KOL's tweets in one category",
        instruction=instruction,
        output_schema=CategoryMethodology,
        output_key="methodology",
    )
```

#### 4.5.2 服务入口

```python
# service.py 追加

async def extract_methodology_for_category(
    username: str,
    category: str,
    *,
    methodology_version: str = "v1.0",
) -> CategoryMethodology:
    """
    提取单一 category 的方法论。
    返回 CategoryMethodology，并落盘到 methodologies/<username>/<category>.yaml。
    同时落盘 extraction_log/<date>-<category>-<version>.json (raw LLM) 和 .md (review 报告)。
    """
    # 1. 拉这个 category 的全部推文
    tweets = await db.list_tweets_by_category(username, category, limit=2000)
    if len(tweets) < 20:
        raise ValueError(f"Category {category} has only {len(tweets)} tweets, too few")

    # 2. 构造 prompt
    instruction = EXTRACT_INSTRUCTION_TEMPLATE.format(
        analyst=username,
        category=category,
        category_chinese=CATEGORY_CHINESE[category],
        tweets_json=json.dumps([
            {"tweet_id": t["id"], "text": t["text"], "created_at": t["created_at"]}
            for t in tweets
        ], ensure_ascii=False),
        tweet_count=len(tweets),
        methodology_version=methodology_version,
        prompt_version=PROMPT_VERSION,
    )

    # 3. 跑 ADK
    agent = build_extract_agent(instruction)
    runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
    output = await _run_extractor(runner)  # CategoryMethodology

    # 4. 落盘
    save_methodology_yaml(username, category, output)
    save_extraction_log(username, category, methodology_version, output, instruction)
    save_review_report(username, category, methodology_version, output, tweets)

    return output
```

### 4.6 API 端点

```python
class ExtractRequest(BaseModel):
    username: str
    category: Literal[
        "stock_analysis", "sector_analysis", "macro_analysis",
        "trading_strategy", "risk_management", "methodology",
    ]
    methodology_version: str = Field("v1.0",
        description="人工迭代时递增，如 v1.1、v1.2")

@router.post("/extract-methodology")
async def extract_endpoint(
    req: ExtractRequest,
    _: None = Depends(verify_cron_secret),
):
    output = await extract_methodology_for_category(
        req.username, req.category,
        methodology_version=req.methodology_version,
    )
    return {
        "success": True,
        "yaml_path": f"methodologies/{req.username}/{req.category}.yaml",
        "review_report": f"methodologies/{req.username}/extraction_log/...md",
        "tweet_count": output.source_tweet_count,
        "data_preferences_count": len(output.data_preferences),
        "analytical_steps_count": len(output.analytical_process),
        "decision_criteria_count": len(output.decision_criteria),
        "communication_patterns_count": len(output.communication_patterns),
        "insufficient_evidence_notes": output.insufficient_evidence_notes,
    }
```

### 4.7 人工 review workflow（不建 UI）

每次 extract 落盘 3 个文件：

1. `methodologies/<username>/<category>.yaml` — 当前生效版本
2. `extraction_log/<date>-<category>-<version>.json` — 原始 LLM 输出
3. `extraction_log/<date>-<category>-<version>.md` — review 报告

**review 报告 markdown 格式**：

```markdown
# qinbafrank · stock_analysis · v1.0 · 2026-05-XX

源数据: 856 条推文
模型: gemini-3.1-pro-preview
Prompt 版本: v1.0

## ⚠️ Insufficient Evidence Notes
- "decision_criteria 中的 veto 类条件证据不足，仅找到 1 条"

## Data Preferences (8 项)

### 1. 自由现金流收益率（高频）
博主用它判断估值合理性。

证据：
> [tweet_id: 184xxx | 2026-01-12]
> "看公司的核心还是 FCF yield，PE 在科技股里没那么靠谱"

> [tweet_id: 187xxx | 2026-02-08]
> "..."

### 2. ...

## Analytical Process (4 步)

### Step 1. ...

## Decision Criteria

### 看多
- ...

### 看空
- ...

### Veto
- ...

## Communication Patterns

### High Conviction
"我认为"、"逻辑很清晰"、"几乎没有疑问"
> ...

### ...
```

**人工 review 流程**：

1. 跑 `/api/twitter/extract-methodology`，等返回
2. 在 VS Code 打开 `extraction_log/<date>-<category>-<version>.md` 通读
3. 判断：
   - 数据偏好是否抓到了真实高频指标？（对照 stats）
   - 分析流程是否真的在推文里反复出现，还是 LLM 编的？
   - 证据 quote 是否真是原话？（抽 3 条到推文 url 验证）
4. 不满意 → 调 `extractor_prompts.py` 的 prompt → 递增 `methodology_version` → 重跑
5. 满意 → 直接编辑 `<category>.yaml` 做小修小补 → git commit

**iteration 上限**：每个 category 最多 4 轮 prompt 调整，超过 4 轮停下重新审视 prompt 整体设计。

### 4.8 验证回测（阶段 4 简化版）

完整阶段 4 在另一份方案细化。本工程方案只锁定**最小验证集**：

每个 category 抽 5 条**有明确分析结论**的推文，做 holdout 验证：

1. 把这 5 条**从输入里剔除**再跑提取（避免泄漏）
2. 跑出 v1.0 方法论
3. 对每条 holdout 推文：把当时的「事件/数据」单独喂给一个用 v1.0 方法论驱动的 Agent（这一步要等 MVP-4 才有）
4. **MVP-4 之前**：人工对照 holdout 推文 + v1.0 YAML，问「假设给我这条数据，按这套方法论我会得出什么结论？跟博主原结论一致吗？」

**通过门槛**：

- 6 个 category 中至少 4 个的 holdout 通过率 ≥70%
- 没通过的 category 进 v1.1 迭代

如果阶段 4 始终通不过 → 回到阶段 2 看分类质量是不是有问题（是不是分类不准导致提取材料污染）。

### 4.9 Definition of Done

- [ ] `methodologies/qinbafrank/` 目录建好，含 `metadata.yaml`
- [ ] `extractor_models.py` + `extractor_prompts.py` + `extractor.py` 文件齐全
- [ ] `/api/twitter/extract-methodology` 端点能跑通
- [ ] 6 个 category 全部产出 v1.x YAML（至少跑通 v1.0，迭代版本算 bonus）
- [ ] 每个 category 的 review report markdown 已生成且人工读过
- [ ] 6 个 category holdout 验证通过率 ≥70%（4/6 类达标）
- [ ] git 提交了所有 YAML（有版本可回滚）
- [ ] 母 plan 添加 2026-05-XX 进度记录，附本次提取的统计与 review 摘要
- [ ] `.context.md` 更新

---

## 5. 风险与开放项

| 项 | 风险 | 缓解 |
|---|---|---|
| LLM 编造证据 | quote 是改写而非原文，欺骗性强 | review 环节抽 3 条到原文验证；schema 描述强调"逐字" |
| 分类系统性偏差 | 某类（如 opinion）被过度分配，污染下游 | 抽查 9 类各 10 条；如某类比例 >40% 重审 prompt |
| Symbol 抽取漏 | 中文公司名归一化漏几个 | 接受；阶段 2 不卡这条；后续在 RAG 阶段补 |
| 单 category 推文 <50 | methodology 提取数据不足 | 提取时跳过；source_tweet_count <50 直接 raise |
| Prompt 迭代失控 | 改 prompt 改成迁就博主而非提取真实模式 | 4 轮上限；保留 v1.0 ~ v1.x 历史，对比看是否过拟合 |
| 模型选择 | gemini-3.1-pro-preview 对分类是 overkill | 阶段 2 全量跑完后评估；如成本不敏感继续 pro，否则下游切 flash-lite |

**仍未决议但不阻塞 MVP**：

- 跨博主 methodology 复用（多 KOL 时怎么处理）→ 暂时单博主，未来再说
- 方法论时效性 / 漂移检测 → 等 v2 阶段做
- Edge function `category=null` 是否需要单独索引 → 现有 `category` 索引应该够，跑慢了再补

---

## 6. 工作量估算

| 任务 | 时间 |
|---|---|
| 阶段 2 - Edge function 改 + 部署 | 0.5 天 |
| 阶段 2 - db.py + classifier 三件套 | 1 天 |
| 阶段 2 - prompt v1 起草 + 单元测试 | 0.5 天 |
| 阶段 2 - 集成测试 fixture（5 条人工标注） | 0.5 天 |
| 阶段 2 - 跑全量分类（含 1 批小试） | 0.5 天 |
| 阶段 2 - 抽查 + prompt 微调（如需要） | 0.5-1 天 |
| **阶段 2 小计** | **3.5-4 天** |
| 阶段 3 - 目录 + schema + extractor 框架 | 1 天 |
| 阶段 3 - prompt v1 + review report 生成器 | 1 天 |
| 阶段 3 - 6 个 category 跑提取（v1.0） | 1 天（LLM 时间 + I/O） |
| 阶段 3 - 人工 review + 1-2 轮 prompt 迭代 | 2-3 天 |
| 阶段 3 - holdout 验证（人工对照） | 1 天 |
| **阶段 3 小计** | **6-7 天** |
| **总计** | **9.5-11 天**（约 2 周） |

与母 plan「阶段 2: 3-5 天 + 阶段 3: 1-2 周」基本一致。

---

## 7. 执行清单（一次到底）

按这个顺序执行，每完成一项打勾：

### 阶段 2

- [ ] T2.1 在 `kol-tweets.js` 改 `update_categories_batch` 支持 symbols
- [ ] T2.2 在 `kol-tweets.js` 加 `list_unclassified` action
- [ ] T2.3 部署 edge function，curl 验证两个 action
- [ ] T2.4 `db.py` 加 `list_unclassified_tweets` + `update_classifications_batch`
- [ ] T2.5 写 `classifier_models.py`（Pydantic schema）
- [ ] T2.6 写 `classifier_prompts.py`（CLASSIFY_INSTRUCTION）
- [ ] T2.7 写 `classifier.py`（agent + runner）
- [ ] T2.8 `service.py` 加 `classify_unclassified_batch`
- [ ] T2.9 `router.py` 加 `/api/twitter/classify` 端点
- [ ] T2.10 单元测试（不调真 LLM）
- [ ] T2.11 准备 5 条人工标注 fixture（test_data/qinbafrank_classification_fixtures.json）
- [ ] T2.12 集成测试（带 `--run-generate` 标记）
- [ ] T2.13 跑 1 批 50 条，人工检查
- [ ] T2.14 跑全量（~50 批），核对 stats
- [ ] T2.15 抽查 9 类各 10 条
- [ ] T2.16 更新 `.context.md`
- [ ] T2.17 母 plan 加进度记录

### 阶段 3

- [ ] T3.1 建 `methodologies/qinbafrank/` 目录 + `metadata.yaml`
- [ ] T3.2 写 `extractor_models.py`
- [ ] T3.3 写 `extractor_prompts.py`（template + CATEGORY_CHINESE）
- [ ] T3.4 写 `extractor.py`（dynamic agent build）
- [ ] T3.5 `service.py` 加 `extract_methodology_for_category`
- [ ] T3.6 写 `save_methodology_yaml` / `save_extraction_log` / `save_review_report` 工具
- [ ] T3.7 `router.py` 加 `/api/twitter/extract-methodology`
- [ ] T3.8 跑 stock_analysis（v1.0）→ review → 调 prompt（如需要）→ v1.1
- [ ] T3.9 跑 sector_analysis
- [ ] T3.10 跑 macro_analysis
- [ ] T3.11 跑 trading_strategy
- [ ] T3.12 跑 risk_management
- [ ] T3.13 跑 methodology（直接阐述类，可能很少）
- [ ] T3.14 6 个 category 各做 holdout 验证（每类 5 条）
- [ ] T3.15 git commit 全部 YAML + extraction_log
- [ ] T3.16 更新 `.context.md`（新增 methodologies 目录说明）
- [ ] T3.17 母 plan 加进度记录 + holdout 验证摘要

完成 T3.17 后，可以开始写 Eng Plan v2（MVP-1 L2 RAG）。
