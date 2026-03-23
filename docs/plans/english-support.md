# English Language Support Engineering Plan

> Status: Planning
> Related: frontend/src/app/.context.md, backend/app/features/*/
> Vision: 产品策略.md > 国际化扩张

## 目标

在不破坏现有中文用户体验的前提下，为 TheMarketBrew 添加完整的英文支持，涵盖 UI 界面、AI 生成报告、及邮件通知，让英文用户能开箱即用。

## 现状

**全面中文化，零 i18n 基础设施：**

| 层级 | 文件数 | 估算行数 | 状态 |
|------|--------|---------|------|
| 前端 UI 组件 | 95 个 TSX | ~1,759 行中文 | 硬编码 |
| 后端 Agent Prompt | 5 个 agent.py | ~352 行中文 | 硬编码 |
| 邮件模板 | 3 个 py | ~140 行中文 | 硬编码 |
| i18n 基础设施 | 0 | — | 完全缺失 |
| 数据源 (FMP/yfinance/FRED) | — | — | **已是英文，无需修改** |

**用户核心诉求：**
- 语言切换别太复杂（不要破坏体验）
- AI 生成内容也要支持英文

## 核心架构决策

> **调研背景**：多语言 AI 内容生成有三种方案：(A) 单次英语生成 + LLM 翻译、(B) 每语言单独运行 Agent、(C) 参数化语言 prompt 直接生成。Jasper、Bloomberg、Reuters 均用 A 或 C。方案 B 成本 2x，各语言间数字/结论可能漂移，几乎无生产系统采用。对中文等高资源语言，A 和 C 质量差距可忽略。

### AI 内容生成策略（核心决策）

**混合策略：共享内容用 A，个性化内容用 C**

| 内容类型 | 策略 | 理由 |
|---------|------|------|
| 市场日报（所有用户相同） | **A**：英语生成 → 按需翻译缓存 | 生成一次复用，事实数字绝对一致，成本最低 |
| 早报/晚报（所有用户相同） | **A**：英语生成 → 按需翻译缓存 | 同上 |
| 宏观分析（所有用户相同） | **A**：英语生成 → 按需翻译缓存 | 同上 |
| 专属日报（每用户不同） | **C**：参数化 prompt，直接用用户语言 | 无复用价值，直接生成更简单；中英文均 Tier 1 质量 |
| 股票投研（每股票不同） | **C**：参数化 prompt | 同上 |
| Screener 研究分析 | **C**：参数化 prompt | 同上 |

**为何不用方案 B（每语言单独跑 Agent）**：成本 2x，且中英文版本的数字/百分比/结论可能漂移，质量提升可忽略。

### 前端路由

```
/zh/today   → 中文日报（现有体验，用户无感知）
/en/today   → English Daily Report
/           → 301 重定向 /zh（保护现有用户）
```

- **工具**：`next-intl`（App Router 原生，Server/Client 组件均支持）
- **消息文件**：`frontend/messages/zh.json` + `frontend/messages/en.json`
- **语言检测顺序**：URL 前缀 > cookie 偏好 > 浏览器 Accept-Language > zh

### 后端 Agent 改造模式

**共享内容 Agent（daily_report、morning_report、macro）**
```python
# agent.py：锁定英语输出
ANALYST_INSTRUCTION = """
...现有 prompt 内容保持不变...

Generate ALL output fields in English.
"""

# 新增 shared/translation_service.py
async def translate_report(content: dict, target_lang: str) -> dict:
    """保留 JSON 结构，仅翻译 value 字段"""
    if target_lang == "en":
        return content
    # 调用 Gemini，保留所有 key，翻译所有文本 value
    ...
```

**个性化内容 Agent（brew、stock、screener）**
```python
# agent.py：末尾追加语言指令，现有 prompt 不变
LANGUAGE_DIRECTIVE = """

---
OUTPUT LANGUAGE: {output_language}
Generate ALL text fields in {output_language}.
Financial terminology should follow {output_language} market conventions.
"""
DIGEST_INSTRUCTION = BASE_INSTRUCTION + LANGUAGE_DIRECTIVE
```

### 数据库存储

**共享内容**：现有 content JSONB 字段改为按语言分层
```json
{
  "en": { "title": "...", "summary": "...", "generated_at": "..." },
  "zh": { "title": "...", "summary": "...", "translated_at": "...", "method": "llm" }
}
```

**个性化内容**：现有表加 `locale` 列，(user_id, report_date, locale) 唯一
```sql
ALTER TABLE user_reports ADD COLUMN locale VARCHAR(10) NOT NULL DEFAULT 'zh';
```

**未来**：语言 > 3 种时迁移到独立 `*_i18n` 翻译表，现阶段 JSONB 够用。

### 用户语言偏好

```
Insforge user_profiles → language VARCHAR(10) DEFAULT 'zh'
```
- 登录时加载，写入 AuthContext
- API 请求通过 `Accept-Language` header 透传
- 邮件发送时读取每位用户的 language

## 数据流

```
用户切换语言
  ↓
写 cookie + 更新 URL 前缀 + 异步更新 Insforge profile
  ↓
Next.js middleware 路由到 /zh 或 /en
  ↓
前端请求携带 Accept-Language: en 或 zh
  ↓
后端 router 读取 header，判断内容类型：

  ┌── 共享内容（日报/早报/宏观）──────────────────────────┐
  │  DB 已有目标语言版本？                                 │
  │    是 → 直接返回（零 LLM 调用）                       │
  │    否 → 取英语版本 → 翻译 → 写入 DB → 返回            │
  └───────────────────────────────────────────────────────┘

  ┌── 个性化内容（专属日报/股票/Screener）────────────────┐
  │  Agent 注入 output_language 参数                      │
  │  Gemini 直接生成目标语言内容                          │
  │  按 (user_id, date, locale) 存储                      │
  └───────────────────────────────────────────────────────┘

前端 next-intl 渲染静态 UI 文字（已切换语言）
邮件：读取 user.language → 选对应模板
```

## 实施步骤

### Phase 0：后端 Agent 改造（约 2-3 天）⚡ 优先做，投入产出比最高

**共享内容 Agent：锁定英语 + 建翻译服务**

- [ ] 新增 `backend/app/shared/translation_service.py`
  - `translate_report(content: dict, target_lang: str) -> dict`
  - 调用 Gemini，保留 JSON 结构，只翻译文本 value
  - 空实现占位，先让流程跑通
- [ ] `daily_report/agent.py` → Prompt 末尾加 `Generate ALL output in English.`
- [ ] `morning_report/agent.py` → 同上（早报/晚报共用）
- [ ] `macro/*/agent.py`（如有）→ 同上
- [ ] `daily_report/router.py` → 读取 `Accept-Language` header → 调翻译服务返回目标语言
- [ ] `morning_report/router.py` → 同上
- [ ] 验证：本地跑日报，检查英文输出是否自然（**关键 QA 点**）

**个性化内容 Agent：参数化语言**

- [ ] `brew/agent.py` → 末尾追加 `LANGUAGE_DIRECTIVE`（模板变量 `{output_language}`）
- [ ] `stock/agent.py` → 同上
- [ ] `screener/agent.py` → 同上
- [ ] `brew/router.py` → 读取 header → 注入 `output_language` 到 agent
- [ ] `stock/router.py` → 同上
- [ ] `screener/router.py` → 同上
- [ ] 验证：本地生成专属日报英文版，检查质量

### Phase 1：前端 i18n 基础设施（约 2-3 天）

- [ ] `npm install next-intl`
- [ ] `frontend/src/middleware.ts` → 前缀路由（`/zh`、`/en`），`/` 重定向 `/zh`，保留 `/api/` 不处理
- [ ] `frontend/next.config.ts` → 接入 next-intl 插件
- [ ] 创建 `frontend/messages/zh.json` + `frontend/messages/en.json`（初始为空结构）
- [ ] 封装 Server Component 用的 `getTranslations()` 和 Client Component 用的 `useTranslations()`

### Phase 2：导航 & 认证 & 首页（约 3-4 天）

转化率相关，优先级最高的 UI 部分：

- [ ] `Navbar.tsx` → 导航项目名称（日报/早报/晚报/专属/个股/投研助手/宏观/联系）+ 语言切换按钮（中/EN）
- [ ] `NavAuth.tsx` → 登录/注册/退出按钮
- [ ] `MobileMenu.tsx` → 移动端导航
- [ ] `login/page.tsx` → 登录页面所有文案
- [ ] 首页 hero section → 产品介绍文案
- [ ] `PaywallGuard.tsx` → 订阅引导文案（关键转化页面）
- [ ] `SubscribeForm.tsx` → 订阅表单

### Phase 3：用户语言偏好持久化（约 1-2 天）

- [ ] Insforge `user_profiles` 表加 `language VARCHAR(10) DEFAULT 'zh'` 列（Edge Function 或 SQL）
- [ ] `backend/app/features/*/router.py` 读取用户 profile language（已有 `verify_user_token` 可获取 user_id）
- [ ] 后端 `/api/profile` 端点 → 支持读写 `language`
- [ ] `frontend/src/contexts/AuthContext.tsx` → 登录时加载 `language`，切换时写 cookie + 异步更新 profile
- [ ] 语言切换流程：点击 → 更新 cookie → 重定向到 `/en/...` 或 `/zh/...` 同页面 → 异步更新 profile

### Phase 4：报告页面 UI（约 5-7 天）

- [ ] `ReportContent.tsx` → 日报内容标签（今日要点、头条、快讯等 section 名）
- [ ] `MorningReportContent.tsx` → 早报/晚报标签
- [ ] `StockCard.tsx` + `StockAnalysisCard.tsx` → 股票卡片标签
- [ ] `InsightBanner.tsx`
- [ ] `WatchlistPanel.tsx` → 持仓管理操作文案（添加股票、最多25只等）
- [ ] `for-you/` 组件 → ForYouContent、FeatureCards、OnboardingSection、RecentReports
- [ ] `/for-you/page.tsx`
- [ ] `DigestInlineReport.tsx`

### Phase 5：宏观仪表盘 UI（约 3-4 天）

- [ ] `MacroPageHeader.tsx`
- [ ] `LiquidityCard.tsx`、`NetLiquidityChart.tsx`、`GlobalLiquidityChart.tsx`
- [ ] `/macro/page.tsx` 导航标签（流动性/经济基本面/通胀与利率/市场情绪）
- [ ] 其余 Macro 组件（RiskGauge、IndicatorBar、SignalCard）

### Phase 6：Screener & Stock UI（约 2-3 天）

- [ ] `screener/page.tsx` + `ChatPanel.tsx` + `WelcomeScreen.tsx`
- [ ] `/stock/page.tsx`
- [ ] `StockSearchDropdown.tsx`、`StockPriceChart.tsx`
- [ ] `technical/TechnicalTooltip.tsx`

### Phase 7：邮件模板英文化（约 2-3 天）

- [ ] `email_templates.py` → 提取所有中文静态字符串，改为按 `language` 参数分支
  - 问候语（早上好/下午好/晚上好）
  - 反馈按钮（有帮助/没帮助）
  - Section 标题（今日要点、头条、快讯、总结等）
  - CTA 文案
- [ ] `email_service.py` → 广播时为每位用户读取 `language`，传入模板渲染函数
- [ ] `notification/router.py` → 确保 cron 广播流程读取用户语言偏好

### Phase 8：测试 & QA（约 3-5 天）

- [ ] 更新 Vitest 组件测试（带 next-intl provider 的测试 wrapper）
- [ ] Playwright E2E 新增：
  - 语言切换按钮功能
  - `/en/` 路由正确渲染英文
  - `/zh/` 路由不受影响（回归）
  - 语言偏好跨页面保持
- [ ] 后端：英文报告自然度验收（人工检查 3-5 份英文日报）
- [ ] 邮件英文模板预览（Resend 测试发送）
- [ ] Vercel 生产部署验证（next-intl 需确认 middleware 配置无冲突）

## 待定问题

### 1. 历史报告回填 ✅ 已决策
现有中文报告不回填英文版。英文支持仅对上线后新生成的报告生效。英文用户访问历史报告时显示"该报告仅有中文版本"提示。

### 2. 共享报告翻译触发时机 ✅ 已决策
按需翻译（用户首次请求目标语言时触发），不在 cron 生成时预先翻译。初期英文用户少，按需触发成本更低。命中缓存后后续请求零 LLM 调用。

### 3. 订阅/支付页面
PaywallGuard 英文文案需要产品决策：是直接翻译现有中文文案，还是重新撰写英文 marketing copy？Stripe 支付页本身已支持多语言，无需改动。

### 4. SEO hreflang
`/en/` 和 `/zh/` 路由是否加 hreflang 标签？初期可不做，待英文用户量增长后处理。

### 5. 翻译质量验收标准
英文报告自然度如何定义"达标"？建议找 1-2 位英语母语金融从业者做一次审读，确认后再全量上线英文版。如质量不满意，考虑将共享内容的 Agent Prompt 本身也翻译成英文（目前方案是保留中文 Prompt + 英语输出指令）。

## MVP 最快路径

完成 Phase 0 + Phase 1 + Phase 2 后，英文用户就能：
- 看到英文导航和首页
- 读到英文报告（AI 直接生成）

**约 7-10 天可上线 MVP。** 其余 Phase 是完整度补全，按版本迭代。

## 技术依赖

```json
{
  "frontend": {
    "new": ["next-intl@^3.x"]
  },
  "backend": {
    "new": []
  }
}
```

后端零新依赖：翻译服务复用现有 Gemini 调用，个性化 Agent 只加 prompt 字符串。

## 参考资源

- next-intl App Router 文档：https://next-intl-docs.vercel.app/docs/getting-started/app-router
- 调研来源：Jasper/Bloomberg/Reuters 多语言架构、arXiv 2403.06249（中文金融 LLM）、LFAI Translation Augmented Generation
- 设计规范：`frontend/docs/design-system.md`（UI 语言"统一中文"规则需更新为"跟随用户语言设置"）
