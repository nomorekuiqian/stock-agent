# 专属日报 V2 UX 改进（第二轮）设计

围绕"复盘笔记重命名与上移"+"Action Bar 改为 agent 驱动"三项改动。解决当前 action bar 的兜底文案与日报总结内容相互矛盾的用户困惑。

延续自 `2026-04-25-for-you-v2-ux-fixes-design.md`。两份 spec 的改动可以合并实现，也可以分阶段上线；本 spec 的实现不依赖上一轮的任何新代码。

---

## 背景

### 当前的问题

1. 日报中的 `总结` 段落位于页面最底，而"持仓概览"之下空白较长，用户在看完股票列表后容易跳过总结直接翻到事件，错失 agent 最重要的判断性输出。
2. 段落标题 `总结` 语义模糊——这份日报的三段式 summary 本身就是结合用户持仓、关注列表、今日相关新闻生成的个性化判断+归因+场景预演，但现有标题没体现出这层"为你"的属性。
3. Action Bar 的 green 兜底文案 "今天没有需要特别关注的事" 会与日报总结中的具体建议形成直观矛盾：总结里提到"周三 FOMC 纪要需要提前准备"，action bar 却说"今天没有需要特别关注的事"。
4. 现有 action bar 的 chip 来源是后端规则引擎（缺 thesis / 14 天未体检 / 30 天未更新持仓 / 兜底"查看日报"）。规则与日报 LLM 输出之间没有协调，导致口径不一致。

### 目标

- 将"总结"段落重命名为能体现数据来源+内容性质的标题，并上移到持仓概览之下。
- 让 Action Bar 的内容与日报总结同源同调：chip 来自 brew agent 同一次推理的产出，没有站内可执行动作时就不显示 chip。
- Headline 和 chip 均按需显示，没有内容的一天 action bar 可以完全隐藏。

### 不在本次范围

- V1 模式下 action bar 行为变化（本次只改 V2）。
- Headline 视觉样式调整（保持当前 `portfolio_summary` 字段和渲染逻辑）。
- 历史日报 recap 聚合视图、关键词搜索索引（列入"未来扩展"章节）。

---

## 1. 段落重命名与位置调整

### 1.1 重命名

`DigestInlineReport.tsx` 的 `总结` 段落改为 **"给你的复盘笔记"**，标题下方加一行副标题：

> 综合你的持仓、关注列表与今日相关新闻

副标题使用 `text-xs text-muted-foreground` 级别的小字，与当前 section 标题视觉区隔清晰。

### 1.2 位置调整

段落顺序调整为：

```
1. Report Header       (greeting + one_line_summary)
2. 持仓概览             (StockOverviewPanel)
3. 给你的复盘笔记        ← 新位置（从最后一段上移）
4. 头条新闻
5. 更多新闻
6. 重要事件
7. Disclaimer
```

锚点 id 约定：复盘笔记段落根元素加 `id="section-notes"`，供 action bar 的 `section:notes` target 滚动使用。

### 1.3 影响文件

- `frontend/src/components/for-you/DigestInlineReport.tsx` — 调整 section 顺序、改标题、加副标题、加锚点 id

---

## 2. Action Bar 改为 Agent 驱动

### 2.1 核心原则

Action bar 的 chip 必须来自 brew agent 本次推理同时产出的 `action_items` 列表，与"给你的复盘笔记"内容同源。没产出 chip 且没有显著组合归因时，整个 action bar 隐藏。

### 2.2 Brew Agent 输出新字段

在 `backend/app/features/brew/models.py` 的 `PersonalDigestOutput` 增加：

```python
class ActionItem(BaseModel):
    label: str         # chip 文案，≤12 字
    target: str        # 站内目的地（白名单字符串）
    reason: str        # 产生该 action 的具体理由
    priority: int      # 1-3，1 最重要

action_items: List[ActionItem] = Field(
    default_factory=list,
    max_length=3,
    description="0-3 站内可执行动作。只产出能映射到白名单 target 的动作。"
)
```

`DigestResponse`（API 返回模型）同步加 `action_items: List[ActionItem]` 字段。

### 2.3 Target 白名单（MVP）

| target 模式 | 前端行为 | Agent 使用时机 |
|---|---|---|
| `thesis:<SYMBOL>` | 滚动到持仓概览中该股票 thesis 输入框（`#stock-<SYM>`） | 持仓中缺 thesis 的 symbol，尤其是今日有事件的 |
| `portfolio` | 跳转 `/for-you/portfolio` | 持仓 > 30 天未更新且今日组合有显著归因 |
| `health` | 跳转 `/for-you/health` | > 14 天未体检且今日组合有风险信号 |
| `watchlist` | 跳转 `/for-you/watchlist` | watchlist 中出现值得深入的异动 |
| `stock:<SYMBOL>` | 跳转 `/stock/<SYMBOL>` | 关注列表中某只股票今日重要事件，引导看详情 |
| `section:events` / `section:headlines` / `section:briefs` / `section:notes` | 滚动到日报对应段落 | 引导读者看复盘笔记或特定新闻段落 |
| `digest:<YYYY-MM-DD>` | 跳转到该日期的历史日报 | 今日事件与历史日报的预测/担忧形成呼应 |

### 2.4 Service 层校验

`backend/app/features/for_you/service.py` 在接收 digest 输出后、组装 Signal 前，对 `action_items` 逐条校验：

- `thesis:<SYM>` — SYM 必须在 `missing_thesis_symbols` 中
- `stock:<SYM>` — SYM 必须在用户 portfolio 或 watchlist 的 symbol 集合中
- `digest:<DATE>` — DATE 必须在 `previous_digest_dates` 中；校验通过后 service 层将 DATE 解析为 digest UUID，把 target 改写为 `digest:<uuid>` 再下发（前端无需反查）；若找不到对应 digest_id 则丢弃
- `section:*` / `portfolio` / `health` / `watchlist` — 直接通过
- 其他模式一律丢弃并记录 warning log

**排序稳定性**：先按 `priority` 升序排序；同 priority 时按 target 字符串升序作为二级排序，保证相同输入下 UI 顺序稳定，避免重渲染闪烁。排序后取前 3 条。

### 2.5 Agent 上下文扩展

`backend/app/features/brew/agent.py` 组装给 agent 的 `data_for_agent` 新增：

```python
data_for_agent["action_context"] = {
    "missing_thesis_symbols": [...],            # 持仓中缺 thesis 的 symbol
    "days_since_last_health_check": int | None, # 距上次体检天数
    "days_since_last_portfolio_update": int | None,
    "symbols_with_today_events": [...],         # 今日有事件/财报的 symbol（已有数据复用）
    "previous_digest_dates": [...],             # 从 previous_digests 抽取的日期白名单
}
```

数据来源：
- `missing_thesis_symbols`：查询 `user_portfolios` 表中 `thesis IS NULL OR thesis = ''` 的 symbol
- `days_since_last_health_check`：查询 health 模块的最近一次体检时间
- `days_since_last_portfolio_update`：查询 `user_portfolios.updated_at` 最大值
- `symbols_with_today_events`：复用 digest events 数据抽 symbol
- `previous_digest_dates`：`previous_digests` 列表中的 `date` 字段集合（上游已限制最多 5 条，上下文长度受控；未来若放宽该限制需重新评估截断）

### 2.6 Agent Prompt 指引

在 `DIGEST_INSTRUCTION` 末尾新增章节：

```
### action_items（站内可执行动作，0-3 条，可选）

只输出用户能在本网站上立即完成的动作。如果某个建议用户需要去别处做
（买入、卖出、看外部新闻），那是信息，应该写进 summary，不要放 action_items。

每条必须包含：
- label: ≤12 字的中文动作标签
- target: 必须是白名单之一（见下）
- reason: 1-2 句话，引用具体上下文——用户状态（missing_thesis/days_since_*）、
  今日事件（symbols_with_today_events）、组合归因、或 previous_digests 中的
  具体日期/观点
- priority: 1-3，1 最重要

Target 白名单（只能使用这些，其他一律丢弃）：
- thesis:<SYMBOL>  — SYMBOL 必须在 missing_thesis_symbols 中
- portfolio / health / watchlist
- stock:<SYMBOL>   — SYMBOL 必须在用户持仓或 watchlist 中
- section:events / section:headlines / section:briefs / section:notes
- digest:<YYYY-MM-DD> — 日期必须在 previous_digest_dates 中存在

产出原则：
1) 确实没必要做就返回空列表，不要凑数
2) 不重复：多条 action 指向同一 section 或 stock 时合并成一条
3) reason 必须具体（引用字段/日期/事件），禁止泛泛而谈
4) Label 必须描述用户在本网站上能完成的实际操作：
   - "补论点"、"看体检"、"回看 4/21 日报"、"更新持仓信息" ✓
   - "买入"、"卖出"、"止损"、"调仓"、"减持"、"对冲" ✗（实盘行为）
   - "关注"、"留意"、"思考"、"考虑" ✗（不是动作）

好示例：
{"label":"补 NVDA 投资论点","target":"thesis:NVDA",
 "reason":"你持有 NVDA 但还没写论点，今日 NVDA 财报临近，梳理清楚持有逻辑
 有助于应对后续波动","priority":1}

{"label":"回看 4/21 美联储预警","target":"digest:2026-04-21",
 "reason":"当日 summary 担心美联储鹰派转向，今日核心 PCE 数据坐实这一走向",
 "priority":2}

坏示例：
{"label":"关注市场","target":"section:events","reason":"今日有重要事件"}
（reason 泛泛，没有引用具体字段/日期/事件）

{"label":"考虑买入 NVDA","target":"stock:NVDA","reason":"技术面好"}
（投资建议；reason 空洞；stock:<SYM> 应用于"引导看个股详情"，不是"推荐交易"）

{"label":"在券商买入 500 股","target":"stock:NVDA","reason":"逻辑强化"}
（实盘操作——本站只是分析工具，无法下单。任何涉及真实买入/卖出/建仓/止损/
调仓的动作都不能作为 action，这类建议写进 summary 的叙事里）

{"label":"设置止损价","target":"portfolio","reason":"波动加剧"}
（模拟持仓功能不支持止损。产出用户点进去发现做不了的 action 是最严重的
误导。拿不准某个 target 能否实际完成动作时，别产出）
```

### 2.7 For You Service 改造

`backend/app/features/for_you/service.py` 的 `_build_stable_signal()` 改造：

- **删除**的逻辑：
  - 14 天未体检规则
  - 30 天未更新持仓规则
  - "补充投资论点" 规则
  - 兜底 "查看日报" chip
  - green 状态的 "今天没有需要特别关注的事" 文案

- **新逻辑**：从 `digest.action_items` 读取，经 2.4 的校验，转为 `Signal.data.chips`

- **Headline 显示条件**（复用现有 `portfolio_summary` 字段，不变）：
  - 组合当日总涨跌幅 ≥ 0.5%（含），或
  - 单只持仓贡献/拖累占总变动 > 40%
  - 否则 headline 字段留空

- **Signal 空态**：如果 `action_items` 为空且 `portfolio_summary` 也为空，Signal 返回 `visibility: "hidden"`（新字段），前端据此隐藏整个 action bar

### 2.8 Action Bar 前端显示逻辑

`frontend/src/components/for-you/ActionBar.tsx` 改造：

| 条件 | 显示 |
|---|---|
| `visibility === "hidden"` | 整个 action bar 不渲染 |
| 有 headline，无 chips | 只显示 headline 行 |
| 无 headline，有 chips | 只显示 chips 行 |
| 都有 | 两行都显示 |

**Chip 数量响应式**：
- 单行布局（视口窄/仅 chips 无 headline 时）：取 `priority === 1` 的 1 条
- 双行布局（视口宽+有 headline）：按 priority 排序取前 3 条
- 断点以现有 action bar 的响应式断点为准（实现时确认 `md:` 以上为双行）

**Chip 点击跳转**：实现 `routeChipTarget(target: string)` 工具函数，按 target 前缀 switch：

```ts
function routeChipTarget(target: string, router: Router) {
  const [prefix, payload] = target.split(':', 2);
  switch (prefix) {
    case 'thesis':   return scrollToAnchor(`#stock-${payload}`);
    case 'stock':    return router.push(`/stock/${payload}`);
    case 'digest':   return router.push(`/for-you/${payload}`);   // payload 已是 uuid（service 层预处理）
    case 'section':  return scrollToAnchor(`#section-${payload}`);
    case 'portfolio':return router.push('/for-you/portfolio');
    case 'health':   return router.push('/for-you/health');
    case 'watchlist':return router.push('/for-you/watchlist');
  }
}
```

Agent 输出 `digest:<YYYY-MM-DD>`，service 层在校验时同步查 digest_id 并改写为 `digest:<uuid>` 再下发。前端不需要新增 API 或路由，直接复用现有 `/for-you/[id]`。

**锚点滚动实现**：`scrollToAnchor` 使用 `behavior: 'smooth'` 平滑滚动，并根据 Navbar 高度做 offset（复用当前站点的 fixed header 偏移常量），避免目标被导航栏遮挡。

### 2.9 影响文件清单

**后端**：
- `backend/app/features/brew/models.py` — `ActionItem` 模型 + `action_items` 字段
- `backend/app/features/brew/agent.py` — prompt 增补 + `action_context` 组装
- `backend/app/features/brew/router.py` — 返回 `action_items`
- `backend/app/features/brew/.context.md` — 更新
- `backend/app/features/for_you/service.py` — `_build_stable_signal()` 改造
- `backend/app/features/for_you/models.py` — Signal 增加 `visibility` 字段、chip 结构对齐 ActionItem
- `backend/app/features/for_you/templates.py` — 移除旧兜底文案
- `backend/app/features/for_you/.context.md` — 更新

**前端**：
- `frontend/src/components/for-you/ActionBar.tsx` — 渲染逻辑改造 + routeChipTarget
- `frontend/src/components/for-you/DigestInlineReport.tsx` — 段落重命名 + 上移 + 锚点
- `frontend/src/lib/api.ts` — `ActionItem` / `Signal` 类型同步

---

## 3. 边界情况

### 3.1 Agent 输出非法 target

Service 层校验时丢弃并记录 warning。如果丢弃后 `action_items` 为空，按"无 chips"处理。

### 3.2 Agent 输出空列表 + portfolio_summary 为空

Signal `visibility: "hidden"`，前端整个 action bar 隐藏。用户看到的页面从 Report Header 直接进入持仓概览，没有突兀的空白模块。

### 3.3 Agent 输出超过 3 条

Service 层按 priority 排序后截断取前 3，记录 info log 便于调优 prompt。

### 3.4 Agent 在 reason 中引用了不存在的日期

`digest:<DATE>` 经校验丢弃。reason 文本本身可能仍提到日期但 chip 不出现——不阻断，reason 字段只给 agent 做思考，不暴露给前端。

### 3.5 历史日报 previous_digests 为空（首次用户）

`previous_digest_dates = []`，agent prompt 强调"空列表时不要产出 digest:* 类 action"。即使产出也会被校验丢弃。

### 3.6 用户 portfolio 和 watchlist 都为空

`missing_thesis_symbols = []`，`symbols_with_today_events` 可能也为空。action_items 多半为空，action bar 隐藏，用户看到的是纯市场视角的 digest（这与 V2 的个性化定位一致——没 portfolio 时就应该引导去先建立 portfolio，不过这属于 onboarding 流程不在本 spec 范围）。

---

## 4. 测试策略

### 4.1 后端单测

- `test_action_items_validation.py`：覆盖每个 target 类型的合法/非法场景；symbol 不在白名单、日期不在 previous_digest_dates、未知 prefix
- `test_for_you_service.py` 扩充：
  - digest 无 action_items + 无 portfolio_summary → Signal visibility=hidden
  - digest 有 action_items → chips 按 priority 排序
  - 非法 target 丢弃不影响合法 target

### 4.2 Agent 提示词评估

- 构造一批样本用户状态（有缺 thesis 的持仓 / 刚更新过持仓 / 今日有财报事件 / 历史日报提过相关主题），手动检查 agent 产出的 action_items 是否合理
- 重点检查："实盘操作" 坏示例是否有效阻止 agent 产出 "买入/卖出" 类 action

### 4.3 前端组件测

- `ActionBar.tsx` 快照测试：visibility=hidden 不渲染；只有 chips / 只有 headline / 都有三种组合
- routeChipTarget 单测：每个 target 类型正确跳转或滚动

### 4.4 手工验收

- 真实账号 `voya.technologies@gmail.com` 登录，观察连续几天的 action bar 是否与当日日报总结内容呼应
- 模拟"历史日报提过美联储鹰派 → 今日 PCE 坐实"场景，验证 `digest:<date>` chip 能否正确产出并跳转

---

## 5. 未来扩展（Nice to Have，不在本期）

- **`recap:stock:<SYMBOL>`**：灰度 flag `for_you_recap_v1` 控制。打开时允许 agent 产出该 target，需要新建 "过去 N 天该股票在日报中的所有提及" 聚合视图（前端弹窗或独立页面）。
  - 后端工作：digest 保存时同步索引 `symbol → [date...]` 映射；新 API `GET /api/for-you/stock-recap/<symbol>?days=30`
  - 前端工作：新弹窗或页面聚合展示

- **`recap:theme:<keyword>`**：关键词抽取 + 搜索索引。需要从历史日报 summary 文本抽取主题关键词（可离线 LLM 抽取+缓存），建立 `keyword → [date...]` 倒排索引。工作量较大，留到有明确产品需求时再做。

- **Agent 对 action 的自评**：在 action_items 输出后让 agent 补一条"今日整体建议强度"（low/medium/high），用于前端决定是否在 action bar 上加视觉强调（如 pulse 动画）。

---

## 6. 向后兼容

- 老 digest 数据（`action_items` 字段不存在）→ service 当作空列表处理，Signal visibility=hidden 兜底
- `Signal.visibility` 为新字段，老前端代码如果没读取会默认显示（但老前端会读取老的 chip 结构，不受影响——前后端一起升级即可）
- V1 模式 action bar 行为不变（V1 不走这套新逻辑，现有规则引擎保留）
