# KOL 方法论蒸馏计划

> Status: In Progress — 阶段 1 完成，可进入阶段 2
> Updated: 2026-04-25
> Related: `backend/app/features/twitter/`
> Vision: 从推特博主内容中提取可复用的分析方法��，让 AI Agent 用该方法论分析新数据，产出差异化内容

## 进度记录

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

---

## 实施顺序

| 阶段 | 工作内容 | 产出 |
|------|----------|------|
| **1a** | 创建 twitter 模块骨架 + TwitterAPI.io 集成 | service.py 能调通 API |
| **1b** | 创建 Insforge Edge Function + db.py | 推文能存取 |
| **1c** | 采集 @qinbafrank 全部推文 | 数据库中有完整推文数据 |
| **2** | 实现分类逻辑 + 执行分类 | 每条推文有 category 标签 |
| **3** | 设计 extraction prompt + 半自动提取 | 方法论 YAML 文件 |
| **4** | 选取验证样本 + 回测 | 验证报告 + 迭代记录 |
| **5** | 实现 methodology_agent + 动态加载 | 可运行的 Agent Skill |

## 开放问题（已决议）

1. **thread 拼接策略** — 看实际数据后决定
2. ~~多语言~~ — **中文为主**，分类和提取 prompt 用中文
3. ~~引用推文的权重~~ — **不做加权**，平等对待所有推文
4. ~~方法论演化~~ — **只取最近一年推文**，不区分时间段
5. ~~版权/伦理~~ — **将寻求官方合作**，目前先做技术验证
