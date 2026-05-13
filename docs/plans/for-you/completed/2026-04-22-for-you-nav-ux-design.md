# 专属页导航与体验改进 · 设计文档 v2

> Date: 2026-04-22 (v2 updated)
> Status: **Pending developer review**
> Scope: Portfolio 录入交互重构（百分比→金额）+ 导航/命名统一 + Paywall + 多币种 + Onboarding 文案

---

## 0. 核心变更：录入方式从"百分比 slider"改为"模拟金额"

**原设计**：用户拖 slider 输入每只股票的百分比权重（0-100%），后端归一化。
**新设计**：用户输入每只股票的**模拟投入金额**，后端按 `金额 ÷ 实时价 = 等效股数` 计算权重。

**Why**：
- 散户最容易回答"我买了多少钱的 AAPL"，而不是"AAPL 占百分之几"
- "模拟金额"降低隐私顾虑（不需要精确值，5000 和 5500 对日报效果一样）
- 不输入金额 = 等权分配（已有 Mode 3 fallback），零门槛

---

## 1. 命名体系（不变）

| 功能 | 中文名 | slug | Paywall | 定义 |
|---|---|---|---|---|
| 自选股 | **关注列表** | `/for-you/watchlist` | Pro | 纯观察，无金额 |
| 持仓组合 | **模拟持仓** | `/for-you/portfolio` | Max（临时用 `watchlist_extended`） | 带金额的模拟资产镜像 |
| 专属日报 | **专属日报** | `/for-you` | Pro | 个性化分析 |
| 投资画像 | **投资画像** | `/for-you/onboarding` | Pro | style/risk/horizon |

---

## 2. Navbar 导航（已实现 ✅）

"专属" 可点击跳转 `/for-you`，hover 展开 dropdown：
```
专属 (点击→/for-you, hover→dropdown)
  ├ 专属日报         → /for-you
  ├ 关注列表         → /for-you/watchlist
  └ 模拟持仓 · Max   → /for-you/portfolio
```

Mobile 同步。

---

## 3. ForYouContent 页面（已实现 ✅）

- 大标题: "MyBrew · 专属"
- 副标题三态动态
- Toolbar: `[关注列表] [模拟持仓 🔒] [AI 助手]`，非 Max 带锁

---

## 4. Portfolio 编辑器重构（核心改动）

### 4.1 交互：从 slider 改为金额输入

**每行布局**：
```
[Symbol]  [Name]                    [Currency] [$_______]  [×]
 AAPL     苹果                       USD        5,000       ×
 7203     丰田汽车                    JPY       500,000      ×
 NVDA     英伟达                     USD        3,000       ×
                                              ─────────────
                                   USD 总计: $8,000
                                   JPY 总计: ¥500,000
                                   (跨币种权重为近似值)
```

- 金额输入框：`<input type="number">`，无小数，允许空（空 = 等权分配时该行参与均分）
- 币种标签：根据 symbol 的 exchange 自动推断，不可编辑
  - 美股 (NYSE/NASDAQ): USD / $
  - 日股 (TSE): JPY / ¥
  - 港股 (HKEX): HKD / HK$
  - 其他/未知: USD（默认）
- **不做汇率换算**：跨币种时直接用原始数字计算比例（近似值）
- 底部按币种分组显示 subtotal
- Slider 和百分比输入框**全部移除**

### 4.2 权重计算变更

**前端**：
- `LocalHolding` 类型：`weight_pct` 字段改为 `amount`（金额）
- 保存时传 `cost_basis` 字段（复用现有 DB 列，不新增列）
- `HoldingInput` 传入：`{ symbol, cost_basis: amount }`，`weight_pct` 和 `shares` 均为 null

**后端 `service.py::compute_effective_weights()`**：
- 现有 Mode 1 (shares × price) 不变
- **新增 Mode 1.5 (cost_basis as amount)**：当 `cost_basis` 非空时，`effective_weight = cost_basis / Σ(cost_basis_i) × 100`
  - 不需要实时价格，纯金额比例
  - 优先级：shares×price > **cost_basis** > weight_pct > equal
- `$CASH` 的 cost_basis 直接参与计算（$CASH 金额 = 现金头寸）

**为什么复用 `cost_basis` 而不新增 `amount` 列**：
- DB schema 已有 `cost_basis NUMERIC(18,6)`，语义匹配（"你投了多少钱"）
- 避免 ALTER TABLE migration
- 未来 P2 月度复盘功能可以直接用这个值对比当前市值算收益

### 4.3 多币种处理

**币种推断逻辑**（前端 utility 函数）：
```typescript
function getCurrency(symbol: string, exchange?: string): { code: string; symbol: string } {
  // 日股: 纯数字 symbol (e.g. "7203") 或 exchange 含 TSE/TYO
  if (/^\d+$/.test(symbol)) return { code: 'JPY', symbol: '¥' };
  // 港股: .HK 后缀 或 exchange 含 HKEX
  if (symbol.endsWith('.HK')) return { code: 'HKD', symbol: 'HK$' };
  // $CASH: 虚拟
  if (symbol === '$CASH') return { code: 'USD', symbol: '$' };
  // 默认美股
  return { code: 'USD', symbol: '$' };
}
```

**数据模型**：
- `HoldingInput` 新增可选字段 `currency?: string`（前端传入，后端存储但不参与计算）
- DB: 复用现有 schema，`currency` 暂不入库（前端按 symbol 推断即可）
- 未来如需入库：ALTER TABLE 加 `currency TEXT` 列

### 4.4 $CASH 特殊处理（已实现 ✅）

- Symbol 不可点击（无链接到 `/stock/$CASH`）
- 金额输入正常（表示现金头寸）
- 币种显示 USD / $

### 4.5 搜索点击不跳转（已实现 ✅）

### 4.6 数据加载 fix（已实现 ✅）

client-side navigation 时 seed from `portfolioData` 而非 `isSuccess` flag。

---

## 5. Onboarding Step 3 变更

当前 Step 3 只添加 symbols（加入关注列表）。

**新增可选金额输入**：
- 添加股票后，每行显示一个可选的金额输入框
- 不填 = 等权分配
- 标题："添加关注股票"，副标题："这些股票将加入你的关注列表。填写模拟金额可获得更精准的分析（可选）"
- 完成时：
  - 股票列表 → `PUT /api/watchlist`（关注列表）
  - 如果填了金额 → 同时 `PUT /api/portfolio/bulk`（模拟持仓，需 Max entitlement，无则跳过）

---

## 6. Paywall 门控（已实现 ✅，待配 Stripe）

**临时方案**：后端用 `watchlist_extended` entitlement，前端用 `PaywallGuard requiredPlan="max"`。

**正式方案**（TODO，见 operator-handbook.md）：
1. Stripe Dashboard 创建 `portfolio_management` feature
2. 关联到 Max product
3. 后端 `_PORTFOLIO_FEATURE` 改回 `"portfolio_management"`

---

## 7. 后端改动清单

| 文件 | 改动 | 复杂度 |
|---|---|---|
| `service.py` | 新增 Mode 1.5: cost_basis 比例模式 | 中 |
| `models.py` | `HoldingInput` 加 `currency?: str` (可选) | 低 |
| `router.py` | 无变更（cost_basis 字段已存在于 HoldingInput） | 无 |
| `db.py` | 无变更（cost_basis 已通过 EF 存取） | 无 |
| `portfolio.js` (EF) | 无变更（cost_basis 在 allowed fields 里） | 无 |
| migration | 无新 migration（复用 cost_basis 列） | 无 |
| `test_portfolio_service.py` | 新增 Mode 1.5 测试用例 | 低 |

### 7.1 `compute_effective_weights()` 新增 Mode 1.5

在 Mode 1 (shares×price) 和 Mode 2 (weight_pct) 之间插入：

```python
# ---- Mode 1.5: cost_basis as amount --------------------------------
# Eligible iff at least one row has cost_basis set.
cost_mode_eligible = any(r.cost_basis is not None and r.cost_basis > 0 for r in inputs)
if cost_mode_eligible:
    costs = [(r.cost_basis or 0.0) for r in inputs]
    total_cost = sum(costs)
    if total_cost > 0:
        return [
            HoldingView(
                ...,
                effective_weight_pct=round(c / total_cost * 100.0, 4),
                weight_source="cost_basis",
            )
            for r, c in zip(inputs, costs)
        ]
```

- `weight_source` Literal 扩展: 加 `"cost_basis"` 到 `HoldingView.weight_source`
- 优先级: shares×price > cost_basis > weight_pct > equal
- 部分行有 cost_basis 部分行没有: 没有的按 0 参与（不占权重）

---

## 8. 前端改动清单

| 文件 | 改动 | 复杂度 |
|---|---|---|
| `portfolio/page.tsx` | Slider→金额输入, 币种标签, subtotal 显示 | 高 |
| `api.ts` | `HoldingView.weight_source` 加 `'cost_basis'` | 低 |
| `onboarding/page.tsx` | Step 3 可选金额输入 | 中 |
| `lib/currency.ts` (新) | `getCurrency(symbol)` 工具函数 | 低 |

### 8.1 Portfolio page 改动详情

**移除**：
- `<Slider>` 组件和相关 import
- `weight_pct` 相关 state/handler
- 总权重百分比指示器

**新增**：
- `LocalHolding.amount: number | null` 字段（替代 `weight_pct`）
- `LocalHolding.currency: string` 字段
- 金额 `<input type="number">` per row，带币种前缀
- 底部按币种分组的 subtotal
- "不填金额 = 等权分配" 提示

**保存逻辑**：
```typescript
const rows: HoldingInput[] = holdings.map((h) => ({
  symbol: h.symbol,
  cost_basis: h.amount || null,  // 金额 → cost_basis
  // weight_pct 和 shares 不传
}));
```

---

## 9. 测试验证

### 后端
- Mode 1.5 单测: 全 cost_basis、部分 cost_basis、$CASH 参与、全空 fallback
- 现有 Mode 1/2/3 回归不变
- Entitlement check: 无 entitlement → 403

### 前端
- `npm run build` 通过
- Portfolio editor: 金额输入 → 保存 → 刷新后加载正确
- 多币种: 日股 symbol 显示 ¥, 美股显示 $
- $CASH: 金额输入正常，symbol 不可点击
- Onboarding Step 3: 可选金额，不填也能完成
- Client-side nav: `/for-you` → `/for-you/portfolio` 数据加载正常

---

## 10. 不改动的部分

- Watchlist 页面和 API
- Digest 生成逻辑
- DB schema（无 migration）
- 后端 EF (portfolio.js)
- 已完成的 Navbar/MobileMenu/ForYouContent 改造

---

## 11. 实施顺序

| Phase | 任务 | 依赖 |
|---|---|---|
| **P1 后端** | service.py Mode 1.5 + models.py weight_source 扩展 + 单测 | 无 |
| **P2 前端基础** | `lib/currency.ts` + `api.ts` type 更新 | P1 |
| **P3 Portfolio page** | 重写 portfolio/page.tsx（金额输入 + 币种 + subtotal） | P2 |
| **P4 Onboarding** | Step 3 可选金额 | P2 |
| **P5 验证** | build + 全量测试 | P3 + P4 |
