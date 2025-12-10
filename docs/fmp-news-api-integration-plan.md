# FMP News API Integration Plan

基于 Financial Modeling Prep (FMP) API 文档的股票新闻获取集成方案。

## 1. API 概览

FMP 提供多种新闻相关端点,覆盖股票、加密货币、外汇和通用财经新闻。

### 1.1 可用端点汇总

| 端点类型 | 最新新闻 (Latest) | 搜索新闻 (Search) |
|---------|------------------|-------------------|
| **股票新闻** | `/stable/news/stock-latest` | `/stable/news/stock` |
| **加密货币新闻** | `/stable/news/crypto-latest` | `/stable/news/crypto` |
| **外汇新闻** | `/stable/news/forex-latest` | `/stable/news/forex` |
| **通用新闻** | `/stable/news/general-latest` | - |
| **新闻稿** | - | `/stable/news/press-releases` |

### 1.2 API 版本说明

- **Stable API (推荐)**: `/stable/news/*` - 新版稳定接口
- **Legacy API (v3/v4)**: `/api/v3/stock_news`, `/api/v4/crypto_news` - 旧版接口,仍可用

---

## 2. 股票新闻 API 详细规格

### 2.1 搜索股票新闻 (按股票代码)

**端点**: `GET /stable/news/stock`

**用途**: 获取特定股票的相关新闻

**参数**:
| 参数 | 类型 | 必填 | 描述 |
|-----|------|-----|------|
| `symbols` | string | 是 | 股票代码,逗号分隔 (如 `AAPL,GOOG`) |
| `from` | date | 否 | 起始日期 (YYYY-MM-DD) |
| `to` | date | 否 | 结束日期 (YYYY-MM-DD) |
| `page` | number | 否 | 页码,默认 0 |
| `limit` | number | 否 | 每页数量,最大 250 |

**请求示例**:
```
https://financialmodelingprep.com/stable/news/stock?symbols=AAPL,TSLA&from=2025-01-01&to=2025-12-08&limit=20&page=0
```

**响应字段**:
```json
[
  {
    "symbol": "AAPL",
    "publishedDate": "2025-02-03 21:05:14",
    "publisher": "Zacks Investment Research",
    "title": "Apple & China Tariffs: A Closer Look",
    "image": "https://images.financialmodelingprep.com/...",
    "site": "zacks.com",
    "text": "Tariffs have been the talk...",
    "url": "https://www.zacks.com/..."
  }
]
```

### 2.2 获取最新股票新闻 (全市场)

**端点**: `GET /stable/news/stock-latest`

**用途**: 获取最新市场股票新闻流

**参数**:
| 参数 | 类型 | 必填 | 描述 |
|-----|------|-----|------|
| `from` | date | 否 | 起始日期 |
| `to` | date | 否 | 结束日期 |
| `page` | number | 否 | 页码,默认 0,最大 100 |
| `limit` | number | 否 | 每页数量,默认 20,最大 250 |

**请求示例**:
```
https://financialmodelingprep.com/stable/news/stock-latest?limit=50&page=0
```

---

## 3. 新闻稿 API (Press Releases)

**端点**: `GET /stable/news/press-releases`

**用途**: 获取公司官方新闻稿,如财报发布、重大公告等

**参数**:
| 参数 | 类型 | 必填 | 描述 |
|-----|------|-----|------|
| `symbols` | string | 是 | 股票代码,逗号分隔 |
| `from` | date | 否 | 起始日期 |
| `to` | date | 否 | 结束日期 |
| `page` | number | 否 | 页码 |
| `limit` | number | 否 | 每页数量,最大 250 |

**响应示例**:
```json
[
  {
    "symbol": "AAPL",
    "publishedDate": "2025-01-30 16:30:00",
    "publisher": "Business Wire",
    "title": "Apple reports first quarter results",
    "site": "businesswire.com",
    "text": "CUPERTINO, Calif.--(BUSINESS WIRE)--Apple today announced...",
    "url": "https://www.businesswire.com/..."
  }
]
```

---

## 4. 其他新闻类型

### 4.1 加密货币新闻

| 端点 | 用途 |
|-----|------|
| `/stable/news/crypto-latest` | 最新加密货币新闻 |
| `/stable/news/crypto` | 按币种搜索 (如 `symbols=BTCUSD`) |

### 4.2 外汇新闻

| 端点 | 用途 |
|-----|------|
| `/stable/news/forex-latest` | 最新外汇新闻 |
| `/stable/news/forex` | 按货币对搜索 (如 `symbols=EURUSD`) |

### 4.3 通用财经新闻

| 端点 | 用途 |
|-----|------|
| `/stable/news/general-latest` | 获取通用财经新闻 |

---

## 5. 与现有项目的集成方案

### 5.1 当前架构分析

项目现有新闻服务位于:
- `backend/app/services/fmp_service.py` - FMP 服务封装
- `backend/agents/tools/news.py` - Agent 新闻工具

### 5.2 推荐实现步骤

#### Step 1: 扩展 FMP Service

在 `fmp_service.py` 中添加新闻获取方法:

```python
# 伪代码 - 不要实现
class FMPService:
    async def get_stock_news(
        self,
        symbols: list[str],
        from_date: str = None,
        to_date: str = None,
        limit: int = 20
    ) -> list[dict]:
        """获取特定股票的新闻"""
        pass

    async def get_latest_market_news(
        self,
        limit: int = 50
    ) -> list[dict]:
        """获取最新市场新闻"""
        pass

    async def get_press_releases(
        self,
        symbols: list[str],
        limit: int = 10
    ) -> list[dict]:
        """获取公司新闻稿"""
        pass
```

#### Step 2: 更新 Agent 工具

在 `agents/tools/news.py` 中添加 FMP 新闻工具:

```python
# 伪代码 - 不要实现
@tool
def get_fmp_stock_news(symbols: str, limit: int = 20) -> dict:
    """
    使用 FMP API 获取股票相关新闻
    Args:
        symbols: 股票代码,逗号分隔
        limit: 返回数量
    """
    pass
```

#### Step 3: 集成到 Macro Pipeline

在 `agents/agent.py` 的 `news_fetcher_agent` 中集成 FMP 新闻源。

### 5.3 数据字段映射

FMP 响应字段与项目需求的映射:

| FMP 字段 | 项目用途 | 说明 |
|---------|---------|------|
| `symbol` | 股票关联 | 用于过滤和分类 |
| `title` | 新闻标题 | 直接展示 |
| `text` | 新闻摘要 | AI 分析输入 |
| `publishedDate` | 时间排序 | 新鲜度判断 |
| `publisher` | 来源标注 | 可信度参考 |
| `url` | 原文链接 | 用户深入阅读 |

---

## 6. API 使用限制与注意事项

### 6.1 分页限制

- `page`: 最大 100 页
- `limit`: 单次请求最大 250 条

### 6.2 API Key 认证

所有请求需要携带 API Key:
```
?apikey=YOUR_API_KEY
```

或者在请求头中:
```
Authorization: Bearer YOUR_API_KEY
```

### 6.3 调用频率建议

- 新闻数据更新频率: 每日更新
- 推荐缓存策略: 15-30 分钟缓存
- 避免高频调用: 遵守 FMP 速率限制

---

## 7. 与现有 News 工具对比

### 7.1 现有方案

当前项目可能使用:
- yfinance 新闻 (有限制)
- 其他免费新闻源

### 7.2 FMP 优势

| 特性 | FMP | 现有方案 |
|-----|-----|---------|
| 新闻覆盖度 | 多来源聚合 | 单一来源 |
| 搜索能力 | 按股票/日期过滤 | 有限 |
| 新闻稿 | 支持 | 不支持 |
| 多资产类别 | 股票/加密/外汇 | 仅股票 |
| 响应字段 | 丰富 (含图片/来源) | 基础 |

---

## 8. 实现优先级建议

### P0 - 核心功能
1. `get_stock_news()` - 按股票代码获取新闻
2. `get_latest_market_news()` - 获取市场最新新闻

### P1 - 增强功能
3. `get_press_releases()` - 获取公司新闻稿
4. 新闻缓存机制

### P2 - 扩展功能
5. 加密货币新闻支持
6. 外汇新闻支持
7. 新闻情感分析集成

---

## 9. 测试验证计划

### 9.1 单元测试

```python
# 测试用例示例
def test_get_stock_news():
    """测试获取 AAPL 新闻"""
    pass

def test_news_date_filter():
    """测试日期过滤功能"""
    pass

def test_news_pagination():
    """测试分页功能"""
    pass
```

### 9.2 集成测试

- 验证 Agent Pipeline 中新闻获取
- 验证 AI 分析报告中新闻引用
- 验证邮件报告中新闻展示

---

## 10. 参考资源

- [FMP API 官方文档](https://site.financialmodelingprep.com/developer/docs)
- [FMP Stock News API](https://site.financialmodelingprep.com/developer/docs/stable/stock-news)
- [FMP Press Releases API](https://site.financialmodelingprep.com/developer/docs/stable/search-press-releases)
