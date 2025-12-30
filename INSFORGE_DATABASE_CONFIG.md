# Insforge 数据库配置文档

## 重要说明

Insforge 是一个 **BaaS (Backend-as-a-Service)** 平台，使用 **REST API + JWT Token** 方式访问数据库，**不支持**传统的 PostgreSQL 直连方式。

---

## 连接信息

| 配置项 | 值 |
|--------|-----|
| **API Base URL** | `https://9wmhxyi4.us-east.insforge.app` |
| **Anon Key (JWT)** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNzQ3MTh9.bgL2O-nk8e1YVfT_8q2F6rH23-nw1QOWdJ2ozCURfio` |
| **数据库类型** | PostgreSQL (通过 PostgREST API 访问) |

---

## 数据库表概览

| 表名 | 记录数 | 描述 |
|------|--------|------|
| `market_reports` | 28 | 市场日报 |
| `liquidity_analysis` | 11 | 流动性分析 |
| `rednote_posts` | 4 | 小红书内容 |
| `personal_digests` | 7 | 个性化摘要 |
| `user_watchlists` | 4 | 用户关注列表 |
| `users` | 4 | 用户信息 |

---

## market_reports 表结构 (用于小红书内容生成)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | UUID | 主键 |
| `report_date` | DATE | 报告日期 |
| `title` | TEXT | 报告标题 |
| `summary` | TEXT | 摘要 |
| `quick_take` | TEXT | 快速观点 |
| `market_narrative` | TEXT | 市场叙事 |
| `in_depth_analysis` | TEXT | 深度分析 (Markdown) |
| `conclusion` | TEXT | 结论 |
| `indices` | JSONB | 市场指数数据 |
| `calendar` | JSONB | 关键事件日历 |
| `news` | JSONB | 新闻数据 |
| `macro` | JSONB | 宏观数据 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

---

## API 访问方式

### 方式一：REST API (PostgREST)

```bash
# 获取最新日报
curl "https://9wmhxyi4.us-east.insforge.app/rest/v1/market_reports?order=report_date.desc&limit=1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNzQ3MTh9.bgL2O-nk8e1YVfT_8q2F6rH23-nw1QOWdJ2ozCURfio" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNzQ3MTh9.bgL2O-nk8e1YVfT_8q2F6rH23-nw1QOWdJ2ozCURfio"
```

### 方式二：JavaScript SDK

```javascript
import { createClient } from '@insforge/sdk';

const insforge = createClient({
  baseUrl: 'https://9wmhxyi4.us-east.insforge.app',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
});

// 获取最新日报
const { data, error } = await insforge.database
  .from('market_reports')
  .select('title, summary, market_narrative, conclusion, indices, calendar')
  .order('report_date', { ascending: false })
  .limit(1)
  .single();
```

### 方式三：Python (requests)

```python
import requests

BASE_URL = "https://9wmhxyi4.us-east.insforge.app"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

headers = {
    "Authorization": f"Bearer {ANON_KEY}",
    "apikey": ANON_KEY,
    "Content-Type": "application/json"
}

# 获取最新日报
response = requests.get(
    f"{BASE_URL}/rest/v1/market_reports",
    headers=headers,
    params={
        "order": "report_date.desc",
        "limit": 1,
        "select": "title,summary,market_narrative,conclusion,indices,calendar"
    }
)
report = response.json()[0]
```

---

## 查询示例

### 获取最新日报完整内容
```
GET /rest/v1/market_reports?order=report_date.desc&limit=1
```

### 获取指定日期的日报
```
GET /rest/v1/market_reports?report_date=eq.2025-01-15
```

### 获取最近 7 天的日报列表
```
GET /rest/v1/market_reports?order=report_date.desc&limit=7&select=id,report_date,title,summary
```

---

## 小红书内容生成建议字段

为生成小红书内容，建议读取以下字段：

1. **标题生成**: `title`, `quick_take`
2. **核心内容**: `market_narrative`, `summary`
3. **数据支撑**: `indices` (市场指数涨跌)
4. **热点事件**: `calendar`, `news`
5. **结论观点**: `conclusion`

---

## 注意事项

1. **无直连**: Insforge 不提供 host/port/user/password 直连方式
2. **Token 永不过期**: 匿名 Token 永久有效
3. **RLS 未启用**: market_reports 表未启用行级安全策略，可公开读取
4. **JSONB 字段**: indices, calendar, news, macro 等字段为 JSON 格式
