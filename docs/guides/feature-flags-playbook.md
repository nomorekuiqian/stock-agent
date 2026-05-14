# Feature Flag Playbook

> 任何新的灰度（gradual rollout / canary / A-B 分支）功能都按本指南落地。本指南包含 **整体心智模型**、**新增 flag 的标准集成步骤**，以及 **flag 全量后清理历史代码** 的检查清单。

## 1. 何时使用 Feature Flag

**使用 flag 的场景**:

- 重写一个用户能直接感知的功能（例如重做 `/for-you` 页面），需要先在小范围验证再放量。
- 后端切流量（例如新的 LLM 模型 / 新的数据源），希望少量真实用户先验证再扩大。
- 临时禁用某个功能（用 `enabled=false` 行作为"拉黑名单"语义），不需要发版。

**不要使用 flag 的场景**:

- 永久性的产品差异（按订阅 plan / 角色区分）→ 走 `entitlements`，不要塞进 `feature_flags`。
- A-B 测试需要随机分配 → 当前框架只支持精确名单，不做哈希分桶；如果需要要先扩框架。
- 内部 admin / 调试开关 → 直接判断 `ADMIN_EMAILS` 或环境变量。

## 2. 心智模型

```
┌───────────────────────────────────────────────────────────────┐
│  代码（registry.py）= flag 存在性的唯一定义                    │
│       ↓                                                       │
│  Insforge 表（feature_flags）= 名单（user_id, flag, enabled）  │
│       ↓                                                       │
│  Edge Function（feature-flags.js）= 增删改查                    │
│       ↓                                                       │
│  ┌──────────────────────┐    ┌──────────────────────────┐    │
│  │ GET /api/flags       │    │ /api/admin/flags         │    │
│  │ （所有登录用户）       │    │ （仅 verify_admin_user）   │    │
│  └──────────────────────┘    └──────────────────────────┘    │
│       ↓                              ↓                        │
│  useFeatureFlags()              /admin/flags UI               │
│       ↓                                                       │
│  分支渲染 / 路由 guard                                          │
└───────────────────────────────────────────────────────────────┘
```

**两条铁律**:

1. **加 flag 前先在 `registry.py` 注册**。运营在 `/admin/flags` 下拉里只能选注册过的 key；后端 POST 也会校验。这避免了"在 DB 写 `for_yo_v2` 拼错"这种灰飞烟灭的 bug。
2. **default-off**：未注册 / 未命中名单的用户，永远走旧分支。`get_user_flags` 在 EF 失败时返回空集，前端 hook 在请求失败时返回空集 —— 不能因为 flag 服务挂掉就让新功能炸开。

## 3. 新增 flag 的标准步骤

以下用 `new_screener_v2` 作为示例。

### 3.1 注册 flag（代码内唯一信源）

文件: `backend/app/features/flags/registry.py`

```python
KNOWN_FLAGS: list[FlagDef] = [
    FlagDef("for_you_v2", "..."),
    FlagDef("new_screener_v2", "新版选股 V2（含 LLM 总结）"),  # ← 新增这一行
]
```

提交一次 commit。 完成后，`/admin/flags` 下拉里就会出现这个 flag。

### 3.2 后端分支（如果是后端切流量）

在需要切流量的服务里，注入 `get_user_flags`：

```python
# backend/app/features/screener/router.py
from app.features.flags.db import get_user_flags

@router.get("/screener")
async def run_screener(user_id: str = Depends(verify_user_token)):
    flags = await get_user_flags(user_id)
    if "new_screener_v2" in flags:
        return await screener_v2(user_id)
    return await screener_v1(user_id)
```

**注意事项**:

- `get_user_flags` 一次请求只调用一次 EF（per-request 内可以缓存到 `request.state`，但避免在循环里反复调）。
- 不要在 cron / 后台任务里通过 user 切分支 —— 那种场景应该按"功能 flag 是否已全量"的运营开关来做，不是 per-user flag。

### 3.3 前端分支（重写 UI）

**模式 A：整页路由**（推荐用于改造大面积 UI）

```
ScreenerContent.tsx          ← 薄路由
  ├── ScreenerContentV1.tsx  ← 冻结的旧版（创建后基本不动）
  └── ScreenerContentV2.tsx  ← 新版（持续迭代）
```

`ScreenerContent.tsx` 写法：

```tsx
'use client';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { ScreenerContentV1 } from './ScreenerContentV1';
import { ScreenerContentV2 } from './ScreenerContentV2';
import { ScreenerSkeleton } from './ScreenerSkeleton';

export function ScreenerContent() {
  const { has, isLoading } = useFeatureFlags();
  if (isLoading) return <ScreenerSkeleton />;
  return has('new_screener_v2') ? <ScreenerContentV2 /> : <ScreenerContentV1 />;
}
```

**模式 B：组件内分支**（小改动，例如换一个按钮文案 / 新加一个 section）

```tsx
const { has } = useFeatureFlags();
return (
  <div>
    {has('new_screener_v2') && <NewSummaryCard />}
    {/* 旧 UI 保持不动 */}
  </div>
);
```

模式 B 适合改动 <50 行的场景。如果分支代码超过 50 行，**走模式 A** —— 否则清理时容易漏掉散落的 `has('xxx')`。

**Rules of Hooks 提醒**: `useFeatureFlags()` 必须和其他 hooks 一起在组件顶部无条件调用。flag 判断写在 hook 调用之后、render 逻辑之前，不要把 hook 包进 `if` 里。

### 3.4 路由 guard（隐藏新页面）

如果 flag 控制的是"是否能访问某个新页面"，在该页面顶部加：

```tsx
const { has: hasFlag, isLoading: flagsLoading } = useFeatureFlags();
// ... 其他 hooks ...

// 所有 hooks 调用之后，渲染之前：
if (!flagsLoading && !hasFlag('new_screener_v2')) {
  router.push('/screener');  // 跳回旧入口
  return null;
}
```

### 3.5 导航入口（如果新功能涉及导航栏）

`Navbar.tsx` / `MobileMenu.tsx` 用三目表达式分流：

```tsx
const { has: hasFlag } = useFeatureFlags();
const screenerHref = hasFlag('new_screener_v2') ? '/screener/v2' : '/screener';
```

避免把新链接直接加到 navbar —— 未开 flag 的用户会看到一个跳错地方的入口。

### 3.6 灰度名单管理

不再手写 SQL。打开 `/admin/flags`，在目标用户行选择 `new_screener_v2` → `+ 添加` 即可。删除同理。

**名单建议**:

- **Day 1**: 仅 admin 自己 (`xuxueyang1994@outlook.com`) + 1 个测试账号。
- **Day 3**: 加 3-5 个内测用户。
- **Day 7**: 加 10-20 个真实付费用户（先观察转化 / 留存 24-48h）。
- **Day 14+**: 如果没事故，准备全量（见第 4 节"清理"）。

### 3.7 测试

最少要补三件事：

1. **registry 测试**：在 `tests/test_flags_registry.py` 里确认新 key 出现。一行断言即可。
2. **分支测试**：mock `useFeatureFlags` / `get_user_flags`，验证两条分支都能正常渲染 / 返回。Navbar 的 `__tests__/Navbar.test.tsx` 是个很好的样板。
3. **回归测试**：跑 `pytest -x -q` 和 `npm test -- --run`，确认没有打破现有快照。

### 3.8 上线 PR 模板

PR 描述需包含：

```
## Summary
- 引入 flag `new_screener_v2`，控制 ... 的 V2 体验。
- 在 registry / 前端分支 / 路由 guard / 导航入口 完成集成。

## Rollout
- Day 1: 仅 admin。
- 灰度命名 / 全量节奏见 doc 内 TODO 表。

## Cleanup TODO
- 全量后清理：见 `docs/guides/feature-flags-playbook.md` 第 4 节。
- 预计清理时间窗口：YYYY-MM-DD（全量后 2 周）。
```

## 4. Flag 退役（cleanup） 清单

灰度成功 → 全量 → **删 flag** 是必须执行的最后一步。留着不删的 flag 会变成"代码里有两条路径但没人记得为什么"的技术债。

### 4.1 退役前提

- [ ] 该 flag 已经 **全量开启**（所有付费用户 + free 用户都已加进名单，或决定彻底替换旧版）。
- [ ] 新分支线上 **稳定运行至少 2 周**，无 P1/P2 故障。
- [ ] PM / 产品 owner 明确确认旧分支不再保留。

满足以上三条再开始清理 PR。

### 4.2 清理步骤（按顺序）

> 每一步独立一个 commit，方便 review 和按需 revert。

**Step 1 — 清前端分支**

- 模式 A 的页面：把 `XxxContentV2.tsx` 的内容 inline 回 `XxxContent.tsx`（删去 `useFeatureFlags` 调用和三目表达式），然后 `git rm XxxContentV1.tsx XxxContentV2.tsx`。
- 模式 B 的组件：搜索 `has('<flag>')`，把每个分支替换为新版的那一支，删掉旧版分支。
- 路由 guard：从受保护页面移除 `useFeatureFlags` import 和 guard 块。
- 导航：把三目 `hasFlag(...) ? 新 : 旧` 替换为新版直链；导出/不导出取决于是否还需要保留旧入口的 URL（一般直接删）。

**Step 2 — 清后端分支**

- 搜 `get_user_flags` / `"<flag>"` 在 `backend/app/features/` 下的引用，移除 if/else，保留新分支。
- 删除不再被引用的 V1 服务函数。

**Step 3 — 清 registry**

文件: `backend/app/features/flags/registry.py`

```python
KNOWN_FLAGS: list[FlagDef] = [
    # FlagDef("new_screener_v2", "..."),  ← 删掉这行
]
```

**Step 4 — 清数据**

```sql
-- 在 Insforge Dashboard 跑：
DELETE FROM feature_flags WHERE flag = 'new_screener_v2';
```

这一步**幂等且不可逆**。如果担心审计，前面加一行 `SELECT COUNT(*) FROM feature_flags WHERE flag = 'new_screener_v2';` 留个日志。

**Step 5 — 清测试**

- 删掉只为旧分支保留的快照 / mock 数据。
- 如果 Navbar / MobileMenu 测试里 mock 了 `useFeatureFlags` 返回该 flag，把 mock 简化（或整个去掉 mock）。

**Step 6 — 文档**

- 更新 `backend/app/features/flags/.context.md` 的 "Current Flags" 表 —— 把对应行从"在用"移到 changelog / 删除。
- 如果 `.context.md` 里有针对该 flag 的 cleanup TODO 段（参考 `for_you_v2`），整段删除。

**Step 7 — 验证**

```bash
# 后端
cd backend && source venv/bin/activate && pytest -x -q

# 前端
cd frontend && npx tsc --noEmit && npm run lint && npm run build && npm test -- --run

# 全文搜索残留引用
grep -rn "new_screener_v2" .  # ← 应该返回 0 行
```

### 4.3 退役 PR 模板

```
## Summary
- 清理已全量的 `new_screener_v2` flag。
- 删除 V1 组件 / 后端分支 / registry 条目 / DB 数据。

## Verification
- [ ] `pytest -x -q` 全绿
- [ ] `npm test` + build + tsc + lint 全绿
- [ ] `grep -rn "new_screener_v2" .` 在合并前为空（不算本 PR 的 changelog 引用）
- [ ] DB DELETE 已执行（行数 N=...）

## Rollback
- 不可"快速 revert"——一旦 DELETE 完成，需要重新填名单。
- 如线上发现 regression，应直接修复新分支，而不是回退到 V1。
```

## 5. 反模式（不要这么做）

- **直接在 Insforge SQL Editor 改 flag**：bypass 了 `KNOWN_FLAGS` 校验，错字 / 错 user_id 没有保护。除非 EF 挂掉，否则一律走 `/admin/flags`。
- **把 plan 信息塞进 flag**：付费/免费应走 `entitlements` 表。flag 是临时灰度，不是权限模型。
- **让 flag 永久存在**：超过 90 天没全量也没下线的 flag，每月例行 review 一次 —— 要么推进灰度，要么直接撤销实验、删除分支。
- **加 flag 不写清理 TODO**：在 `.context.md` 的 "Current Flags" 表里必须留一行 "Introduced YYYY-MM-DD, plan to remove after ..."；执行清理时回来更新。
- **在 cron / 后台任务里用 per-user flag 分流**：cron 跑的是一批用户，per-user flag 会让一半用户走 V1 一半走 V2，状态混乱。后端任务想分支用环境变量 / 配置开关。

## 6. 故障速查

| 现象 | 排查 |
|---|---|
| `/admin/flags` 进去看见 `notFound()` | 当前账号不在 `ADMIN_EMAILS`，或 access token 过期 → 重新登录 |
| 添加 flag 报 `422 Unknown flag` | 没在 `registry.py` 注册；先发一个 commit 加 `FlagDef` |
| 用户加了 flag 但仍看不到新功能 | TanStack Query 缓存（`staleTime: 5min`）→ 让用户刷新，或在 `/api/flags` 加 `?nocache=1`（仅作排查） |
| EF 部署后 `list_all` 仍返回 `Invalid action` | `insforge functions deploy` 没拿到最新源；重新 deploy，检查 revision |
| `get_user_flags` 一直返回空集 | 看 backend log 里 `feature-flags EF failed`；EF 自身或 Insforge 连接故障，先回退（fallback 已 default-off，无业务损失） |

## 7. 相关文件清单

- `backend/app/features/flags/registry.py` — KNOWN_FLAGS 唯一信源
- `backend/app/features/flags/db.py` — 服务端访问层
- `backend/app/features/flags/router.py` — `GET /api/flags`（用户读）
- `backend/app/features/flags/admin_router.py` — `/api/admin/flags` （admin 写）
- `backend/app/edge_functions/feature-flags.js` — Insforge EF
- `backend/migrations/feature_flags_schema.sql` — 表 DDL（一次性，已建）
- `frontend/src/hooks/use-feature-flags.ts` — 前端 hook
- `frontend/src/app/admin/flags/` — 灰度管理 UI
- `backend/app/features/flags/.context.md` — 模块上下文，记录当前在用 flag
