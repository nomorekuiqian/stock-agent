# Subscription - 邮件订阅与推送

## 功能概述

多频道邮件订阅系统，管理日报和个性化摘要的邮件推送。集成 Resend API 处理受众管理、联系人 CRUD 和广播发送。包含 HTML 邮件模板渲染、欢迎邮件、AI Newsletter 生成等功能。是本项目中最大的 feature 模块（3300+ 行）。

## API 端点

### 报告推送
| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/report/send` | POST | 生成日报 + 广播推送 | X-Cron-Secret |
| `/api/report/preview` | GET | 日报邮件 HTML 预览 | 无 |
| `/api/report/broadcast-test` | POST | 用已有报告测试广播 | 无 |
| `/api/report/send-test` | POST | 发送日报到单个邮箱 | 无 |

### 订阅管理
| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/subscriptions/{channel}/subscribe` | POST | 订阅频道 | 无 |
| `/api/subscriptions/{channel}/unsubscribe` | POST | 取消订阅 | 无 |
| `/api/subscriptions/{channel}/status` | GET | 查询订阅状态 | 无 |
| `/api/subscriptions/{channel}/update` | PUT | 更新元数据 (symbols等) | 无 |
| `/api/subscriptions/{channel}/subscribers` | GET | 列出全部订阅者 | X-Cron-Secret |
| `/api/subscriptions/{channel}/broadcast` | POST | 广播推送到全部订阅者 | X-Cron-Secret |
| `/api/subscriptions/sync-user` | POST | 同步网站用户到 Resend | 无 |

### Newsletter
| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/newsletter/generate` | POST | AI 生成 newsletter 内容 | X-Cron-Secret |
| `/api/newsletter/preview` | POST | 渲染纯文本预览 | 无 |
| `/api/newsletter/send-test` | POST | 发送到单个邮箱 | 无 |
| `/api/newsletter/broadcast` | POST | 广播 newsletter | X-Cron-Secret |

### 其他
| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/welcome/send-test` | POST | 发送欢迎邮件测试 | 无 |
| `/api/subscriptions/personal_digest/preview` | GET | 个性化摘要邮件预览 | 无 |

## 数据流

### 日报广播流程
```
POST /api/report/send (X-Cron-Secret)
  |
  +-- 检查今日报告是否已存在
  |   +-- 存在 -> 使用缓存
  |   +-- 不存在 -> MarketAgent.analyze() 生成
  |
  +-- 保存到 market_db
  +-- EmailService.broadcast_daily_report()
  |   +-- Resend.Broadcasts.create() 创建广播
  |   +-- Resend.Broadcasts.send() 发送到受众
  +-- 返回 {broadcast_id, audience_id}
```

### 个性化摘要广播流程
```
POST /api/subscriptions/personal_digest/broadcast (X-Cron-Secret)
  |
  +-- list_subscribers("personal_digest") 获取全部订阅者
  +-- broadcast_personal_digests(max_concurrent=5)
  |   +-- 对每个订阅者 (并行, Semaphore 限制):
  |       +-- 从 Insforge 获取用户 watchlist symbols
  |       +-- DigestAgent.generate(symbols) AI 生成摘要
  |       +-- send_personal_digest() 发送邮件
  |       +-- save_user_digest() 保存到 DB (fire-and-forget)
  |       +-- 失败重试 (2次, 间隔2秒)
  +-- 返回 {total, sent, failed, errors}
```

### 订阅流程 (含欢迎邮件)
```
POST /api/subscriptions/{channel}/subscribe
  |
  +-- subscribe_with_welcome(channel, email, metadata)
  |   +-- Contacts.create() 尝试创建
  |   |   +-- 成功 -> is_new=true
  |   |   +-- "already exists" -> Contacts.update(), is_new=false
  |
  +-- if channel==daily_report AND is_new:
      +-- send_welcome_email() 发送欢迎邮件
```

## 核心文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `router.py` | 892 | 17 个端点、lazy import、缓存检查、广播协调 |
| `email_service.py` | 1441 | HTML 邮件模板渲染、Resend 发送/广播、并行摘要推送 |
| `service.py` | 660 | Resend 受众/联系人管理、订阅 CRUD、限流 |
| `newsletter_agent.py` | 125 | AI Newsletter 生成 (Gemini Pro) |
| `models.py` | 218 | 请求/响应/Newsletter 输出模型 |

## 依赖关系

**外部服务**:
- `resend` — 邮件发送 (Audiences/Contacts/Broadcasts API)
- Resend API Key: `RESEND_API_KEY`

**内部依赖**:
- `features/market/` — MarketAgent (日报生成)、market db (报告查询)
- `features/digest/` — DigestAgent (个性化摘要生成)、digest db (摘要保存)
- Google ADK — Newsletter Agent (gemini-3-pro-preview)

**环境变量**: RESEND_API_KEY, GOOGLE_API_KEY, FRONTEND_URL, CRON_SECRET

## 关键业务逻辑

### 两个订阅频道
| 频道 | 受众名 | 需要认证 | 额外元数据 |
|------|--------|----------|-----------|
| `daily_report` | MarketBrew Daily | 否 | first_name |
| `personal_digest` | Personal Digest Daily | 是 | first_name, user_id, symbols |

### Resend 元数据存储
- Resend Contacts 没有自定义字段
- 使用 `last_name` 字段存储 JSON 编码的元数据 (user_id, symbols 等)
- 读取时解析 JSON，写入时序列化

### 限流
- Resend API: 2 请求/秒
- `_rate_limit_wait()` 强制 550ms 间隔
- 应用于所有 Resend 操作

### 4 种邮件模板
1. **日报邮件** — 市场指数 + 新闻 + 日历 + 总结 + 反馈按钮
2. **个性化摘要** — 持仓股票 + 过滤新闻 + 日历 + 总结
3. **欢迎邮件** — 创始人故事 + 功能介绍卡片
4. **Newsletter** — 纯文本格式，Markdown 支持

### 反馈链接
邮件底部嵌入反馈链接: `{frontend_url}/feedback?report_date=X&email=X&rating=satisfied`

## 注意事项

- 这是项目中最大的 feature 模块，email_service.py 单文件 1441 行
- router.py 使用大量 lazy import 避免启动时加载重依赖
- 个性化摘要广播使用 asyncio.Semaphore(5) 控制并发，避免压垮 API
- 欢迎邮件只在首次订阅 daily_report 时发送，已存在的联系人更新不触发
- Newsletter Agent 以 "Golden" 身份写作，温暖个人化的创始人风格
- 所有 Resend 操作都有限流保护 (550ms 间隔)
