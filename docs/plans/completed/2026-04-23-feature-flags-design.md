# Feature Flags 灰度测试框架

> Status: Approved
> Date: 2026-04-23
> Scope: 通用 feature flag 基础设施 + /for-you 页面作为首个 use case
> Related: `docs/plans/for-you/README.md`, `frontend/src/app/for-you/.context.md`

## 一句话目的

在只有 Production 环境的前提下，通过数据库级 per-user feature flag 实现灰度测试，允许指定用户看到新版页面，其他用户不受影响。

## 设计约束

1. **不引入第三方服务**（LaunchDarkly 等）——杀鸡用牛刀
2. **不复用 Entitlements 系统**——entitlements 是"能不能用"（Stripe webhook 写入），flag 是"用哪个版本"（手动控制）。语义不同，且 entitlements 被 webhook 覆写会丢手动设置
3. **不用环境变量**——无法 per-user 区分
4. **不用 localStorage**——不可远程控制、不安全
5. **遵循项目现有模式**——Edge Function + `get_insforge_service()` + TanStack Query

## 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    Insforge PostgreSQL               │
│   feature_flags (user_id TEXT, flag TEXT, enabled)   │
│   ── 手动 SQL INSERT/DELETE 控制 ──                  │
└──────────────────────┬──────────────────────────────┘
                       │ Edge Function
                       ▼
┌──────────────────────────────────────────────────────┐
│          feature-flags.js (Edge Function)            │
│   action=list → SELECT flag WHERE user_id & enabled  │
└──────────────────────┬───────────────────────────────┘
                       │ httpx
                       ▼
┌──────────────────────────────────────────────────────┐
│   backend/app/features/flags/                        │
│   db.py      → call Edge Function                    │
│   router.py  → GET /api/flags (auth required)        │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP
                       ▼
┌──────────────────────────────────────────────────────┐
│   frontend/src/hooks/use-feature-flags.ts            │
│   TanStack Query hook, 5min staleTime                │
│   → useFeatureFlags().has('for_you_v2')              │
└──────────────────────────────────────────────────────┘
```

## 数据层

### 新表：`feature_flags`

```sql
CREATE TABLE IF NOT EXISTS feature_flags (
  user_id    TEXT        NOT NULL,
  flag       TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flag)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_flag
  ON feature_flags (flag);
```

设计决策：
- 复合主键 `(user_id, flag)` 天然防重复
- `flag` 是自由字符串：`for_you_v2`、`new_screener`、`beta_ai_chat`——按需新增
- `enabled` 列允许软关闭（保留记录但不生效）
- 不加 `meta`/`expires_at` 等字段——需要时 ALTER TABLE 即可
- 不加 RLS（与其他 Edge Function 表对齐；只有后端通过 Edge Function 读取）

### 新 Edge Function：`feature-flags.js`

路径：`backend/app/edge_functions/feature-flags.js`

两个 action：

```
GET ?action=list&user_id=xxx
→ SELECT flag FROM feature_flags WHERE user_id = $1 AND enabled = true
→ { success: true, data: ["for_you_v2", "beta_chat"] }

GET ?action=check&user_id=xxx&flag=for_you_v2
→ SELECT 1 FROM feature_flags WHERE user_id = $1 AND flag = $2 AND enabled = true
→ { success: true, data: { enabled: true|false } }
```

模式与 `subscriptions.js` 完全一致：`createClient` → `client.database.from("feature_flags")` → JSON 响应。

## 后端

### 新模块：`backend/app/features/flags/`

**`db.py`**：

```python
from typing import Set
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION = "feature-flags"

async def get_user_flags(user_id: str) -> Set[str]:
    """Fetch all enabled flags for a user via Edge Function."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION, method="GET",
        params={"action": "list", "user_id": user_id},
    )
    data = result.get("data", {})
    if data.get("success"):
        return set(data.get("data") or [])
    logger.warning("feature-flags EF failed for user %s: %s", user_id, result)
    return set()
```

**`router.py`**：

```python
from fastapi import APIRouter, Depends
from app.core.deps import verify_user_token
from app.features.flags.db import get_user_flags

router = APIRouter(prefix="/api/flags", tags=["flags"])

@router.get("")
async def list_my_flags(user_id: str = Depends(verify_user_token)):
    flags = await get_user_flags(user_id)
    return {"flags": sorted(flags)}
```

注意：`verify_user_token` 返回的是 `str`（user_id），不是 dict。

**注册**：在 `main.py` 中 `from app.features.flags.router import router as flags_router` + `app.include_router(flags_router)`。

## 前端

### 新 Hook：`frontend/src/hooks/use-feature-flags.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { getAccessTokenAsync } from '@/contexts/AuthContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

async function fetchFlags(): Promise<string[]> {
  const token = await getAccessTokenAsync();
  if (!token) return [];
  const res = await fetch(`${API}/flags`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.flags || [];
}

export function useFeatureFlags() {
  const { data: flags = [], isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFlags,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const flagSet = new Set(flags);

  return {
    flags: flagSet,
    isLoading,
    has: (flag: string) => flagSet.has(flag),
  };
}
```

为什么用 TanStack Query 而非新 Context：
- 项目内 watchlist/digest/profile 全用 TanStack Query，保持一致
- 自带缓存、去重、staleTime，不需要 localStorage 管理
- 不需要 Provider 包裹，任何组件直接调用

## For You 页面版本分割（首个 Use Case）

### 文件结构

```
frontend/src/app/for-you/_components/
├── ForYouContent.tsx        ← 薄路由层：flag 判断 → V1 or V2
├── ForYouContentV1.tsx      ← 从 master 复制回来，export ForYouPageContentV1，冻结不改
├── ForYouContentV2.tsx      ← 当前分支的 ForYouPageContent，rename export，继续迭代
├── ForYouSkeleton.tsx       ← 共享，不动
└── WatchlistPreview.tsx     ← 共享，不动
```

### `ForYouContent.tsx`（改造后）

```tsx
'use client';

import { useFeatureFlags } from '@/hooks/use-feature-flags';
import PaywallGuard from '@/components/PaywallGuard';
import { ForYouPageContentV1 } from './ForYouContentV1';
import { ForYouPageContentV2 } from './ForYouContentV2';
import { ForYouSkeleton } from './ForYouSkeleton';

export function ForYouContent() {
  const { has, isLoading } = useFeatureFlags();

  return (
    <PaywallGuard requiredFeature="for_you_website">
      {isLoading ? (
        <ForYouSkeleton />
      ) : has('for_you_v2') ? (
        <ForYouPageContentV2 />
      ) : (
        <ForYouPageContentV1 />
      )}
    </PaywallGuard>
  );
}
```

### V1 文件来源

```bash
git show master:frontend/src/app/for-you/_components/ForYouContent.tsx
```

将 master 版本的 `ForYouPageContent` 函数导出为 `ForYouPageContentV1`，其余不变。这个文件冻结后不再修改。

### V2 文件来源

当前分支 `ForYouContent.tsx` 中的 `ForYouPageContent` 函数移到 `ForYouContentV2.tsx`，导出为 `ForYouPageContentV2`。继续自由迭代。

### 新页面守卫

`/for-you/onboarding/page.tsx` 和 `/for-you/portfolio/page.tsx` 在 master 上不存在，V1 用户无入口。但为防止手动输 URL 访问，在页面顶部加守卫：

```tsx
const { has, isLoading } = useFeatureFlags();
if (!isLoading && !has('for_you_v2')) {
  router.push('/for-you');
  return null;
}
```

### V1/V2 共享资源

| 资源 | 归属 | 说明 |
|------|------|------|
| `ForYouSkeleton.tsx` | 共享 | 两个版本都用，不动 |
| `WatchlistPreview.tsx` | 共享 | 两个版本都用，不动 |
| `DigestInlineReport.tsx` | 共享 | 两个版本都 import，不动 |
| `RecentReports.tsx` | 共享 | 两个版本都 import，不动 |
| `use-portfolio.ts` | V2 only | V1 不 import，无冲突 |
| `currency.ts` | V2 only | V1 不 import，无冲突 |
| 后端 `/api/portfolio/*` | V2 only | V1 前端不调用，后端代码合并无风险 |

### 后端 API 不需要灰度

V2 新增的后端端点（`/api/portfolio/*`、`/api/portfolio/profile`）是纯新增，V1 前端不调用。所以后端代码全部合并到 master，无需根据 flag 分支后端逻辑。

## 操作手册

### 部署前准备

1. 在 Insforge Dashboard → SQL Editor 执行建表 SQL
2. 部署 `feature-flags.js` Edge Function：`insforge functions deploy feature-flags --file backend/app/edge_functions/feature-flags.js`
3. 部署后端（包含新的 `/api/flags` 路由）
4. 部署前端（包含 V1/V2 分叉逻辑）

### 给用户开启灰度

```sql
-- 查找用户 auth uid（Insforge Dashboard → Authentication → Users）
-- 给测试账号开启 for_you_v2
INSERT INTO feature_flags (user_id, flag)
VALUES ('目标用户的-auth-uid', 'for_you_v2')
ON CONFLICT (user_id, flag) DO NOTHING;
```

### 关闭灰度

```sql
-- 硬删除
DELETE FROM feature_flags
WHERE user_id = '用户uid' AND flag = 'for_you_v2';

-- 或软关闭（保留记录）
UPDATE feature_flags SET enabled = false
WHERE user_id = '用户uid' AND flag = 'for_you_v2';
```

### 批量开启（如给所有付费用户）

```sql
INSERT INTO feature_flags (user_id, flag)
SELECT user_id, 'for_you_v2'
FROM subscriptions
WHERE status = 'active'
ON CONFLICT DO NOTHING;
```

### 全量发布（灰度结束）

1. 前端：删除 `ForYouContentV1.tsx`
2. 前端：将 `ForYouContentV2.tsx` 内容移回 `ForYouContent.tsx`（或 rename）
3. 前端：删除 `ForYouContent.tsx` 中的 flag 判断逻辑
4. 前端：删除 `/onboarding` 和 `/portfolio` 页面中的 flag 守卫
5. 数据库：`DELETE FROM feature_flags WHERE flag = 'for_you_v2';`
6. （可选）如果不再需要 flag 框架，删除后端 `features/flags/` 和前端 `use-feature-flags.ts`——但建议保留，下次灰度直接复用

### 以后加新灰度功能

1. 定 flag 名字（如 `new_screener`）
2. 在对应页面加 `if (has('flag_name')) return <NewVersion />;`
3. 数据库 INSERT 给测试用户
4. 不需要改后端、不需要改 hook、不需要新部署配置

## 交付清单

| # | 文件 | 类型 | 说明 |
|---|------|------|------|
| 1 | `backend/migrations/feature_flags_schema.sql` | 新建 | DDL |
| 2 | `backend/app/edge_functions/feature-flags.js` | 新建 | Edge Function |
| 3 | `backend/app/features/flags/__init__.py` | 新建 | 模块 init |
| 4 | `backend/app/features/flags/db.py` | 新建 | DB 访问层 |
| 5 | `backend/app/features/flags/router.py` | 新建 | API 端点 |
| 6 | `backend/app/main.py` | 修改 | 注册 flags_router |
| 7 | `frontend/src/hooks/use-feature-flags.ts` | 新建 | TanStack Query hook |
| 8 | `frontend/src/app/for-you/_components/ForYouContentV1.tsx` | 新建 | master 版本冻结 |
| 9 | `frontend/src/app/for-you/_components/ForYouContentV2.tsx` | 新建 | 当前版本提取 |
| 10 | `frontend/src/app/for-you/_components/ForYouContent.tsx` | 修改 | 薄路由层 |
| 11 | `frontend/src/app/for-you/onboarding/page.tsx` | 修改 | 加 flag 守卫 |
| 12 | `frontend/src/app/for-you/portfolio/page.tsx` | 修改 | 加 flag 守卫 |

## 风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| flag 请求失败导致所有用户看到 V1 | 低 | 安全的 fallback——V1 是稳定版本 |
| V1 文件从 master 复制后与 master 漂移 | 低 | V1 冻结不改；master 上 for-you 也不再改动 |
| flag 请求增加页面加载延迟 | 低 | TanStack Query 缓存 5 分钟；首次请求期间显示 Skeleton |
| 新页面 URL 被 V1 用户手动访问 | 中 | flag 守卫 redirect 到 /for-you |
