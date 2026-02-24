# 命名重构计划

> **创建日期**: 2026-02-22
> **状态**: 已完成
> **优先级**: P1 — 在 M2 个性化改造之前完成

---

## 为什么要重构命名

当前命名存在三个核心问题：

1. **前后端不一致** — 后端叫 `market`，前端叫 `/today`；后端叫 `digest`，前端叫 `/for-you`
2. **抽象层次混乱** — 有的按内容类型命名（market, stock），有的按交付形式（digest, report）
3. **模块职责不清** — `subscription` 模块同时管理订阅状态、邮件发送、广播、Newsletter，20+ 个端点

---

## 当前命名全景

| 后端模块 | API 路由 | 前端路由 | 实际功能 | 问题 |
|---------|---------|---------|---------|------|
| `market` | `/api/market` | `/today` | 每日市场日报（所有人相同） | 前后端名字不匹配 |
| `digest` | `/api/digest` | `/for-you` | 个性化每日摘要（按用户持仓） | "digest"太泛，前后端不匹配 |
| `stock` | `/api/stock/*` | `/stock` | 个股研究与分析 | `/stocks/search` 和 `/stock/{symbol}` 单复数混用 |
| `sector` | `/api/sectors` | `/sectors` | 板块分析 | 基本清晰 |
| `macro_risk` | `/api/macro-risk/*` | `/macro` | 宏观风险仪表盘（4维度） | "risk"多余，实际是宏观数据中心 |
| `liquidity` | `/api/liquidity/*` | `/macro/liquidity` | 流动性指标 | 前端是 macro 子路由，后端是独立模块 |
| `weekly_report` | `/api/weekly-report` | 嵌在 `/macro` 内 | 宏观周报 | 没有独立前端页面 |
| `macro_cache` | `/api/macro-cache` | 无 | 宏观数据缓存刷新 | 纯内部基础设施，不应暴露为 feature |
| `subscription` | `/api/report/*`, `/api/subscriptions/*`, `/api/newsletter/*`, `/api/welcome/*` | 无 | 邮件发送 + 订阅管理 + 广播 | 一个模块承载了太多职责 |
| `feedback` | `/api/feedback/*` | `/feedback` | 用户反馈 | 清晰 |
| `payment` | `/api/payment/*` | 无 | Stripe 支付 | 清晰 |

---

## 目标命名体系

### 命名原则

1. **按产品功能命名，不按技术实现** — `brew` 而不是 `digest`
2. **前后端统一** — 同一个功能用同一个名字
3. **层级关系体现在路径里** — `macro/liquidity` 而不是独立的 `liquidity`
4. **一个模块一个职责** — subscription 只管订阅状态，notification 管发送
5. **内部设施不暴露** — macro_cache 不出现在 features 顶层

### 第一层：用户可见的产品功能

| 功能定位 | 统一名称 | 后端模块 | 前端路由 | API 前缀 | 一句话定义 |
|---------|---------|---------|---------|---------|----------|
| 免费日报 | **daily-report** | `daily_report/` | `/today` | `/api/daily-report` | 每天一份，所有人看到相同的市场日报 |
| 个性化助手 | **brew** | `brew/` | `/brew` | `/api/brew` | 基于用户持仓 + 画像的 AI 个性化投资摘要 |
| 个股研究 | **stock** | `stock/` | `/stock` | `/api/stocks` | 单只股票的数据、分析、AI 研报 |
| 板块分析 | **sector** | `sector/` | `/sectors` | `/api/sectors` | 按行业板块的聚合分析 |
| 宏观中心 | **macro** | `macro/` | `/macro` | `/api/macro` | 宏观经济数据、风险评估、流动性、周报 |

### 第二层：宏观中心子模块

| 当前模块 | 新归属 | API 路径 | 说明 |
|---------|-------|---------|------|
| `macro_risk` | `macro/risk/` | `/api/macro/dashboard`, `/api/macro/economy` 等 | 风险仪表盘（4维度评分） |
| `liquidity` | `macro/liquidity/` | `/api/macro/liquidity/*` | 流动性指标（FRED 数据） |
| `weekly_report` | `macro/weekly/` | `/api/macro/weekly/*` | 宏观周报（AI 生成） |
| `macro_cache` | `macro/cache/` | 内部调用，不对外暴露 | 数据缓存刷新 |

### 第三层：基础设施（用户不可见）

| 当前模块 | 新名称 | 说明 |
|---------|-------|------|
| `subscription`（订阅状态部分） | **subscription** | 纯粹的订阅/退订/状态管理 |
| `subscription`（邮件发送部分） | **notification** | 邮件渲染、发送、广播、预览 |
| `feedback` | **feedback** | 不变 |
| `payment` | **payment** | 不变 |

---

## subscription 模块拆分

当前 `subscription/router.py` 有 20+ 个端点，混合了完全不同的职责：

### 归属 subscription（订阅状态管理）

```
POST   /api/subscriptions/{channel}/subscribe
POST   /api/subscriptions/{channel}/unsubscribe
GET    /api/subscriptions/{channel}/status
PUT    /api/subscriptions/{channel}/update
GET    /api/subscriptions/{channel}/subscribers
POST   /api/subscriptions/sync-user
```

### 归属 notification（邮件发送与广播）

```
POST   /api/notification/daily/broadcast       ← 原 /api/report/send
GET    /api/notification/daily/preview          ← 原 /api/report/preview
POST   /api/notification/daily/send-test        ← 原 /api/report/send-test
POST   /api/notification/weekly/broadcast       ← 原 /api/weekly-report/broadcast
GET    /api/notification/weekly/preview          ← 原 /api/weekly-report/preview
POST   /api/notification/weekly/send-test        ← 原 /api/weekly-report/send-test
GET    /api/notification/brew/preview            ← 原 /api/subscriptions/personal_digest/preview
POST   /api/notification/newsletter/generate     ← 原 /api/newsletter/generate
POST   /api/notification/newsletter/preview      ← 原 /api/newsletter/preview
POST   /api/notification/newsletter/send-test    ← 原 /api/newsletter/send-test
POST   /api/notification/newsletter/broadcast    ← 原 /api/newsletter/broadcast
POST   /api/notification/welcome/send-test       ← 原 /api/welcome/send-test
POST   /api/notification/broadcast-test          ← 原 /api/report/broadcast-test
```

---

## 前后对照总表

### 后端目录结构

```
现在                                建议
────────────────────────────────────────────────────
features/market/              →   features/daily_report/
features/digest/              →   features/brew/
features/stock/               →   features/stock/            (不变)
features/sector/              →   features/sector/           (不变)
features/macro_risk/          →   features/macro/risk/
features/liquidity/           →   features/macro/liquidity/
features/weekly_report/       →   features/macro/weekly/
features/macro_cache/         →   features/macro/cache/
features/subscription/        →   features/subscription/     (瘦身)
                              +   features/notification/      (新模块)
features/feedback/            →   features/feedback/         (不变)
features/payment/             →   features/payment/          (不变)
```

### 前端路由

```
现在                    建议
──────────────────────────────────────
/today                →   /today              (不变，品牌已建立)
/for-you              →   /brew               (与产品名对齐)
/stock                →   /stock              (不变)
/sectors              →   /sectors            (不变)
/macro                →   /macro              (不变)
/macro/liquidity      →   /macro/liquidity    (不变)
```

### API 路由

```
现在                               建议
──────────────────────────────────────────────────────
/api/market                  →   /api/daily-report
/api/digest                  →   /api/brew
/api/stock/*, /api/stocks/*  →   /api/stocks/*          (统一复数)
/api/sectors/*               →   /api/sectors/*         (不变)
/api/macro-risk/*            →   /api/macro/*
/api/liquidity/*             →   /api/macro/liquidity/*
/api/weekly-report/*         →   /api/macro/weekly/*
/api/macro-cache/*           →   内部调用
```

---

## 数据库表名

| 当前表名 | 建议表名 | 说明 |
|---------|---------|------|
| `market_reports` | `daily_reports` | 与模块名对齐 |
| `user_digests` / `personal_digests` | `brew_reports` | 与模块名对齐 |
| `user_watchlists` | `user_watchlists` | 不变，但增加 `list_type` 字段 |
| - | `user_profiles` | 新表，M2 用户画像 |

---

## 执行顺序

建议与 M2 个性化改造一起执行，减少重复改动：

### Phase 1: digest → brew（配合 M2）

最高优先级，因为 M2 会大幅改造这个模块：

- [x] 后端 `features/digest/` → `features/brew/`
- [ ] API `/api/digest` → `/api/brew`（暂未执行，API 路径保持 `/api/digest` 不变）
- [ ] 前端 `/for-you` → `/brew`（暂未执行，前端路由保持 `/for-you` 不变）
- [ ] 数据库表名迁移（暂未执行，表名保持不变）
- [x] 更新 CLAUDE.md 和 CONTEXT.md

### Phase 2: market → daily_report

- [x] 后端 `features/market/` → `features/daily_report/`
- [ ] API `/api/market` → `/api/daily-report`（暂未执行，API 路径保持 `/api/market` 不变）
- [x] 前端路由 `/today` 不变，只更新 API 调用

### Phase 3: macro 体系整合

- [x] `macro_risk/` + `liquidity/` + `weekly_report/` + `macro_cache/` → `macro/` 下的子模块
- [ ] 统一 API 前缀为 `/api/macro/*`（暂未执行，API 路径保持原样）

### Phase 4: subscription 拆分

- [x] 邮件发送逻辑抽取到 `notification/`
- [x] `subscription/` 瘦身为纯订阅状态管理
- [x] 更新所有 Cron Job 调用

### Phase 5: stock API 统一

- [x] `/api/stock/*` 和 `/api/stocks/*` 统一为 `/api/stocks/*`
- [x] 保留旧路由重定向兼容
