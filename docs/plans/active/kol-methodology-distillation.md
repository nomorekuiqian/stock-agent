# KOL 方法论蒸馏计划

> Status: In Progress — 阶段 1 完成，MVP 范围已定，准备进入阶段 2
> Updated: 2026-05-05
> Related: `backend/app/features/twitter/`
> Vision: 从推特博主内容中提取可复用的分析方法��，让 AI Agent 用该方法论分析新数据，产出差异化内容

## 进度记录

### 2026-05-05 — MVP 范围决议

讨论了「博主对话」产品形态需要的产出物。从单一 YAML 输出扩展到八层架构（方法论/RAG/预测追踪/数据视角/信息源/实体词典/立场档案/风格语料），最终拍板 MVP 范围。

**MVP 包含**（4 层）：
- L1 方法论 YAML（阶段 3 产出）
- L2 历史观点 RAG（2460 条推文向量化 + 元数据索引 + 时间衰减召回）
- L4 数据视角清单（10-20 个核心指标，实时 FMP/FRED 拉取）
- L5 信息源清单（轻量版，只维护 sources.yaml，不做爬虫）

**MVP 不包含**（延后到 v1.1+）：
- L3 预测追踪表 — 差异化护城河，但非对话必需
- L6 实体词典 — LLM 自带能力够用，等发现黑话再补
- L7 立场档案 — L2 RAG 加时间衰减能自然产生
- L8 风格语料库 — L2 RAG 召回真实推文已隐式提供风格

**非协商项**：每个 Agent 回答必须标注引用来源（tweet_id + 实时数据时间戳），attribution 不能省。

详见下方「对话产品架构与 MVP 范围」章节。

### 2026-04-25 — 阶段 1 完成

**已完成**：
- Twitter 模块骨架（models / db / service / router）已创建并注册
- Insforge `kol_tweets` 表 + 索引已创建，`kol-tweets` Edge Function 已部署
- TwitterAPI.io 集成完成，支持三种采集方式：
  - `last_tweets` + `tweet_timeline` 分页采集（近期推文）
  - `advanced_search` 按天时间窗口采集（补历史数据）
  - `article` 端点采集文章全文
- **@qinbafrank 推文采集完成**：
  - **2460 条推文**（2025-10-28 ~ 2026-04-23，约 6 个月）
  - 类型分布：reply 1443 / quote 976 / original 34 / article 7
  - 15 个高产日用半天窗口补采，无遗漏
- 文章 upsert bug 已修复（update 时包含 author_username 避免 NOT NULL 约束）
- 7 篇文章全部成功入库

**下一步**：
1. 部署更新后的 `kol-tweets` Edge Function（stats 查询增加 range 突破 1000 行限制）
2. 进入阶段 2：内容分类（用 LLM 对 2460 条推文标注 category）

### 2026-04-22 — 阶段 1 部分完成（历史记录）

- 初始采集 295 条推文（timeline 端点深度受限）
- 发现文章 upsert bug 和数据量不足问题

---

## 核心理念

**蒸馏 != 总结**。总结提取的是"他说了什么"，蒸馏提取的是"他怎么想的"。

产出物是一套**结构化分析框架**，可以喂给 Agent 新数据后产出与该博主风格/逻辑一致的分析。这是产品差异化的核心——用户不是在看 AI 总结，而是在看"用某种思维方式生成的分析"。

## 第一个目标：@qinbafrank

## 整体流程

```
采集推文 → 存入数据库 → 内容分类 → 方法论提取 → 结构化输出 → 验证回测 → 转为 Agent Skill
   ↑                                                              |
   +------ 迭代：验证不通过则补充数据/调整提取 prompt ←-----------+
```

---

## 阶段 1：推文采集与存储

### 1.1 数据源

**TwitterAPI.io**（`https://twitterapi.io`）

关键端点：
- `GET /twitter/user/timeline` — 按 userId 分页拉取推文（20条/页，cursor 翻页）
- `GET /twitter/tweet/thread_context` — 拉取完整 thread 上下文

认证方式：`x-api-key` header
定价：$0.15 / 1000 条推文，新用户有 $0.1 免费额度

### 1.2 采集策略

```
1. 用 username 查 userId
2. 用 timeline 端点 + cursor 循环拉取全部推文
3. 对 thread 类推文，用 thread_context 端点拉完整上下文
4. 过滤：去掉纯 retweet（无评论）、去掉非英文/非中文内容
5. 保留：原创推文、quote tweet、reply（带分析性质的）、完整 thread
```

### 1.3 数据库设计

在 Insforge 创建 Edge Function 管理推文数据。

**tweets 表结构**：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text PK | 推文 ID |
| author_username | text | 博主 username |
| text | text | 推文全文 |
| tweet_type | text | original / quote / reply / thread |
| conversation_id | text | thread 归属的会话 ID |
| quoted_tweet_text | text | 被引用推文的文本（如有） |
| in_reply_to_username | text | 回复对象（如有） |
| created_at | timestamptz | 推文发布时间 |
| like_count | int | 点赞数 |
| retweet_count | int | 转推数 |
| reply_count | int | 回复数 |
| view_count | int | 浏览数 |
| lang | text | 语言 |
| url | text | 推文链接 |
| raw_json | jsonb | 完整原始响应（备用） |
| category | text | 分类结果（阶段 2 回填）|
| fetched_at | timestamptz | 采集时间 |

**索引**：`author_username + created_at`、`conversation_id`、`category`

### 1.4 后端模块

创建 `backend/app/features/twitter/` 模块：

```
twitter/
├── __init__.py
├── models.py        # Pydantic 模型
├── db.py            # Insforge Edge Function 调用
├── service.py       # TwitterAPI.io 调用 + 采集逻辑
├── router.py        # 手动触发采集的 API
└── .context.md
```

环境变量新增：`TWITTER_API_KEY`（在 config.py 中添加）

### 1.5 采集 API 设计

```
POST /api/twitter/fetch-tweets
Body: { "username": "qinbafrank", "max_pages": 100 }
Auth: Depends(verify_cron_secret)  # 管理员操作

GET /api/twitter/tweets
Params: username, category, page, limit
Auth: Depends(verify_user_token)

GET /api/twitter/stats
Params: username
返回: { total_tweets, by_type: {}, by_category: {}, date_range }
```

---

## 阶段 2：内容分类

### 2.1 分类体系

用 LLM 对每条推文/thread 标注 category：

| Category | 说明 | 识别信号 |
|----------|------|----------|
| `stock_analysis` | 个股分析 | 提到 ticker、财报、估值、基本面 |
| `macro_analysis` | 宏观分析 | 利率、通胀、GDP、央行政策、经济周期 |
| `sector_analysis` | 行业/板块 | 行业趋势、板块轮动 |
| `risk_management` | 风险管理 | 仓位、止损、风控、分散化 |
| `market_sentiment` | 市场情绪 | 贪婪/恐惧、散户行为、市场温度 |
| `trading_strategy` | 交易策略 | 进出场时机、技术指标、交易规则 |
| `methodology` | 方法论阐述 | 直接讲述自己的分析框架和原则 |
| `opinion` | 观点/预测 | 看多看空但无方法论展示 |
| `other` | 其他 | 闲聊、推荐、个人生活 |

### 2.2 分类执行

```
1. 按批次处理（每批 50 条）
2. 用 Gemini Flash 做分类（成本低、速度快）
3. 分类结果回写到 tweets 表的 category 字段
4. 对 thread 类推文，将 thread 内所有推文拼接后整体分类
```

### 2.3 分类 API

```
POST /api/twitter/classify
Body: { "username": "qinbafrank", "batch_size": 50 }
Auth: Depends(verify_cron_secret)
```

---

## 阶段 3：方法论提取（核心）

### 3.1 提取维度

对每个有意义的 category（stock_analysis、macro_analysis、sector_analysis、risk_management、trading_strategy、methodology），提取以下四层：

**Layer 1: 数据偏好（Data Preferences）**
- 他关注哪些数据源和指标？
- 他引用哪些工具/平台？
- 他用哪些数字来支撑论点？

**Layer 2: 分析流程（Analytical Process）**
- 拿到一个事件/数据后他走哪几步？
- 他的分析顺序是什么？
- 他如何建立论证链？

**Layer 3: 判断标准（Decision Criteria）**
- 什么信号让他看多/看空？
- 哪些因素有否决权？
- 他怎么权衡冲突信号？

**Layer 4: 表达模式（Communication Patterns）**
- 高确信度 vs 低确信度的用语区别
- 他如何表达风险提示？
- 他的叙事结构是什么样的？

### 3.2 提取方式

**半自动流程**：

```
1. 按 category 导出推文集合
2. 喂给 Claude/GPT-4 做初步提取（用精心设计的 extraction prompt）
3. 人工审核提取结果，标注遗漏/错误
4. 调整 prompt，重新提取
5. 直到人工满意为止
```

**Extraction Prompt 核心结构**（初版，需迭代）：

```
你是一个方法论分析师。以下是 @{username} 关于 {category} 的所有推文。

你的任务不是总结他的观点，而是提取他的思维方式。
具体来说，请提取：

1. 数据偏好：他反复引用哪些数据、指标、信息源？
2. 分析流程：他分析一个 {category} 问题时，通常遵循什么步骤？
3. 判断标准：什么条件让他得出正面/负面结论？有没有"一票否决"的条件？
4. 表达模式：他用什么语言表达不同程度的确信？

要求：
- 每个发现都必须引用至少 2 条原文作为证据
- 区分"他明确说过的"和"你推断的"
- 如果某个维度的证据不足，标注"证据不足"而非编造
```

### 3.3 提取产出格式

```yaml
analyst: "qinbafrank"
methodology_version: "v1.0"
extracted_at: "2026-04-xx"
source_tweet_count: xxx

stock_analysis:
  data_preferences:
    - indicator: "自由现金流收益率 (FCF Yield)"
      frequency: "高"  # 在多少条推文中出现
      evidence:
        - tweet_id: "xxx"
          quote: "原文引用..."
        - tweet_id: "yyy"
          quote: "原文引用..."
    - indicator: "..."

  analytical_process:
    steps:
      1:
        description: "先看估值是否合理"
        evidence: [...]
      2:
        description: "再看行业地位和护城河"
        evidence: [...]
      3:
        description: "..."

  decision_criteria:
    bullish:
      - condition: "..."
        weight: "high"
        evidence: [...]
    bearish:
      - condition: "..."
        weight: "veto"  # 一票否决型
        evidence: [...]

  communication_patterns:
    high_conviction: "常用表达..."
    low_conviction: "常用表达..."
    risk_warning: "常用表达..."

macro_analysis:
  # 同样结构
  ...
```

这个 YAML 文件就是蒸馏的核心产出，存储在 `backend/app/features/twitter/methodologies/` 目录下。

---

## 阶段 4：验证回测

### 4.1 验证方法

```
1. 从推文中选 10-15 条有明确分析结论的推文
2. 只把当时的"原始数据/事件"喂给用蒸馏方法论驱动的 Agent
3. 对比 Agent 产出 vs 博主实际分析
4. 评估维度：
   - 方向一致性（看多/看空是否一致）
   - 关注点一致性（是否关注了相同的关键因素）
   - 逻辑链一致性（推理路径是否相似）
   - 表达风格一致性（语气和措辞是否接近）
```

### 4.2 迭代规则

- 方向一致性 < 70%：回到阶段 3，补充提取
- 关注点一致性 < 60%：数据偏好提取不足，需要更多证据
- 逻辑链一致性 < 50%：分析流程提取有误，需要重构
- 表达风格偏差大：communication patterns 需要更多样本

---

## 阶段 5：转化为 Agent Skill

### 5.1 Skill 结构

将验证通过的方法论转化为 LlmAgent 可用的形式：

```python
# backend/app/features/twitter/methodology_agent.py

STOCK_ANALYSIS_INSTRUCTION = """
你是一位市场分析师，你的分析方法论来自 @{analyst} 的投资框架。

## 你的分析方法论

### 数据偏好
你重点关注以下指标：
{从 YAML 注入}

### 分析流程
拿到一只股票后，你按以下步骤分析：
{从 YAML 注入}

### 判断标准
{从 YAML 注入}

### 表达风格
{从 YAML 注入}

---
现在请分析以下数据：
"""

agent = LlmAgent(
    model="gemini-3.1-flash-lite-preview",
    name="methodology_analyst",
    instruction=STOCK_ANALYSIS_INSTRUCTION,
    output_schema=MethodologyAnalysisOutput,
)
```

### 5.2 多方法论支持架构

```
methodologies/
├── qinbafrank/
│   ├── metadata.yaml       # 博主信息、蒸馏版本
│   ├── stock_analysis.yaml  # 个股方法论
│   ├── macro_analysis.yaml  # 宏观方法论
│   └── ...
├── blogger_b/               # 未来扩展
│   └── ...
└── registry.yaml            # 所有已注册方法论索引
```

运行时根据用户选择的方法论动态加载对应 YAML，注入到 Agent instruction 中。

> **2026-05-05 注**：阶段 5 的「Skill」概念演化为下方「对话产品架构」中的多层组合（L1 + L2 + L4 + L5），不再是单一 prompt 注入。

---

## 对话产品架构与 MVP 范围（2026-05-05 决议）

### 产品体验目标

用户能**随时**与博主对话——不是看一份生成的报告，而是问一个问题（关于今日事件、特定标的、博主历史观点等），得到博主思维方式 + 当前数据 + 历史原话三合一的回答。

### 单 YAML 不够的三个原因

1. **时效性**：YAML 是静态思维框架，没有「今日 NVDA 跳水」这种实时事件
2. **记忆性**：没有 RAG，Agent 无法引用博主历史观点，容易虚构
3. **燃料**：没有博主每天看的数据，Agent 只能用通用知识硬套模板，输出「正确但平庸」

### 八层产出物全景

| 层 | 名称 | 解决什么 | 形态 | MVP |
|---|---|---|---|---|
| L1 | 方法论 YAML | 怎么想 | YAML | ✅ |
| L2 | 历史观点 RAG | 说过什么 | 向量库 + 元数据 | ✅ |
| L3 | 预测追踪表 | 准不准 | JSONL/SQL | ❌ 延后 |
| L4 | 数据视角清单 | 每天看什么 | YAML + 实时拉取 | ✅ |
| L5 | 信息源清单 | 读什么 | YAML（轻量版） | ✅（轻量版） |
| L6 | 实体词典 | 关注哪些标的与人 | YAML | ❌ 延后 |
| L7 | 立场档案 | 现在是什么观点 | YAML（动态） | ❌ 延后 |
| L8 | 风格语料库 | 怎么说话 | few-shot 样本 | ❌ 延后 |

### MVP 四层细节

**L1 方法论 YAML**
- 由阶段 3 产出，作为 system prompt 核心
- 存储路径：`backend/app/features/twitter/methodologies/<analyst>/methodology.yaml`

**L2 历史观点 RAG**
- 把已采集的 2460 条推文 + 7 篇文章切块 + 向量化（中文优先 `bge-m3` 或 `text-embedding-3-large`）
- 元数据索引：`ticker`、`sector`、`macro_topic`、`event_type`、`conviction_level`、`tweet_id`、`created_at`
- 多路召回：向量相似 + ticker 精确匹配 + 时间衰减加权（最近半年权重高）
- 输出格式：`{quote, original_url, date, context}`
- **强制**：Agent 必须逐字引用，不得改写

**L4 数据视角清单**
- 输出 `methodologies/<analyst>/data_lens.yaml`：10-20 个核心指标
- 字段：`id`、`source`（FRED/FMP 等）、`reason`（博主为何关注）、`reference_threshold`（参考阈值）、`cadence`（每日/每周/事件触发）
- 调用流程：用户提问 → 路由识别话题 → 按 YAML 拉对应数据 → 注入 prompt
- 复用现有 FMP/FRED 集成（在 `backend/app/shared/`）

**L5 信息源清单（轻量版）**
- 输出 `methodologies/<analyst>/sources.yaml`：博主常引用的源
- **不做**爬虫、**不做**实时聚合、**不做**全文入库
- Agent 回答时可声明「博主通常会查 X 源」作为推理依据
- 中量版（Web Search 工具）→ v1.1
- 重量版（爬虫入库 FOMC/SEC/earnings transcripts）→ v2

### MVP 不包含的四层（延后理由）

| 层 | 延后理由 |
|---|---|
| L3 预测追踪 | 是产品差异化护城河（「博主胜率」卖点），但不是对话能不能跑起来的必要条件。等 MVP 验证商业模型后再做 |
| L6 实体词典 | 现代 LLM 实体归一化能力够用。唯一风险：博主私人黑话（某标的特定外号）让 RAG 召回漏掉。**应对**：阶段 2 分类完成后扫高频术语，发现黑话再补 |
| L7 立场档案 | 是 L2 RAG 的派生物。L2 加时间衰减权重，能从最近推文里自然召回博主当前立场，无需单独维护一份动态 YAML |
| L8 风格语料库 | 每次对话从 L2 RAG 召回 5-10 条博主原话喂进 prompt，LLM 自动学到风格。显式建模画蛇添足 |

### 对话运行时架构

```
用户输入
   ↓
[1] 路由分析：识别 ticker / topic / event / question_type
   ↓
[2] 平行检索：
    - L2 RAG：博主历史相关原话（带时间衰减）
    - L5 sources.yaml：识别相关信息源
   ↓
[3] 数据注入：
    - L4：拉取相关 ticker/topic 的实时数据
   ↓
[4] Prompt 组装：
    - System：L1 方法论 + 风格指引（RAG 召回的原话作为 few-shot）
    - Context：L2 引用 + L4 数据 + L5 源声明
   ↓
[5] LLM 生成
   ↓
[6] 后处理：
    - 强制 attribution 检查（每个事实声明配引用或数据源）
```

### 非协商项：Attribution

每一个 Agent 回答**必须**标注：
- 哪条推文（`tweet_id` + 原始链接，前端可点击跳转）
- 用了什么实时数据（数据源名 + 时间戳）

解决三个问题：
- **版权风险** — 摘要 + 跳转原文，而非全文展示
- **幻觉风险** — Agent 不能凭空说「博主认为 X」
- **信任建设** — 用户能验证每一句话

砍掉的 L3/L6/L7/L8 都在**内容质量**层面起作用；attribution 在**信任**层面起作用。前者可缓，后者不能省。

### MVP 排期估算

基于阶段 1 已完成、阶段 2 即将启动：

| 工作 | 估算 |
|---|---|
| 阶段 2：分类 | 3-5 天 |
| 阶段 3：方法论提取（L1） | 1-2 周（半自动 + 人工迭代） |
| L2 RAG 工程化 | 1 周 |
| L4 数据视角实现 | 3-5 天 |
| L5 sources.yaml | 1 天 |
| 对话路由 + 前端 chat UI | 1-2 周 |
| **总计** | **6-8 周** |

**MVP 核心验证假设**：用户是否愿意为「跟博主对话」付费。

---

## 实施顺序

### 上游：方法论蒸馏管线

| 阶段 | 工作内容 | 产出 |
|------|----------|------|
| **1a** | 创建 twitter 模块骨架 + TwitterAPI.io 集成 | service.py 能调通 API |
| **1b** | 创建 Insforge Edge Function + db.py | 推文能存取 |
| **1c** | 采集 @qinbafrank 全部推文 | 数据库中有完整推文数据 |
| **2** | 实现分类逻辑 + 执行分类 | 每条推文有 category 标签 |
| **3** | 设计 extraction prompt + 半自动提取 | L1 方法论 YAML 文件 |
| **4** | 选取验证样本 + 回测 | 验证报告 + 迭代记录 |

### 下游：对话产品 MVP（2026-05-05 新增）

| 步骤 | 工作内容 | 产出 |
|------|----------|------|
| **MVP-1** | L2 RAG 工程化（embedding + 元数据 + 时间衰减召回） | 可检索的博主观点知识库 |
| **MVP-2** | L4 data_lens.yaml + 数据获取路由 | Agent 能拉到实时数据 |
| **MVP-3** | L5 sources.yaml（轻量版） | 信息源声明能力 |
| **MVP-4** | 对话 Agent 装配（L1 + L2 + L4 + L5 + 强制 attribution） | 可对话的 methodology_agent |
| **MVP-5** | 前端 chat UI + 引用跳转 | 完整对话体验，可上线灰度 |

> 原阶段 5「转化为 Agent Skill」演化为 MVP-1 ~ MVP-5。

## 开放问题（已决议）

1. **thread 拼接策略** — 看实际数据后决定
2. ~~多语言~~ — **中文为主**，分类和提取 prompt 用中文
3. ~~引用推文的权重~~ — **不做加权**，平等对待所有推文
4. ~~方法论演化~~ — **只取最近一年推文**，不区分时间段
5. ~~版权/伦理~~ — **将寻求官方合作**，目前先做技术验证
