# V2 Round 2 — 用户验收清单

**Worktree:** `/Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/for-you-v2-round2`
**Branch:** `claude/for-you-v2-round2` (35 commits)
**测试账号:** `voya.technologies@gmail.com` / `123456`

---

## 0. 准备：启动本地服务

在 worktree 内起后端 + 前端（两个终端）：

```bash
# 终端 1 — 后端
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/for-you-v2-round2/backend
source venv/bin/activate
uvicorn app.main:app --reload
# 应看到 "Uvicorn running on http://127.0.0.1:8000"

# 终端 2 — 前端
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/for-you-v2-round2/frontend
npm run dev
# 应看到 "Local: http://localhost:3000"
```

打开浏览器到 `http://localhost:3000`，用测试账号登录。

---

## 1. 灰度门控验证（最重要，直接决定能不能合并）

### 1a. V2 用户体验（flag on）

前提：测试账号 `voya.technologies@gmail.com` 当前是否在 `for_you_v2` flag 白名单内？如果是——直接访问 `/for-you` 看 V2。如果否——先用 SQL 或 Insforge dashboard 加入白名单。

- [ ] 访问 `/for-you`
- [ ] 顶部看到 **Action Bar**（过去几日有 action_items 时）或者**完全看不到 action bar**（静音日）
- [ ] 日报段落顺序（从上到下）：
  - [ ] 日期 + 问候语（Report Header）
  - [ ] 持仓概览（StockOverviewPanel）
  - [ ] **给你的复盘笔记** ← 新段落（位置 3）
  - [ ] 头条新闻
  - [ ] 更多新闻
  - [ ] 重要事件
  - [ ] Disclaimer
- [ ] "给你的复盘笔记" 标题下方有小字副标题：`综合你的持仓、关注列表与今日相关新闻`
- [ ] 页面底部**没有**重复的"总结"段落（新段落只出现一次）

### 1b. V1 用户体验（flag off）—— 关键

想模拟 flag off：打开浏览器 DevTools → Application → Cookies / LocalStorage 清空 for-you-v2 缓存；或者用一个没加白名单的账号访问 `/for-you`；或在 Insforge 临时从 `feature_flags` 表移除该用户。

- [ ] V1 用户看到的日报段落顺序（从上到下）：
  - [ ] Report Header
  - [ ] 持仓概览
  - [ ] 头条新闻
  - [ ] 更多新闻
  - [ ] 重要事件
  - [ ] **总结** ← 旧名称、旧位置（底部）
  - [ ] Disclaimer
- [ ] V1 页面标题依然是"总结"（不是"给你的复盘笔记"）
- [ ] V1 **没有** Action Bar（本来就不渲染）
- [ ] 没有"给你的复盘笔记"字样出现在 V1 页面

**预期结果**：V1 用户完全看不到本次 round 2 的 UI 变化，行为与合并前一致。

---

## 2. Action Bar 行为验证（仅 V2）

打开 DevTools → Network 标签，准备观察 `/api/for-you/action-bar` 请求。

### 2a. 有 agent action_items 的情况

如果当日 digest 的 `action_items` 非空：

- [ ] `/api/for-you/action-bar` 返回 JSON 应包含：
  - [ ] `visibility: "visible"`
  - [ ] `source: "agent"`（不再是 `"template"`）
  - [ ] `chips` 数组中每条都有 `target`、`link`、`label`、`kind`
- [ ] 页面上可见 action bar
- [ ] 桌面端（宽 ≥ 640px）：显示前 3 个 chip（按 priority + target 排序）
- [ ] 移动端（宽 < 640px）：只显示 priority 最高的那个 chip

### 2b. Chip 点击路由验证

针对每种 target 类型，点击 chip，观察结果：

| chip.target 示例 | 预期行为 |
|---|---|
| `thesis:NVDA` | 平滑滚动到持仓概览中 NVDA 的 thesis 输入框，**导航栏不遮挡标题**（72px offset） |
| `stock:NVDA` | 跳转 `/stock/NVDA` |
| `digest:<uuid>` | 跳转 `/for-you/<uuid>`（历史日报详情） |
| `section:notes` | 平滑滚动到"给你的复盘笔记"段落 |
| `section:events` | 平滑滚动到"重要事件" |
| `section:headlines` | 平滑滚动到"头条新闻" |
| `section:briefs` | 平滑滚动到"更多新闻" |
| `portfolio` | 跳转 `/for-you/portfolio` |
| `health` | 跳转 `/for-you/health` |
| `watchlist` | 跳转 `/for-you/watchlist` |

- [ ] 至少试点击一个 anchor 类型（`thesis:*` 或 `section:*`），确认平滑滚动 + 无导航栏遮挡
- [ ] 至少试点击一个 push 类型（`portfolio` 或 `health`），确认正常跳转

### 2c. 静音日（无 action_items 且无 portfolio_summary）

如果当日 agent 未产出 action_items 且 portfolio_summary 为空：

- [ ] `/api/for-you/action-bar` 返回：
  - [ ] `visibility: "hidden"`
  - [ ] `chips: []`
  - [ ] `headline: ""`
- [ ] 页面上 **action bar 完全不渲染**（不要留空白占位）
- [ ] 用户首先看到的是持仓概览，没有 "今天没有需要特别关注的事" 这种假兜底

### 2d. 只有 portfolio_summary 的情况

如果当日有 portfolio_summary 但无 action_items：

- [ ] action bar 可见，显示 headline（组合归因文本）
- [ ] 不渲染任何 chip（chip 区整体隐藏）

### 2e. 防误导验证

- [ ] 搜索整个页面：不再有 "今天没有需要特别关注的事" 字样
- [ ] 搜索整个页面：不再有 "查看日报" 的 chip（它会和用户已经在日报页面矛盾）
- [ ] Action bar 的 chip 和日报 "给你的复盘笔记" 正文的建议是否一致或互补？（对同一个话题应同源同调，不该矛盾）

---

## 3. 后端 API shape 验证（可选，偏工程）

DevTools Network 观察相关请求：

- [ ] `/api/brew/digest`（或 POST 触发 digest 生成）响应含新字段 `action_items: [...]`，每条有 `label/target/reason/priority`
- [ ] 返回的 `source` 字段为 `"agent"`（V2）
- [ ] 连续两次刷新看到相同的 chip 顺序（稳定排序验证——同 priority 时按 target 字典序）

---

## 4. 数据完整性 / Edge case 验证

### 4a. 新账号（没有 previous_digests）

- [ ] 用一个没有历史日报的账号登录
- [ ] Action bar 不应出现 `digest:<date>` 类型的 chip（因为 agent 没日期可引用）
- [ ] 页面正常渲染，不 500

### 4b. 没有 portfolio 只有 watchlist 的账号

- [ ] `missing_thesis_symbols` 应为空集（watchlist 股票不在 portfolio 里，不算缺 thesis）
- [ ] `thesis:*` 类型 chip 不应出现

### 4c. 体检从未做过的账号

- [ ] `action_context.days_since_last_health_check` 在后端日志里应为 null
- [ ] `health` 类型 chip 是否出现取决于 agent 的判断，合理即可

---

## 5. 失败模式验证（破坏性，只在本地做）

### 5a. agent 返回无效 target（模拟）

可以临时在 `backend/app/features/brew/agent.py` 里硬编码一条无效 action_item（如 target: `"buy:NVDA"`），保存，触发新 digest。

- [ ] 后端日志出现 `"Rejected action_item: unknown target prefix 'buy'"` 之类 warning
- [ ] Action bar 依然正常渲染（丢弃那条非法 item，保留合法 item）

完成后**记得 revert 修改**！

### 5b. 缓存 digest 有损坏 action_items（已有回归测试覆盖，可跳过）

单元测试 `test_cache_hit_malformed_action_item_is_dropped_not_500` 已覆盖，手工无需再试。

---

## 6. 回归检查（V1 和 V2 共享的页面）

以下路由在 V1/V2 都能访问（取决于 flag），应都正常：

- [ ] `/for-you/archive` — 历史日报列表
- [ ] `/for-you/[id]` — 单份历史日报
- [ ] `/for-you/portfolio`（V2）或 不可访问（V1）
- [ ] `/for-you/health`（V2）
- [ ] `/for-you/watchlist`（V2）
- [ ] `/for-you/onboarding`（V2）

---

## 7. 性能 / UX 细节

- [ ] Chip 点击 anchor 类型时滚动是平滑（behavior: smooth），不是瞬间跳
- [ ] Chip 点击 anchor 后，目标标题没有被顶部 Navbar 遮挡（72px offset）
- [ ] Action bar 加载中显示 skeleton（`h-12 bg-muted/40 rounded-xl animate-pulse`）
- [ ] 无 JavaScript 错误在 Console 里

---

## 8. 如果验收过了

告知 Claude 合并意图。由于你说"暂时不合并，保留在 worktree 里"——我就不开 PR，worktree 保持 claude/for-you-v2-round2 分支 35 commits 的状态。

如果后续想开 PR：

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent
git push -u origin claude/for-you-v2-round2
gh pr create --base master --title "feat(for-you): V2 round 2 — agent-driven action bar + 复盘笔记 rename" \
  --body "See docs/superpowers/plans/2026-04-25-for-you-v2-round2-checkpoint.md"
```

---

## 9. 如果验收发现问题

**回退选项：**

- **代码层问题**：git revert 对应 commit（SHA 见 checkpoint），或 reset 到之前的某个里程碑
- **完全废弃整个分支**：
  ```bash
  cd /Users/xuxueyang/Documents/GitHub/stock-agent
  git worktree remove .worktrees/for-you-v2-round2 --force
  git branch -D claude/for-you-v2-round2
  ```
  上级分支 `claude/improve-exclusive-page-d7FMx` 上的 `6e33af5`（spec + plan docs commit）可保留或回退。

**数据层**：本次所有变更**没有**触碰 Insforge schema；没有建表；没有数据迁移；没有动 feature_flags 表。无需任何数据回滚。

---

## 10. Non-blocking issues（已全部修复）

最初 Task 9 review 留了 3 个 non-blocking 项：

1. ✅ `portfolio_summary.strip()` 对非字符串防御（commit `6d37205`）
2. ✅ Legacy digests fallback N+1 缓存优化（commit `6d37205`）
3. ✅ Plan 文档中 `portfolio_db.list_watchlist` 纠正为 `brew_db.get_user_watchlist`（commit `6d37205`）

经调查，第 3 项仅为 plan 文档错误，实际代码从一开始就用的是正确的 `brew_db.get_user_watchlist`——功能没有缺失。

---

## 11. 已知限制 / 未来计划

- 本次 round 2 只做了 **Option A 灰度门控（仅 `DigestInlineReport`）**。Backend `build_action_bar` 和 agent prompt 是无条件更新的——但 V1 用户不渲染 ActionBar、不调用 `/api/for-you/action-bar`，所以对 V1 实际不可见。详见 `2026-04-25-for-you-v2-round2-flag-review.md` 的 Option B 讨论。
- "未来扩展"（见 spec §5）未做：`recap:stock:<SYMBOL>` 灰度 flag、`recap:theme:<keyword>` 索引、agent action 强度自评。
- Full rollout 清理步骤见 `backend/app/features/flags/.context.md` + `2026-04-25-for-you-v2-round2-flag-review.md` 的 "Full-Rollout Migration Plan" 章节。

---

## 12. 测试汇总（自动化）

- **后端**: 1372 passed / 30 skipped / 0 failed（30 skipped 是 Task 9/10 清理的 legacy rule-engine 测试，保留作为历史文档）
- **前端**: 443 passed / 0 failed

运行命令（验收时可自己复现）：

```bash
# 后端
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/for-you-v2-round2/backend
source venv/bin/activate
pytest -q --ignore=tests/e2e --ignore=tests/integration

# 前端
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/for-you-v2-round2/frontend
npm test -- --run
```

---

## 签收

- [ ] 所有 checkbox 验证通过
- [ ] 同意保留在 worktree（暂不 PR）
- [ ] 有问题记录到 `checkpoint.md` 的 Non-Blocking Issues 或直接告知 Claude
