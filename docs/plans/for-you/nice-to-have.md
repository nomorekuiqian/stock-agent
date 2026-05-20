# /for-you 改进 · Nice-to-Have 清单

> 非紧急改进项，按优先级排列。每条注明来源 session 和评估结论。

---

## 设计更有效的用户画像问卷

**场景**：当前 Onboarding 3 步问卷（风格→风险→股票）比较基础，选项直白（"被动/平衡/主动"、"保守/适中/激进"），用户可能不确定自己属于哪类，或者选择和实际行为不一致。
**改进方向**：
- 用情景化问题替代直接分类（如"市场下跌 20% 时你会？A.加仓 B.持有 C.减仓"）→ 从回答推断 risk_tolerance
- 用投资经验和持仓习惯间接推断 style（如"你多久看一次持仓？""你通常持股多久？"）
- 参考 Wealthfront / Betterment 的风险评估问卷设计
- 问题数量控制在 5-7 个，仍然保持 < 60 秒完成
- 后端 `inject_profile()` 不需要改，只改前端问卷 UI 和选项→画像的映射逻辑
**优先级**：中（直接影响画像准确度 → 影响日报个性化质量）

---

## 汇率换算（跨币种精准权重）

**场景**：用户同时持有 USD 和 JPY 资产时，当前直接用原始数字计算比例（近似值）。
**调研结论**（2026-04-22）：FMP 有 `/v3/fx` forex endpoint，项目已集成 FMP API key 和请求框架（`fmp_service.py`）。
**实现方案**：
- 后端新增 `shared/data_tools/forex.py::get_exchange_rates(base='USD')` → 返回 `{JPY: 155.2, HKD: 7.82, ...}`
- 缓存 24 小时（汇率日频够用，无需实时）
- `compute_effective_weights()` Mode 1.5 中，cost_basis 先乘以汇率归一化为 base currency 再计算比例
- 前端 subtotal 区域加一行"按 USD 等值换算"
**工期**：~0.5d
**优先级**：低（当前近似值对日报生成够用，大部分用户纯美股）

---

## $CASH 多币种支持

**场景**：当前 $CASH 固定为 USD。日股用户可能想标注 JPY 现金。
**方案**：拆为 `$CASH.USD` / `$CASH.JPY` / `$CASH.HKD`，或在 $CASH 行加一个币种选择器。
**优先级**：低（等汇率换算实现后再考虑）

---

## Stripe Entitlement 拆分（portfolio_management）

**场景**：当前模拟持仓后端用 `watchlist_extended`（Pro 级别）临时门控，前端用 `PaywallGuard requiredPlan="max"`。
**操作步骤**：详见 `operator-handbook.md` §TODO · Stripe Entitlement 配置。
**代码改动**：`router.py` 中 `_PORTFOLIO_FEATURE` 从 `"watchlist_extended"` 改为 `"portfolio_management"`。
**优先级**：中（上线前需完成，但不影响开发和测试）

---

## Onboarding 金额输入 Paywall Lock

**场景**：拆分 entitlement 后，Pro 用户在 onboarding Step 3 填了金额但没有 portfolio_management 权限。
**方案**：金额输入框旁加锁图标 + "升级 Max 解锁模拟持仓" 提示，`disabled` 输入框。
**优先级**：低（随 Stripe entitlement 拆分同步实施）

---

## London Stock Exchange 支持

**场景**：`getCurrency()` 当前只处理 US (字母) / JP (数字) / HK (.HK)。LSE 股票如 `SHEL.L` 会被默认为 USD。
**方案**：`getCurrency()` 加 `.L` 后缀检测 → `{ code: 'GBP', symbol: '£' }`。
**优先级**：低

---

## useDeleteHolding 优化更新权重

**场景**：删除 holding 的乐观更新只移除该行，不重算 effective_weight_pct，导致短暂的权重总和 ≠ 100%。
**方案**：在 `onMutate` 中重算剩余行的 effective_weight_pct，或改为不做乐观更新。
**优先级**：低（`onSettled` invalidation 已覆盖，闪烁时间 < 1s）

---

## ForYouContent toolbar 一致性

**场景**：导航 dropdown 显示 "模拟持仓 · Max"，但 toolbar 按钮只显示 "模拟持仓" + 锁图标，无 "Max" 文字。
**方案**：toolbar 按钮也加 "Max" 文字标签。
**优先级**：低

---

## 空 Portfolio 保存边界

**场景**：用户在前端添加 3 只新股票（未保存），然后逐个删除，save 按钮变 disabled。新增的行从未持久化，服务端保持旧状态。
**方案**：区分"有未保存变更"（dirty flag）和"holdings.length === 0"，dirty 时允许保存空数组。
**优先级**：低

---

## QuickThesisInput 更多埋点位置

**已实现**：
- StockDetailPanel 底部（context: detail_expand）
- Portfolio 页保存后新增 symbol（context: just_added）

**候选埋点**（按 ROI 排序）：
- ActionBar 红态 drawdown 时对 culprit_symbol 弹出（context: red_alert，"你当初为什么买 X？"）
- 板块体检结果页（未来 U2 scope）：对板块级别的观察
- 月度复盘 modal（U2-D scope）：对整个组合的年度 thesis
- digest 头条新闻下方：对特定事件的观点记录（需新 context: news_reaction）
- 研究页 /research 分析完成后：对研究结论的观点

**数据结构可扩展性**：
- `user_portfolios.thesis` 当前是 TEXT 字段（≤140 字）
- 未来考虑迁移到 `user_annotations` 表，支持:
  - 多种 annotation_type: thesis / sector_view / event_reaction
  - 关联到 symbol / sector / event_id
  - 时间戳 + 过期/归档机制
- 但 V1 阶段 TEXT 字段足够，迁移等数据量支撑后再做
