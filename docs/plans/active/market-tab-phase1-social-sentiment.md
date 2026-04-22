# Phase 1 技术方案 — 社交媒体舆情与深度分析聚合

> Status: Planning
> Updated: 2026-04-21
> Parent: `docs/plans/active/market-tab-revamp.md`
> Goal: 用户打开市场 Tab 能看到中英文社交媒体上关于该股票的热门讨论和深度分析

## 核心定位

不是"情绪仪表盘"，而是**内容策展** — 把各平台上关于这只股票最值得看的内容聚合在一起。

用户来这里是为了：
1. 看到博主/分析师对这只股票的评价和分析
2. 发现英文和中文社区的热门讨论
3. 找到有深度的 DD (Due Diligence) 分析帖
4. 快速理解社区对这只股票的态度

---

## 数据源决策

### 调研结论

| 数据源 | 成本 | 内容类型 | 实现难度 | 决策 |
|--------|------|---------|---------|------|
| **Reddit (PRAW)** | $0（免费 100 req/min） | 英文热帖 + DD 深度分析 | 中 | **必做** |
| **雪球 (Xueqiu)** | $0（非官方 API） | 中文深度分析 + 美股讨论 | 中 | **必做** |
| **FMP Social Sentiment** | $0（已付费） | 讨论量趋势 + 情绪分数 | 极低 | **必做（量化补充）** |
| **X/Twitter** | $0.005/条 ~$150/月 | FinTwit 博主评论 | 高 | **Phase 2 考虑** |
| **Seeking Alpha** | ~$10-50/月 (RapidAPI) | 最专业的英文分析 | 中 | **Phase 2 考虑** |
| **Substack** | $0（RSS 免费） | 独立分析师长文 | 低 | **Phase 2 考虑** |

### 最终方案：Reddit + 雪球 + FMP 量化

**三层互补**：
- **Reddit** → 英文社区：热帖 + DD 深度分析，按 flair 过滤高质量内容
- **雪球** → 中文社区：美股/A 股深度分析，专业投资者内容
- **FMP** → 量化指标：讨论量趋势、跨平台情绪分数（Reddit+Twitter+StockTwits）

**为什么选雪球而不是东方财富**：
- 雪球：专业投资者/基金经理活跃，深度分析质量高，美股覆盖优秀
- 东方财富股吧：散户为主，灌水多，深度内容少

---

## 后端实现

### 1. 新增环境变量

```bash
# backend/.env
REDDIT_CLIENT_ID=xxx              # reddit.com/prefs/apps 创建 script app
REDDIT_CLIENT_SECRET=xxx
XUEQIU_COOKIE=xxx                 # 浏览器登录雪球后复制 Cookie（含 xq_a_token）
```

`config.py` 新增：
```python
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "")
XUEQIU_COOKIE = os.getenv("XUEQIU_COOKIE", "")
```

### 2. 新增依赖

```
praw>=7.8.0     # Python Reddit API Wrapper
```

### 3. Reddit Service

新建 `backend/app/shared/reddit_service.py`

**核心能力**：
- `search_ticker(ticker, time_filter, limit)` — 搜索特定 ticker 的帖子
- `search_deep_analysis(ticker)` — 专门搜索 DD/深度分析帖子（按 flair 过滤）
- 自动过滤低质量内容（meme、低分帖、无关帖）
- 内存缓存 15 分钟

**搜索策略**：

```python
# 热帖搜索 — 跨 5 个子版块
STOCK_SUBREDDITS = "stocks+investing+wallstreetbets+options+stockmarket"
subreddit.search(f"${ticker} OR {ticker}", sort="relevance", time_filter="week")

# DD 深度分析搜索 — 按 flair 过滤
for sub_name in ["stocks", "wallstreetbets", "SecurityAnalysis", "ValueInvesting"]:
    subreddit.search(f'flair:"DD" {ticker}', sort="top", time_filter="month")
```

**质量评分算法**（区分深度分析 vs 噪音）：

```python
def quality_score(post) -> int:
    """0-17 分，>= 8 视为"深度分析" """
    points = 0
    text = post.selftext or ""
    word_count = len(text.split())

    # 长度（深度分析通常 500+ 词）
    if word_count >= 1000: points += 3
    elif word_count >= 500: points += 2

    # Flair 信号
    flair = (post.link_flair_text or "").lower()
    if any(f in flair for f in ["dd", "thesis", "due diligence", "analysis"]):
        points += 3

    # 数据密度（包含数字、百分比、金额）
    numbers = len(re.findall(r'\$[\d,.]+|\d+\.?\d*%|\d{4,}', text))
    if numbers >= 10: points += 3
    elif numbers >= 5: points += 2

    # 社区认可
    if post.score >= 100: points += 3
    elif post.score >= 50: points += 2
    elif post.score >= 10: points += 1

    # 结构化（有 markdown 标题）
    if re.search(r'^#{1,3}\s', text, re.MULTILINE): points += 1

    # 财务术语密度
    fin_terms = ['revenue', 'earnings', 'margin', 'valuation', 'p/e', 'dcf',
                 'cash flow', 'growth', 'market cap', 'ebitda', 'guidance']
    term_count = sum(1 for t in fin_terms if t in text.lower())
    if term_count >= 5: points += 3
    elif term_count >= 3: points += 2

    return points
```

**返回数据结构**：
```python
{
    "id": "abc123",
    "title": "NVDA Deep Dive: Why Data Center Revenue Will Double",
    "selftext": "完整正文（截取前 2000 字符）...",
    "author": "stockguru99",
    "subreddit": "stocks",
    "flair": "DD",
    "score": 542,
    "upvote_ratio": 0.94,
    "num_comments": 89,
    "created_utc": 1745193600,
    "permalink": "https://reddit.com/r/stocks/comments/abc123/...",
    "word_count": 1850,
    "quality_score": 12,          # 质量评分
    "is_deep_analysis": True,     # quality_score >= 8
}
```

### 4. 雪球 Service

新建 `backend/app/shared/xueqiu_service.py`

**核心能力**：
- `get_stock_discussions(symbol, count, sort)` — 获取股票讨论帖子
- `search_stock_posts(symbol, query)` — 搜索特定股票的帖子
- Cookie 认证 + 请求限速（10-20 秒间隔）
- 内存缓存 30 分钟

**技术细节**：

雪球没有官方 API，使用逆向工程的 Web 端点：

```python
import httpx
import time
import asyncio

class XueqiuService:

    BASE_URL = "https://xueqiu.com"

    def __init__(self, cookie: str):
        self._cookie = cookie
        self._headers = {
            "Cookie": cookie,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://xueqiu.com/",
            "X-Requested-With": "XMLHttpRequest",
        }
        self._last_request = 0
        self._min_interval = 12  # 秒，安全间隔

    async def _rate_limited_get(self, url: str, params: dict) -> dict:
        """限速 GET 请求"""
        elapsed = time.monotonic() - self._last_request
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params, headers=self._headers)
            self._last_request = time.monotonic()
            resp.raise_for_status()
            return resp.json()

    async def get_stock_discussions(
        self,
        symbol: str,       # "NVDA" 或 "SH600519"
        count: int = 20,
        sort: str = "time", # "time" | "reply" | "relevance"
        source: str = "all" # "all" | "user"(讨论) | "news"(新闻)
    ) -> list[dict]:
        """获取股票时间线/讨论"""
        # 端点 1: 股票时间线
        data = await self._rate_limited_get(
            f"{self.BASE_URL}/statuses/stock_timeline.json",
            {"symbol_id": symbol, "symbol": symbol,
             "source": source, "count": count, "page": 1}
        )
        return self._normalize_posts(data)

    async def search_stock_posts(
        self,
        symbol: str,
        count: int = 20,
        sort: str = "time",
    ) -> list[dict]:
        """搜索股票相关帖子"""
        data = await self._rate_limited_get(
            f"{self.BASE_URL}/statuses/search.json",
            {"q": "", "symbol": symbol, "count": count,
             "page": 1, "sort": sort, "source": "user"}
        )
        return self._normalize_posts(data)

    def _normalize_posts(self, data: dict) -> list[dict]:
        """统一格式"""
        posts = []
        raw_list = data.get("list") or data.get("statuses") or []
        for item in raw_list:
            text = item.get("text") or item.get("description") or ""
            # 雪球返回 HTML，需要清理
            clean_text = self._strip_html(text)

            posts.append({
                "id": str(item.get("id", "")),
                "title": item.get("title") or clean_text[:80],
                "text": clean_text[:3000],  # 截取前 3000 字
                "author": item.get("user", {}).get("screen_name", ""),
                "author_followers": item.get("user", {}).get("followers_count", 0),
                "created_at": item.get("created_at", 0),
                "reply_count": item.get("reply_count", 0),
                "retweet_count": item.get("retweet_count", 0),
                "like_count": item.get("like_count", 0),
                "source": "xueqiu",
                "url": f"https://xueqiu.com{item.get('target', '')}",
            })

        # 按互动量排序，过滤掉纯转发/低质量
        posts = [p for p in posts if len(p["text"]) > 50]
        posts.sort(key=lambda p: p["reply_count"] + p["like_count"], reverse=True)
        return posts[:count]

    @staticmethod
    def _strip_html(html: str) -> str:
        """简单清理 HTML 标签"""
        import re
        clean = re.sub(r'<[^>]+>', '', html)
        clean = re.sub(r'&nbsp;', ' ', clean)
        clean = re.sub(r'\s+', ' ', clean).strip()
        return clean
```

**降级策略**：雪球依赖 Cookie 认证，token 会过期。当请求返回 401/403 时：
- 日志告警提醒手动更新 Cookie
- 前端该区块显示"暂无雪球数据"，不影响 Reddit 和新闻展示

### 5. FMP Social Sentiment（量化指标层）

在 `fmp_service.py` 新增 `get_social_sentiment(symbol, limit)` 方法。

沿用上一版方案，提供讨论量趋势和跨平台情绪分数作为量化补充。这部分是图表数据，不是内容展示。

### 6. LLM 内容提炼 Agent

新建 `backend/app/features/stock/agent/sentiment.py`

**不同于上一版的"情绪分类"，这次做的是"内容提炼"**：
- 对 Reddit DD 帖和雪球长文做**核心观点提取**（中文，1-2 句话）
- 判断作者立场（看涨/看跌/中性）
- 提取关键数据点（目标价、财务数据等）

```python
CONTENT_EXTRACTION_INSTRUCTION = """You are a financial content curator.
Given social media posts about a stock, extract the key information for each post.

For each post, provide:
1. key_point: 核心观点（1-2 句中文，概括作者的核心论点）
2. stance: 作者立场 "bullish" | "bearish" | "neutral" | "mixed"
3. data_points: 帖子中提到的关键数据（目标价、财务指标等），如果没有则为空列表
4. depth: 内容深度 "deep_analysis" | "opinion" | "news_share" | "question"

Also provide an overall summary of the discussion sentiment."""
```

**批量处理**：一次 LLM 调用处理 10-15 条帖子，成本 ~$0.0003/次。

### 7. 聚合端点

`GET /stocks/{symbol}/social-sentiment`

并行拉取三个数据源 + LLM 提炼：

```python
# 并行获取
reddit_hot, reddit_dd, xueqiu, fmp_trend, news = await asyncio.gather(
    asyncio.to_thread(reddit.search_ticker, symbol, "week", 30),
    asyncio.to_thread(reddit.search_deep_analysis, symbol, 20),
    xueqiu.get_stock_discussions(symbol, 20),
    asyncio.to_thread(fmp.get_social_sentiment, symbol, 168),  # 7 days hourly
    asyncio.to_thread(get_fmp_news, 7, [symbol]),
    return_exceptions=True,
)

# LLM 批量提炼 top 帖子的核心观点
all_posts = merge_and_rank(reddit_hot, reddit_dd, xueqiu_posts)
analysis = await extract_key_points(symbol, all_posts[:15])
```

**响应结构**：

```json
{
  "success": true,
  "symbol": "NVDA",

  "sentiment_overview": {
    "overall": "bullish",
    "bullish_pct": 65,
    "bearish_pct": 20,
    "neutral_pct": 15,
    "discussion_volume_24h": 450,
    "volume_change_pct": 34.5
  },

  "mention_trend": [
    {"date": "2026-04-21 14:00", "mentions": 45, "sentiment_score": 0.32, "source": "reddit"},
    {"date": "2026-04-21 14:00", "mentions": 120, "sentiment_score": 0.18, "source": "twitter"}
  ],

  "posts": [
    {
      "id": "reddit_abc123",
      "platform": "reddit",
      "subreddit": "stocks",
      "flair": "DD",
      "title": "NVDA Deep Dive: Why Data Center Revenue Will Double",
      "preview": "I've been analyzing NVIDIA's data center segment...",
      "author": "stockguru99",
      "score": 542,
      "num_comments": 89,
      "created_utc": 1745193600,
      "url": "https://reddit.com/r/stocks/comments/abc123/...",
      "is_deep_analysis": true,
      "word_count": 1850,
      "key_point": "作者通过 DCF 模型分析认为 NVDA 数据中心收入将在 FY27 翻倍，目标价 $180",
      "stance": "bullish",
      "data_points": ["DCF 目标价 $180", "数据���心收入 FY27E $120B"],
      "depth": "deep_analysis"
    },
    {
      "id": "xueqiu_12345",
      "platform": "xueqiu",
      "title": "英伟达的护城河到底有多深？",
      "preview": "从 CUDA 生态锁定效应的角度来分析...",
      "author": "雪球大V",
      "author_followers": 85000,
      "reply_count": 234,
      "like_count": 1200,
      "created_at": 1745150000,
      "url": "https://xueqiu.com/1234567890/12345",
      "is_deep_analysis": true,
      "key_point": "从 CUDA 生态壁垒角度看，英伟达的竞争优势短期内难以被替代",
      "stance": "bullish",
      "data_points": ["CUDA 开发者生态 400 万+", "AI 训练市占率 >80%"],
      "depth": "deep_analysis"
    },
    {
      "id": "reddit_def456",
      "platform": "reddit",
      "subreddit": "wallstreetbets",
      "title": "Just loaded up on NVDA calls before earnings",
      "preview": "Earnings next week, data center gonna crush...",
      "author": "yolo_trader",
      "score": 1200,
      "num_comments": 340,
      "created_utc": 1745180000,
      "url": "https://reddit.com/r/wallstreetbets/comments/def456/...",
      "is_deep_analysis": false,
      "word_count": 120,
      "key_point": "看好财报前买入看涨期权",
      "stance": "bullish",
      "data_points": [],
      "depth": "opinion"
    }
  ],

  "news_articles": [
    {
      "title": "NVIDIA Announces New AI Chip Architecture",
      "published_date": "2026-04-21T10:30:00Z",
      "source": "Bloomberg",
      "url": "https://...",
      "summary": "NVIDIA unveiled..."
    }
  ],

  "meta": {
    "reddit_available": true,
    "xueqiu_available": true,
    "fmp_sentiment_available": true,
    "posts_analyzed": 15,
    "days": 7
  }
}
```

---

## 前端实现

### SocialSentimentTab 组件

`frontend/src/components/market/SocialSentimentTab.tsx`

```
+-- SocialSentimentTab ------------------------------------------------+
|                                                                       |
|  +-- SentimentOverviewBar (顶部概览) ----------------------------+   |
|  | 看涨 65% =================== 看跌 20% ==== 中性 15%          |   |
|  | 24h 讨论量 450 (+34.5%)                                       |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  +-- MentionTrendChart (讨论量趋势迷你图) -----------------------+   |
|  |  7 天讨论量面积图（高度受限，不占太多空间）                     |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  +-- 过滤栏 ----------------------------------------------------+   |
|  | [全部] [深度分析] [Reddit] [雪球] [新闻]                       |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  +-- 内容时间线 (核心区域，占最大面积) -------------------------+   |
|  |                                                                |   |
|  |  +-- PostCard (深度分析) --------------------------------+    |   |
|  |  | [DD] [Reddit r/stocks] [Bullish]         2 天前       |    |   |
|  |  | NVDA Deep Dive: Why Data Center Revenue Will Double    |    |   |
|  |  | AI 提炼: 作者通过 DCF 模型分析认为 NVDA 数据中心收入   |    |   |
|  |  |          将在 FY27 翻倍，目标价 $180                   |    |   |
|  |  | 关键数据: DCF 目标价 $180 | 数据中心收入 FY27E $120B   |    |   |
|  |  | 542 upvotes · 89 comments                   [查看原文] |    |   |
|  |  +-------------------------------------------------------+    |   |
|  |                                                                |   |
|  |  +-- PostCard (雪球深度) --------------------------------+    |   |
|  |  | [雪球] [85k 粉丝] [Bullish]               1 天前       |    |   |
|  |  | 英伟达的护城河到底有多深？                               |    |   |
|  |  | AI 提炼: 从 CUDA 生态壁垒角度看，英伟达的竞争优势       |    |   |
|  |  |          短期内难以被替代                               |    |   |
|  |  | 关���数据: CUDA 开发者 400 万+ | AI 训练市占率 >80%      |    |   |
|  |  | 1200 赞 · 234 评论                         [查看原文]  |    |   |
|  |  +-------------------------------------------------------+    |   |
|  |                                                                |   |
|  |  +-- PostCard (热帖) -----------------------------------+    |   |
|  |  | [Reddit r/wsb] [Bullish]                    6h ago     |    |   |
|  |  | Just loaded up on NVDA calls before earnings           |    |   |
|  |  | AI 提炼: 看好财报前买入看涨期权                         |    |   |
|  |  | 1200 upvotes · 340 comments                [查看原文]  |    |   |
|  |  +-------------------------------------------------------+    |   |
|  |                                                                |   |
|  |  +-- NewsCard -------------------------------------------+    |   |
|  |  | [Bloomberg] 新闻                          10h ago      |    |   |
|  |  | NVIDIA Announces New AI Chip Architecture              |    |   |
|  |  | "NVIDIA unveiled its next-generation..."  [查看原文]    |    |   |
|  |  +-------------------------------------------------------+    |   |
|  |                                                                |   |
|  |  [加载更多]                                                    |   |
|  +---------------------------------------------------------------+   |
+----------------------------------------------------------------------+
```

### 设计要点

**PostCard 根据类型差异化展示**：
- **深度分析帖** (`is_deep_analysis: true`)：突出显示，有 "DD" badge，展示 AI 提炼的核心观点 + 关键数据点
- **热帖/观点帖**：正常显示，有情绪标签，简短提炼
- **雪球帖**：显示作者粉丝数作为可信度指标
- **新闻**：简化显示，来源 + 标题 + 摘要

**过滤标签**：
- `全部`：Reddit + 雪球 + 新闻混合，按时间倒序
- `深度分析`：只显示 `is_deep_analysis: true` 的帖子
- `Reddit`：仅 Reddit 帖子
- `雪球`：仅雪球帖子
- `新闻`：仅新闻文章

**情绪标签颜色**：
- Bullish → 绿色 badge
- Bearish → 红色 badge
- Neutral → 灰色 badge
- Mixed → 黄色 badge

---

## 缓存策略

| 数据 | 后端 TTL | 前端 staleTime | 理由 |
|------|---------|---------------|------|
| Reddit 搜索 | 15 min | 15 min | 帖子持续产生 |
| 雪球讨论 | 30 min | 30 min | 请求限速严格，缓存更久 |
| FMP 情绪趋势 | 15 min | 15 min | 量化指标中等变化频率 |
| LLM 内容提炼 | 60 min | 60 min | 成本高，结果稳定 |
| 新闻 | 15 min | 15 min | 沿用已有策略 |

---

## 成本估算

| 项目 | 单价 | 日用量 | 月成本 |
|------|------|--------|--------|
| Reddit API | 免费 | ~500 calls | $0 |
| 雪球 | 免费（非官方） | ~200 calls | $0 |
| FMP 社交情绪 | 已包含在现有套餐 | ~200 calls | $0 |
| Gemini Flash Lite (内容提炼) | ~$0.0003/次 | ~200 次 | ~$1.8 |
| **总计** | | | **~$1.8/月** |

---

## 降级策略

| 场景 | 降级行为 |
|------|---------|
| Reddit 无 API key | 跳过 Reddit，只显示雪球 + FMP + ���闻 |
| 雪球 Cookie 过期 | 跳过雪球，只显示 Reddit + FMP + 新闻，日志告警 |
| FMP 情绪端点不可用 | 隐藏趋势图，只显示帖子时间线 |
| LLM 分析失败 | 帖子正常显示，但无 AI 提炼（key_point/stance 为 null） |
| 全部不可用 | 退化为纯新闻列表（已有功能） |

前端通过 `meta.reddit_available`、`meta.xueqiu_available`、`meta.fmp_sentiment_available` 条件渲染。

---

## 实现步骤

### Step 1: 验证数据源可用性 (1h)
- [ ] curl 测试 FMP `/api/v4/social-sentiment?symbol=AAPL` 确认套餐支持
- [ ] reddit.com/prefs/apps 创建 script 应用，获取 credentials
- [ ] 浏览器登录雪球，导出 Cookie，curl 测试 `/statuses/stock_timeline.json?symbol=NVDA`

### Step 2: 后端 — Reddit Service (2.5h)
- [ ] 新建 `backend/app/shared/reddit_service.py`
- [ ] 实现 `search_ticker()` + `search_deep_analysis()` + 质量评分
- [ ] pip install praw
- [ ] 手动测试 NVDA/AAPL/TSLA

### Step 3: 后端 — 雪球 Service (2h)
- [ ] 新建 `backend/app/shared/xueqiu_service.py`
- [ ] 实现 `get_stock_discussions()` + `search_stock_posts()`
- [ ] 限速器 + Cookie 认证 + HTML 清理
- [ ] 手动测试美股 (NVDA) 和 A 股 (SH600519)

### Step 4: 后端 — FMP 社交情绪方法 (0.5h)
- [ ] fmp_service.py 新增 `get_social_sentiment()`

### Step 5: 后端 — LLM 内容提炼 Agent (1.5h)
- [ ] ���建 `backend/app/features/stock/agent/sentiment.py`
- [ ] 实现批量内容提炼（核心观点 + 立场 + 关键数据点）
- [ ] 测试输出格式和质量

### Step 6: 后端 — 聚合端点 (2h)
- [ ] router.py 新增 `GET /{symbol}/social-sentiment`
- [ ] 并行调用 Reddit + 雪球 + FMP + News + LLM
- [ ] 缓存 15 min
- [ ] 降级处理（各数据源独立 fallback）
- [ ] 测试热门股 + 冷门股

### Step 7: 前端 — Hook + 类型 (1h)
- [ ] use-stock-data.ts 新增 `useSocialSentiment` hook + 类型定义

### Step 8: 前端 — SocialSentimentTab (5h)
- [ ] SentimentOverviewBar（情绪堆叠条 + 讨论量）
- [ ] MentionTrendChart（讨论量迷你趋势图）
- [ ] PostCard 组件（区分深度分析/热帖/雪球/新闻四种样式）
- [ ] 过滤标签（全部/深度分析/Reddit/雪球/新闻）
- [ ] 内容时间线（混合排序 + 虚拟滚动或分页）
- [ ] Loading/Error/Empty 状态

### Step 9: 前端 — MarketTab 集成 (1h)
- [ ] 新增"舆情动态"子 Tab，设为默认选中

### Step 10: 测试 + 打磨 (2h)
- [ ] 热门股 (AAPL/NVDA/TSLA) + 冷门股全流程
- [ ] 降级测试（逐个断开数据源）
- [ ] 移动端响应式
- [ ] 更新 .context.md

**总估时：~18h**

---

## 验收标准

- [ ] 打开任意股票市场 Tab，默认看到"舆情动态"
- [ ] 能看到 Reddit 英文帖子和雪球中文帖子混合在同一时间线
- [ ] 深度分析帖有 "DD" 标签，突出显示 AI 提炼的核心观点和关键数据
- [ ] 雪球帖子显示作者粉丝数，Reddit 帖子显示 upvote 和评论数
- [ ] 每条帖子有情绪标签（Bullish/Bearish/Neutral）
- [ ] 过滤标签可切换"全部/深度分析/Reddit/雪球/新闻"
- [ ] 讨论量趋势图显示最近 7 天变化
- [ ] 冷门股有友好的空状态
- [ ] Reddit/雪球 任一不可用时自动降级，不影响其他
- [ ] 所有帖子可点击"查看原文"跳转到原平台

---

## 风险

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| FMP 套餐不含社交情绪 | 中 | 缺少趋势图 | Step 1 验证；不含则只用 Reddit+雪球 |
| 雪球 Cookie 频繁过期 | 中 | 中文内容断流 | 监控告警 + 手动更新；考虑自动化刷新 |
| 雪球反爬升级 | 低 | 中文内容不可用 | 降级到纯 Reddit+新闻 |
| Reddit 冷门 ticker 无结果 | 中 | 小盘股内容少 | 空状态 UI + 只显示新闻 |
| LLM 提炼质量不稳定 | 低 | 提炼内容不准 | 前端显示原文可点击验证 |
| 雪球数据抓取的法律风险 | 低 | 合规问题 | 只抓公开内容，标注来源，不重新发布全文 |

## 后续扩展（Phase 2+）

- **Twitter/X FinTwit**：通过 TwitterAPI.io ($0.15/千条) 接入热门 FinTwit 账号内容
- **Seeking Alpha**：通过 RapidAPI 接入专业分析文章
- **Substack**：通过 RSS 接入财经独立分析师长文
- **YouTube 视频摘要**：已在 Phase 4 计划中

## 相关文件清单

**新增**:
- `backend/app/shared/reddit_service.py` — Reddit 数据获取
- `backend/app/shared/xueqiu_service.py` — 雪球数据获取
- `backend/app/features/stock/agent/sentiment.py` — LLM 内容提炼
- `frontend/src/components/market/SocialSentimentTab.tsx` — 舆情 Tab 主组件

**修改**:
- `backend/app/core/config.py` — 新增 REDDIT_*/XUEQIU_* 配置
- `backend/app/shared/fmp_service.py` — 新增社交情绪方法
- `backend/app/features/stock/router.py` — 新增 social-sentiment 端点
- `frontend/src/hooks/queries/use-stock-data.ts` — 新增 hook
- `frontend/src/app/stock/[symbol]/_components/MarketTab.tsx` — 新增子 Tab
- `backend/requirements.txt` — 新增 praw
