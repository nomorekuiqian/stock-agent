# /for-you 改进 · Operator 手册

> **用途**：本仓库 Claude Code 不能 push、不能动 Insforge / Vercel / Railway 的控制台。所有需要人手操作的步骤集中在本文件，按 milestone 分节。
> **配套**：`docs/plans/for-you/checkpoint.md` 是进度记录；本文件只列"该按哪些按钮"。
> **执行账号**：Insforge `xuxueyang1994@outlook.com`（本仓库默认）。

---

## M1 · 数据地基（后端）

### 前置条件

- [ ] 本地 backend venv 已就绪（`backend/venv/`）
- [ ] `insforge --version` ≥ 0.1.49
- [ ] `insforge current` 能看到 project = `stock-agent / 526a88dd-483b-4549-8a58-bf452865f5ff`

### 已知问题（执行前必读）

⚠️ **Insforge API key 当前失效**。`insforge functions list` / `insforge db tables` 会返回 `Invalid API key`。
**操作前必须先重新登录**：

```bash
insforge login
# 跟随浏览器流程完成 OAuth, 完成后回到 terminal 应该能跑 insforge db tables 不报错
```

如果 `insforge login` 也失败，去 https://insforge.dev/dashboard 手动重新生成 CLI token，然后 `insforge login --token <new-token>`。

### Step 1 · 部署数据库 schema（A1 + A11s）

**目标**：在 Insforge Postgres 创建 `user_portfolios` + `user_investment_profiles` 两张表。

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/u0a-foundation
# 干跑预览（推荐）
cat backend/migrations/u0a_portfolio_schema.sql | head -30

# 正式执行
insforge db query --file backend/migrations/u0a_portfolio_schema.sql
```

**预期输出**：每条 `CREATE TABLE IF NOT EXISTS` 返回 `CREATE TABLE` 或 `NOTICE: relation "..." already exists, skipping`，trigger 部分返回 `CREATE TRIGGER`，DO 块完成后返回 `DO`。

**验证**：

```bash
insforge db tables | grep -E "user_portfolios|user_investment_profiles"
# 应同时看到这两行

insforge db query --sql "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='user_portfolios' ORDER BY ordinal_position;"
# 应看到 12 列，含 thesis / target / stop_loss / conviction

insforge db query --sql "SELECT column_name FROM information_schema.columns WHERE table_name='user_investment_profiles' AND column_name='portfolio_confirmed_at';"
# 必须能查到此列（R-2 关键）
```

**回滚**（仅 staging / 紧急时）：

```bash
insforge db query --sql "
  DROP TRIGGER IF EXISTS trg_user_investment_profiles_updated_at ON user_investment_profiles;
  DROP TRIGGER IF EXISTS trg_user_portfolios_updated_at ON user_portfolios;
  DROP FUNCTION IF EXISTS u0a_set_updated_at();
  DROP TABLE IF EXISTS user_investment_profiles;
  DROP TABLE IF EXISTS user_portfolios;
"
```

⚠️ 回滚会丢失所有持仓 + 画像数据。生产环境**只能**通过迁移而非回滚来撤销。

### Step 2 · 部署 portfolio Edge Function（A2）

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/u0a-foundation
insforge functions deploy portfolio --file backend/app/edge_functions/portfolio.js
```

**预期输出**：`Deployed function 'portfolio'` 或类似。

**验证**：

```bash
insforge functions list | grep portfolio

# 调用 list action（user_id 任填，没数据返回空数组）
insforge functions invoke portfolio --params 'action=list&user_id=test_user_999'
# 期待 {"success": true, "data": []}

# 写入 + 读取联调（注意 user_id 写一个测试值）
insforge functions invoke portfolio --params 'action=bulk' --body '{
  "user_id":"test_user_999",
  "rows":[{"symbol":"AAPL","weight_pct":60},{"symbol":"$CASH","weight_pct":40}]
}'
# 期待 success=true, data 包含 2 行

insforge functions invoke portfolio --params 'action=list&user_id=test_user_999'
# 应返回上一步写入的两行
```

**回滚**：

```bash
insforge functions delete portfolio
# 旧版本如有部署历史，可以 redeploy 回旧的 .js 文件
```

### Step 3 · 启动后端并冒烟

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/u0a-foundation/backend
source venv/bin/activate
uvicorn app.main:app --reload
# 启动日志应包含 portfolio router (无报错)
```

**人工验证 checklist**（全部用真实测试账号 token；测试账号 `voya.technologies@gmail.com` / `123456`，登录前端后从浏览器 DevTools Network 抓 Bearer token）：

- [ ] `GET /api/portfolio` 已登录新用户 → `{"holdings": [], "total_weight_pct": 0}`，HTTP 200
- [ ] `GET /api/portfolio` 未登录 → HTTP 401
- [ ] `GET /api/profile` 新用户 → 返回默认画像 `style=passive horizon=long risk_tolerance=moderate notify_mode=events_only`
- [ ] `PUT /api/portfolio/bulk` body `{"rows":[{"symbol":"NVDA","weight_pct":40},{"symbol":"$CASH","weight_pct":60}]}` → 返回归一化的 `effective_weight_pct=40, 60`，且响应里两行都有 `weight_source="weight_pct"`
- [ ] 重复 `GET /api/portfolio` → 看到刚保存的 2 行
- [ ] `PATCH /api/portfolio/touch` → 返回 `{"confirmed_at": "<ISO timestamp>"}`，时间应在当前 5 秒内
- [ ] `PATCH /api/portfolio/NVDA` body `{"thesis":"AI infra build-out"}` → 返回的行应带 thesis；PATCH 路径里大小写不敏感（`/api/portfolio/nvda` 同效果）
- [ ] `PATCH /api/portfolio/A","X` → HTTP 422（symbol 验证拒绝引号 + 逗号注入）
- [ ] `DELETE /api/portfolio/NVDA` → `{"deleted": true, "symbol": "NVDA"}`
- [ ] `PUT /api/profile` body `{"style":"active","risk_tolerance":"high"}` → 返回的画像 `style=active risk_tolerance=high horizon=long`（horizon 沿用），`version` 比之前 +1，`onboarded_at` 已设置（首次保存时）
- [ ] `PUT /api/portfolio/bulk` body `{"rows":[]}` → 全清空，`GET` 返回空列表
- [ ] **`$CASH` 网关防护验证**：在 backend 日志里跟一次写入 `$CASH` 的请求，**不应**看到任何对 `fmp.com` 或 `yfinance` 含 `$CASH` 的 outbound 调用（如果你接了 LOG_LEVEL=DEBUG，可以 grep 网络日志确认）

### Step 4 · 测试账号清理

```bash
# 测试完成后清空 test_user_999 痕迹
insforge functions invoke portfolio --params 'action=bulk' --body '{"user_id":"test_user_999","rows":[]}'
```

### 出错时如何 rollback 整个 M1

1. **代码层面**：在 worktree 里 `git checkout claude/improve-exclusive-page-d7FMx -- .`，或者直接删掉 worktree（`git worktree remove .worktrees/u0a-foundation`）
2. **DB 层面**：参见 Step 1 回滚段
3. **Edge Function 层面**：`insforge functions delete portfolio`
4. **生产环境**：`portfolio_router` 的 include 在 `app/main.py` 末尾，注释掉这一行即可灰度关闭

---

## M2 · Agent 画像注入（完成）

**已完成**：无需 operator 操作。
- `inject_profile()` 纯函数已集成到 brew agent 和 stock agent
- 9 个单测全通过

---

## M3 · 前端 Onboarding & 持仓页（完成）

**已完成**：前端代码已就绪，合并后 Vercel 自动 preview deploy。

**人工验证 checklist**（push 后在 preview URL 执行）：

- [ ] 用测试账号（`voya.technologies@gmail.com` / `123456`）登录
- [ ] 访问 `/for-you` → 应看到"设置你的投资画像"引导卡 + "开始设置"按钮
- [ ] 点击"开始设置" → 进入 `/for-you/onboarding?step=1`
- [ ] Step 1: 选择投资风格（三选一），点"下一步"
- [ ] Step 2: 选择风险容忍（三选一），点"下一步"
- [ ] Step 3: 可选添加股票（搜索 + 添加），或直接点"完成"
- [ ] 完成后应跳转回 `/for-you`
- [ ] 访问 `/for-you/portfolio` → 应看到模拟持仓编辑器（金额输入模式）
- [ ] 添加股票、输入金额、保存 → 检查数据持久化
- [ ] 再次访问 `/for-you` → 应显示 dashboard 模式（非 onboarding）

---

## M4 · 业务收尾 + 灰度（代码完成，待人工 E2E）

**已完成**：
- `exposure_parser.py` + `ETF_SECTOR_MAP`（40+ ETF 静态分解）
- 10 个单测全通过

**待人工操作**：

- [ ] 全栈联调：前端 dev server + 后端 uvicorn 同时运行，走完 onboarding → portfolio → digest 全流程
- [ ] `$CASH` 验证：在 portfolio editor 添加 $CASH，确认 UI 无报错、不显示涨跌幅
- [ ] Staging 部署观察 3 天
- [ ] 5 名内测用户完成 onboarding 后收集反馈

---

## M5 · UX 改造：模拟金额 + 导航 + Paywall（完成）

**无需 operator 操作**（不涉及 Insforge / Stripe / Railway console 改动）。

代码改动摘要：
- 后端 `service.py` 新增 Mode 1.5 (cost_basis 金额比例)
- 前端 portfolio 页从 slider → 金额输入
- 多币种标注 (USD/JPY/HKD)
- Navbar "专属" 可点击 + dropdown 三选项
- Onboarding Step 3 可选金额输入
- Paywall: 前端 `requiredPlan="max"`, 后端 `watchlist_extended` entitlement

**人工验证 checklist**（本地 dev server）：

- [ ] 访问 `/for-you/portfolio` → 应看到金额输入模式（非 slider）
- [ ] 添加 AAPL → 输入 5000 → 显示 "$ 5,000 USD"
- [ ] 添加日股 (如 7203) → 显示 "¥ JPY"
- [ ] 搜索栏上方有"添加现金头寸 ($CASH · USD)"快捷按钮，点击后 $CASH 出现在列表中
- [ ] $CASH symbol 不可点击（无链接到 /stock/$CASH），金额输入正常
- [ ] $CASH 已添加后，快捷按钮自动隐藏
- [ ] 不填金额 → 保存 → 回来看 effective_weight 应该是等权
- [ ] 填金额 → 保存 → 回来看 effective_weight 应该按金额比例
- [ ] 底部分币种 subtotal 显示正确
- [ ] 导航栏 "专属" 可点击跳转 `/for-you`
- [ ] dropdown: "专属日报" / "关注列表" / "模拟持仓 · Max"
- [ ] Onboarding Step 3: 每只股票旁有可选金额输入
- [ ] Pro 用户访问 `/for-you/portfolio` → PaywallGuard 拦截
- [ ] Max 用户正常使用模拟持仓
- [ ] client-side navigation: `/for-you` → `/for-you/portfolio` 数据立即加载

**回滚**：纯代码改动，`git revert` 即可。无数据库 / 外部服务变更。

---

## Feature Flags · 灰度测试框架（需要 operator 部署 Insforge 表 + Edge Function）

### Step 1 · 部署 feature_flags 表

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent
insforge db query --file backend/migrations/feature_flags_schema.sql
```

**验证**：`insforge db tables | grep feature_flags`

### Step 2 · 部署 feature-flags Edge Function

```bash
insforge functions deploy feature-flags --file backend/app/edge_functions/feature-flags.js
```

**验证**：
```bash
insforge functions invoke feature-flags --params 'action=list&user_id=test_user_999'
# 期待 {"success": true, "data": []}
```

### Step 3 · 给测试用户启用 for_you_v2 flag

```sql
INSERT INTO feature_flags (user_id, flag, enabled)
VALUES ('<测试用户的 user_id>', 'for_you_v2', true);
```

用测试账号 `voya.technologies@gmail.com` 的 user_id。可从 Insforge dashboard 查 `auth.users` 表获取。

**验证**：登录后访问 `/for-you`，应看到 V2 版本（有"投资画像""模拟持仓""持仓体检"toolbar 按钮）。未启用 flag 的用户看到 V1（冻结的旧版本）。

**回滚**：`DELETE FROM feature_flags WHERE flag='for_you_v2';` → 所有用户回退到 V1。

---

## U0-B / U0-C / U1-A · Action Bar + 通知偏好 + 事件整合（无需 operator 操作）

**已完成**：纯代码改动，不涉及 Insforge / Stripe / Railway console。

- U1-A: `macro_map.py` + `event_selector.py` + `DigestResponse.top_event`
- U0-B: `features/for_you/` module + `GET /api/for-you/action-bar` + 前端 ActionBar 组件
- U0-C: `notification/preferences.py` + `notification/event_day.py` + `/settings` 页面

**人工验证 checklist**（本地 dev server，前后端都从 worktree 启动）：

- [ ] 访问 `/for-you` → 顶部出现 ActionBar（绿态："组合今日涨/跌 X%，没有需要关注的事"）
- [ ] ActionBar 只在有 watchlist symbols 时显示（无 symbol 时不渲染）
- [ ] 点击 ActionBar chip "查看日报" → 跳转 `/for-you`
- [ ] 访问 `/settings` → 显示邮件通知三选项（静默/事件触发/每日）
- [ ] 切换通知模式 → toast "已更新"，刷新后选中状态保持
- [ ] 生成 digest → response 中 `top_event` 字段有值（如果持仓中有近期财报股票）或 `null`（正常）
- [ ] `top_event` 不为 null 时，ActionBar 应显示黄态事件 chip（取决于事件严重度）

**回滚**：纯代码 `git revert`。

---

## U1-B · 持仓体检（需要 operator 部署 Insforge 表 + Edge Function）

### 前置条件

- [ ] Insforge CLI 已登录（`insforge current` 显示正确 project）
- [ ] U0-A 的 `user_portfolios` + `user_investment_profiles` 表已存在
- [ ] 测试用户已完成 onboarding 且有持仓数据

### Step 1 · 部署数据库 schema

**目标**：创建 `portfolio_health_reports` + `portfolio_insights` 两张表。

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent

# 预览 SQL
cat backend/migrations/u1b_health_schema.sql

# 正式执行
insforge db query --file backend/migrations/u1b_health_schema.sql
```

**预期输出**：每条 `CREATE TABLE IF NOT EXISTS` 返回 `CREATE TABLE` 或已存在跳过，`CREATE INDEX` 同理。

**验证**：

```bash
insforge db tables | grep -E "portfolio_health_reports|portfolio_insights"
# 应同时看到这两行

insforge db query --sql "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='portfolio_health_reports' ORDER BY ordinal_position;"
# 应看到: id, user_id, generated_at, holdings_snapshot, profile_snapshot,
#         score_total, score_dispersion, score_performance, score_macro_fit, score_stability,
#         diagnosis_markdown, one_line, next_action, top_risk, sector_dna,
#         macro_sensitivity_tag, cache_key

insforge db query --sql "SELECT column_name FROM information_schema.columns WHERE table_name='portfolio_insights';"
# 应看到: user_id, updated_at, source_report_id, health_score, one_line, top_risk,
#         sector_dna, macro_sensitivity_tag, next_action
```

**回滚**（仅 staging / 紧急时）：

```bash
insforge db query --sql "
  DROP TABLE IF EXISTS portfolio_insights;
  DROP TABLE IF EXISTS portfolio_health_reports;
"
```

⚠️ 回滚会丢失所有体检历史和 insights 数据。

### Step 2 · 部署 portfolio-health Edge Function

```bash
insforge functions deploy portfolio-health --file backend/app/edge_functions/portfolio-health.js
```

**预期输出**：`Deployed function 'portfolio-health'` 或类似。

**验证**：

```bash
insforge functions list | grep portfolio-health

# 冒烟测试：check_first（新用户应返回 is_first=true）
insforge functions invoke portfolio-health --params 'action=check_first&user_id=test_user_999'
# 期待 {"success": true, "data": {"is_first": true}}

# 冒烟测试：get_insights（无数据应返回空）
insforge functions invoke portfolio-health --params 'action=get_insights&user_id=test_user_999'
# 期待 {"success": true, "data": null}
```

**回滚**：

```bash
insforge functions delete portfolio-health
```

### Step 3 · 人工验证 checklist

启动前后端（确保在 `claude/improve-exclusive-page-d7FMx` 分支）：

```bash
# 后端
cd /Users/xuxueyang/Documents/GitHub/stock-agent/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8001

# 前端（另一个 terminal）
cd /Users/xuxueyang/Documents/GitHub/stock-agent/frontend
npm run dev
```

用测试账号（`voya.technologies@gmail.com` / `123456`）验证：

- [ ] 访问 `/for-you/health` → 显示"生成我的第一份体检"按钮（前提：有持仓数据）
- [ ] 无持仓用户 → 显示"请先添加持仓"引导
- [ ] 点击"生成我的第一份体检" → loading 约 10s → 显示 4 维评分卡 + AI 诊断
- [ ] 4 维评分（分散度/表现/宏观适配/稳定性）各 0-25，总分 0-100
- [ ] AI 诊断段落中引用了具体数字（仓位百分比、板块占比等）
- [ ] 首次体检 + 低分 → 语气温和（无"过高""偏弱"等词）
- [ ] `next_action` 类型为 rebalance/research/none 之一
- [ ] `next_action.text` 不含"买入""卖出""加仓""减仓"
- [ ] 点击"重新生成" → 强制重算（`?force=true`）
- [ ] 刷新页面 → 读缓存，不重新生成
- [ ] DiagnosisPanel 底部有 👍/👎 图标，点击后显示"已记录"
- [ ] `GET /api/portfolio-health/latest` → 返回 latest insights（ActionBar 消费用）
- [ ] 如果 `$CASH` 在持仓中 → AI 诊断认可避险作用，不评"闲置资金"
- [ ] 后端日志无 ERROR（warning 可接受）

**注意**：首次生成需要 `GOOGLE_API_KEY` 环境变量有效。Agent 失败时返回评分但 diagnosis=null（降级，不 500）。

### 出错时如何 rollback

1. **代码**：`git revert` 或注释掉 `main.py` 的 `app.include_router(portfolio_health_router)`
2. **DB**：见 Step 1 回滚段
3. **Edge Function**：`insforge functions delete portfolio-health`
4. **前端**：`/for-you/health` 页面不影响 `/for-you` 主页（独立路由）

---

## U1-C · 记忆/反馈（需要 operator 部署 Insforge 表 + Edge Function）

### 前置条件

- [ ] U1-B 已部署（体检功能可产生 suggestion_tracking 数据）
- [ ] Insforge CLI 已登录

### Step 1 · 部署数据库 schema

**目标**：创建 `ai_feedback` + `suggestion_tracking` 两张表。

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent

# 预览 SQL
cat backend/migrations/u1c_memory_schema.sql

# 正式执行
insforge db query --file backend/migrations/u1c_memory_schema.sql
```

**预期输出**：`CREATE TABLE` × 2 + `CREATE INDEX` × 4（或已存在跳过）。

**验证**：

```bash
insforge db tables | grep -E "ai_feedback|suggestion_tracking"
# 应同时看到两行

insforge db query --sql "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='ai_feedback' ORDER BY ordinal_position;"
# 应看到: id, user_id, target_type, target_id, sentiment, reason, snapshot, created_at

insforge db query --sql "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='suggestion_tracking' ORDER BY ordinal_position;"
# 应看到: id, user_id, source, source_ref_id, suggestion_text, suggestion_date,
#         symbols, sectors, follow_up_at, outcome, created_at
```

**回滚**：

```bash
insforge db query --sql "
  DROP TABLE IF EXISTS suggestion_tracking;
  DROP TABLE IF EXISTS ai_feedback;
"
```

### Step 2 · 部署 memory Edge Function

```bash
insforge functions deploy memory --file backend/app/edge_functions/memory.js
```

**验证**：

```bash
insforge functions list | grep memory

# 冒烟：recent_feedback（新用户无数据 → 空数组）
insforge functions invoke memory --params 'action=recent_feedback&user_id=test_user_999&days=7&limit=20'
# 期待 {"success": true, "data": []}

# 冒烟：save_feedback
insforge functions invoke memory --params 'action=save_feedback' --body '{
  "user_id":"test_user_999",
  "target_type":"digest_quick_take",
  "target_id":"test:2026-04-23",
  "sentiment":1
}'
# 期待 {"success": true, "data": {"id": "<uuid>"}}
```

**回滚**：`insforge functions delete memory`

### Step 3 · 人工验证 checklist

- [ ] 生成体检 → DiagnosisPanel 底部 👍/👎 图标可点
- [ ] 点 👍 → 图标变绿（brand 色），显示"已记录"，60 秒内不可再点
- [ ] 点 👎 → 出现 3 个 reason chip（不准/已知/不相关），点一个或 3s 后自动选择
- [ ] 刷新页面 → 反馈状态不保持（前端 state，非持久化——符合预期）
- [ ] `POST /api/feedback` 直接调用 → 返回 `{"success": true, "id": "<uuid>"}`
- [ ] `GET /api/suggestion-tracking/recent` → 返回最近 30 天的 tracking rows（初始为空）
- [ ] 清理测试数据：

```bash
insforge db query --sql "DELETE FROM ai_feedback WHERE user_id='test_user_999';"
insforge db query --sql "DELETE FROM suggestion_tracking WHERE user_id='test_user_999';"
```

### Step 4 · 清理测试数据（所有 U1 完成后）

```bash
insforge db query --sql "
  DELETE FROM ai_feedback WHERE user_id='test_user_999';
  DELETE FROM suggestion_tracking WHERE user_id='test_user_999';
  DELETE FROM portfolio_health_reports WHERE user_id='test_user_999';
  DELETE FROM portfolio_insights WHERE user_id='test_user_999';
"
```

### 出错时如何 rollback

1. **代码**：注释掉 `main.py` 的 `app.include_router(memory_router)`
2. **DB**：见 Step 1 回滚段
3. **Edge Function**：`insforge functions delete memory`
4. **前端**：FeedbackBar 失败不影响页面（静默失败）

---

## 部署顺序总结

**推荐顺序**（避免依赖缺失）：

1. **Feature Flags** 建表 + EF → 给测试用户启用 `for_you_v2`
2. U0-B / U0-C / U1-A — 纯代码，merge 后立即生效（已包含在分支中）
3. U1-B 建表 → U1-B Edge Function → 验证体检功能
4. U1-C 建表 → U1-C Edge Function → 验证反馈功能
5. 所有验证通过后，逐步给更多用户启用 `for_you_v2` flag

**如果跳过 U1-B/U1-C 部署**：

- ActionBar 仍然工作（绿/红态基于 digest 数据，不依赖 health/feedback）
- 体检页显示"首次体检"CTA，点击后 DB 层 graceful fail → 返回评分但不保存
- FeedbackBar 👍/👎 可点，API 返回 `{"success": true, "id": null}`（EF 不存在时静默降级）

---

## TODO · Stripe Entitlement 配置

当前模拟持仓后端用 `watchlist_extended` entitlement 临时门控。上线前需要在 Stripe 配置独立的 `portfolio_management` entitlement：

1. **Stripe Dashboard → Product Catalog → Entitlements → Features → Create feature**
   - Name: `Portfolio Management`
   - Lookup key: `portfolio_management`（必须精确匹配）

2. **关联到 Max Product**
   - 找到 Max Plan product（`STRIPE_MAX_PRICE_ID` 对应的 product）
   - Product → Entitlements → Add feature → 选择 `Portfolio Management`

3. **触发同步**
   - Stripe 会自动向活跃 Max 订阅者推送 `entitlements.active_entitlement_summary.updated` webhook
   - 后端自动提取 `feature_keys` 写入 DB
   - 如果 webhook 没有自动触发已有订阅，用 Stripe CLI: `stripe trigger entitlements.active_entitlement_summary.updated --override customer=cus_xxxxx`

4. **修改后端代码**
   - `backend/app/features/portfolio/router.py` 中 `_PORTFOLIO_FEATURE` 从 `"watchlist_extended"` 改回 `"portfolio_management"`

---

## 通用紧急联系

- Insforge dashboard: https://insforge.dev/dashboard
- Railway dashboard: https://railway.app/dashboard（后端 host）
- Vercel dashboard: https://vercel.com/dashboard（前端 host）
- Insforge support: support@insforge.dev（国外 SaaS，回复需 24h）
