# LLM Usage Metering Playbook

> 项目内所有 Google ADK `LlmAgent` 调用都自动写一行到 Insforge `llm_usage` 表，按 `feature × model` 维度归因 token 消耗。本指南包含 **心智模型**、**查询用量的标准操作**、**给新 agent 加埋点**、**故障速查**。
> 写代码前先读这份，不要绕过 `meter()` 直接调 LLM。

## 1. 何时关心 LLM Usage

- 每月看 Google AI Studio 账单飙升不知道哪个 feature 在烧 → 跑一次 summary 就能定位
- 接新 LlmAgent 时 → 必须挂 `meter()`，否则那个 feature 进 prod 后就是黑洞
- 优化 prompt / 切模型档位前后 → 用同一个 feature 标签的前后日均 token 对比验证省没省

## 2. 心智模型

```
┌────────────────────────────────────────────────────────────────┐
│  LlmAgent(..., after_model_callback=meter("feature.x", ...))   │
│       ↓ 每次模型返回都触发                                       │
│  app/shared/llm_metering.py — 提取 usage_metadata               │
│       ↓ asyncio.create_task (fire-and-forget)                  │
│  Insforge edge function `llm-usage` (POST)                     │
│       ↓                                                        │
│  Insforge 表 llm_usage                                          │
│       ↓                                                        │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │ GET /functions/llm-usage │  │ insforge db query "..."  │    │
│  │   ?action=summary&days=N │  │   ad-hoc SQL             │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

- **callback 是 fire-and-forget**：写库失败只 warn，不阻塞 LLM 响应
- **失败可丢**：观测性而非业务依赖，丢几行也无所谓（不要给 metering 加 retry 拖慢 LLM 主路径）
- **EDGE_FUNCTION_SECRET 必须存在**：本地开发时若 secret 不在 env，metering 静默跳过

## 3. 表 + 端点定义

**表 `llm_usage`** (Insforge):

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | PK，自动生成 |
| `ts` | TIMESTAMPTZ | 默认 `now()` |
| `feature` | TEXT NOT NULL | 业务标签，如 `brew.digest_paid` |
| `agent_name` | TEXT NOT NULL | `LlmAgent.name`，如 `kol_digest_enrich` |
| `model` | TEXT | 模型字符串，如 `gemini-3.1-flash-lite-preview` |
| `prompt_tokens` | INT | 输入 token |
| `output_tokens` | INT | 输出 token |
| `cached_tokens` | INT | 命中 prompt cache 的 token |
| `thoughts_tokens` | INT | thinking tokens（Gemini 3 系列才有） |
| `total_tokens` | INT | 总和（Google 算的） |
| `extra` | JSONB | 自定义维度，如 model tier、user 段位 |

索引：`(ts DESC)`、`(feature, ts DESC)`

**Edge function `llm-usage`**：

| Method | 路径 | 用途 |
|---|---|---|
| `POST` | `/functions/llm-usage` | 插入一行或一组（body 是 object 或 array） |
| `GET` | `/functions/llm-usage?action=summary&days=N` | 按 `(feature, model)` 聚合最近 N 天（1-90） |

两端都要 `X-Internal-Secret: $EDGE_FUNCTION_SECRET` header。

## 4. 查询用量（最常用）

**curl 拉 summary（最快）**：

```bash
SECRET=$(npx @insforge/cli secrets get EDGE_FUNCTION_SECRET | awk '{print $3}')
curl -s "https://9wmhxyi4.us-east.insforge.app/functions/llm-usage?action=summary&days=7" \
  -H "X-Internal-Secret: $SECRET" | jq
```

返回示例：
```json
{
  "success": true,
  "days": 7,
  "summary": [
    {"feature": "brew.digest_paid", "model": "gemini-3-flash-preview", "calls": 543, "prompt_tokens": 12453221, "output_tokens": 1234567, "total_tokens": 13687788},
    ...
  ]
}
```

按 `total_tokens` 降序，第一名就是当周最贵 feature。

**SQL 直查（自定义维度）**：

```bash
npx @insforge/cli db query "
SELECT feature, model,
       COUNT(*) AS calls,
       SUM(prompt_tokens) AS in_tok,
       SUM(output_tokens) AS out_tok,
       SUM(total_tokens) AS total
FROM llm_usage
WHERE ts > NOW() - INTERVAL '7 days'
GROUP BY feature, model
ORDER BY total DESC
"
```

**按天看趋势**（盯异常飙升）：
```sql
SELECT date_trunc('day', ts) AS day,
       feature,
       SUM(total_tokens) AS total
FROM llm_usage
WHERE ts > NOW() - INTERVAL '14 days'
GROUP BY day, feature
ORDER BY day DESC, total DESC;
```

**估算 Gemini 3.8 的近 30 天 token 费用**（非完整账单）：
```sql
SELECT feature, model,
 SUM((CASE WHEN ts >= '2027-01-01T00:00:00Z' THEN 2 ELSE 1 END) * (
   (COALESCE(prompt_tokens,0) - LEAST(COALESCE(cached_tokens,0),COALESCE(prompt_tokens,0))) * 0.75
   + LEAST(COALESCE(cached_tokens,0),COALESCE(prompt_tokens,0)) * 0.075
   + (COALESCE(output_tokens,0) + COALESCE(thoughts_tokens,0)) * 3.75
 )) / 1e6 AS estimated_token_usd
FROM llm_usage
WHERE ts > NOW() - INTERVAL '30 days' AND model = 'gemini-3.8-flash'
GROUP BY feature, model;
```
缺失 token 字段在估值中按 0 处理，须同时披露缺失覆盖；不能当成零消耗。费用不含 grounding、缓存存储、数据源、折扣或税费。历史模型按其当期单价另算，不套用新模型费率。

## 5. 给新 LlmAgent 加埋点

**必做**。新 agent 不挂 callback 就是给 LLM 账单开后门。

```python
from app.shared.llm_metering import meter

from app.core.ai_models import GENERATIVE_MODEL
MY_MODEL = GENERATIVE_MODEL

my_agent = LlmAgent(
    name="my_agent",
    model=MY_MODEL,
    instruction=...,
    output_schema=...,
    output_key="...",
    after_model_callback=meter("my_feature.subtask", model=MY_MODEL),
)
```

**feature 命名约定**：`<feature_folder>.<subtask>`，全小写，下划线/点号分隔。
现有标签：
- `brew.digest_free` / `brew.digest_paid`
- `daily_report` / `morning_report` / `macro.weekly`
- `twitter_digest.enrich` / `twitter_digest.curate`
- `newsletter`
- `stock.fundamental` / `.technical` / `.earnings` / `.news` / `.macro` / `.market_overview`
- `screener.picker` / `.research`
- `portfolio_health`

新 feature 起名时检查现有列表，**不要重复也不要近似冲突**（如 `stock.macro` 已用就别再叫 `stock.macro_sector`）。

**可选**：传 `extra={"tier": "paid"}` 之类的额外维度，会落到 `extra` JSONB 列里，后续可用 `extra->>'tier'` 切片。

## 6. 加新模型档位的对照表

运行时生成模型唯一来源为 `app.core.ai_models.GENERATIVE_MODEL`。Gemini 3.8 不支持 MINIMAL thinking，显式设置时使用 LOW。

当前单价逻辑位于 `shared/llm_pricing.py`；以 [Google 官方价格](https://ai.google.dev/gemini-api/docs/pricing) 为准。Gemini 3.8 在 2026-12-31 前：输入 $0.75、缓存输入 $0.075、输出（含 thinking）$3.75 / 百万 token；2027-01-01 起翻倍。旧模型的 generic Flash 分支仅为历史粗估，不能用于 Gemini 3.8。

admin 的 daily 聚合依赖 `llm-usage.js` 返回 cached/thoughts token，两端同步发布。embedding 和历史记录的 model 标签不改。

## 7. 故障速查

| 症状 | 原因 | 处理 |
|---|---|---|
| `llm_usage` 表有数据但 summary 返回空 | `days` 参数过小，或时区漂移 | summary 默认按 UTC，把 `days` 拉大 |
| 后端日志一直 `llm_metering persist non-200` | `EDGE_FUNCTION_SECRET` 不对，或 edge function 挂了 | `npx @insforge/cli functions code llm-usage` 看状态 |
| 后端日志 `no running loop` debug 信息 | 在同步上下文里跑的 agent（极少见） | 改成 async 调用，或忽略——这种调用不会被记录 |
| 新 agent 加了 callback 但没有数据 | 忘了重启 backend / hot reload 没 pick up | 重启 uvicorn |
| 表里 `model` 字段都是 `null` | 创建 agent 时没传 `model=` 给 `meter()` | 必传，否则成本归因废了 |
| Edge function deploy 报 `INVALID_INPUT` | 多见于注释或多行格式触发 server 校验 bug | 把注释收紧到 3 行内 + 长 return 写成单行，参考 `backend/app/edge_functions/llm-usage.js` |

## 8. 文件地图

| 文件 | 作用 |
|---|---|
| `backend/app/shared/llm_metering.py` | callback factory + 异步写库 |
| `backend/app/edge_functions/llm-usage.js` | Insforge edge function 源码 |
| Insforge 表 `llm_usage` | 真实数据；通过 `insforge db query` 管理 |

部署：
```bash
# 表结构改动
npx @insforge/cli db query "ALTER TABLE llm_usage ADD COLUMN ..."

# Edge function 改动
npx @insforge/cli functions deploy llm-usage --file backend/app/edge_functions/llm-usage.js
```

## 9. 不要做的事

- ❌ **不要给 metering 加 retry / await**。它必须 fire-and-forget。一旦阻塞了 LLM 主路径，整个站会被它拖慢。
- ❌ **不要直接在 Python 里手动 INSERT `llm_usage` 表**。所有写入都走 edge function；这样未来切存储引擎 / 加 schema 验证只动一处。
- ❌ **不要在 admin 端把 summary 接口暴露给前端**。token 成本是运营数据，不该让用户看到。如果要做内部 dashboard，套一层 admin 中间件。
- ❌ **不要给 metering 调用加 LLM**（"用 LLM 总结今天的 LLM 用量"这种）。会形成尴尬的递归账单。
