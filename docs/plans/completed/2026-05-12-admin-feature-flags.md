# Feature Flags Admin Console — 实施计划

**状态**: 待执行
**创建日期**: 2026-05-12
**作者**: claude + xuxueyang

## Context

现有 feature-flags 灰度框架是**只读**的（`GET /api/flags` + `feature-flags` EF 只支持 `list`/`check`），新增/移除用户的 flag 必须直接到 Insforge Dashboard 手写 SQL。这样:

- 运营无法自助调整灰度名单，每次都得找开发。
- 没有"哪些用户开了 `for_you_v2`"的可视化，难以验证灰度覆盖面。
- 错改字段名 / user_id 没有 UI 校验保护。

**目标**: 在已有的 `/admin` 体系下新增一个独立页面 `/admin/flags`，让 admin (`verify_admin_user` 白名单内) 可以：

1. **按用户搜索**（输入 email 子串）查看该用户开了哪些 flag
2. **按 flag 搜索**（下拉选 flag）查看开启该 flag 的所有用户
3. **添加** 给某用户开某个 flag（flag 选择限定在代码注册表里）
4. **删除** 取消某用户的某个 flag

设计决策（已和用户确认）：
- 独立路由 `/admin/flags`，不嵌进已 1776 行的 `AdminDashboard.tsx`
- 只支持"添加 / 删除"，不暴露 `enabled=false` toggle（数据库列保留，但运营只看 enabled=true 的行）
- 暂不做批量操作

## 架构

镜像现有 CRM admin 模式（`crm_router.py` ↔ `crm.js` ↔ `users/[id]/_components/UserDetail.tsx`）：

```
feature_flags 表 (已存在)
  ↑
backend/app/edge_functions/feature-flags.js  ← 新增 admin actions
  ↑
backend/app/features/flags/admin_router.py   ← 新文件
  ↑
GET/POST/DELETE /api/admin/flags/*           ← verify_admin_user 保护
  ↑
frontend/src/app/admin/flags/                ← 新页面
  ├── page.tsx                               ← Server Component, 拉初始数据
  └── _components/FlagsAdminPanel.tsx        ← Client Component
```

## 文件改动清单

### 后端

1. **`backend/app/features/flags/registry.py`** (新建)
   - `KNOWN_FLAGS: list[FlagDef]`，每个 `FlagDef` 含 `key: str`, `description: str`
   - 当前内容: `[FlagDef("for_you_v2", "新版专属页面")]`
   - 后续加 flag 时往这里加一行，作为唯一信源

2. **`backend/app/edge_functions/feature-flags.js`** (扩展)
   - 现有 GET actions (`list`, `check`) 保留不动
   - 新增:
     - `GET ?action=list_all` 可选 `&flag=` 过滤 → 返回 `[{user_id, flag, enabled, created_at}]`
     - `POST ?action=upsert` body `{user_id, flag, enabled}` → 镜像 `crm.js:66` 的 `.upsert(..., { onConflict: "user_id,flag" })`
     - `DELETE ?action=delete&user_id=&flag=` → 镜像 `crm.js:138` 的 `.delete().eq().eq()`
   - 复用 `crm.js` 的 `ok(data)` / `err(message, status)` 返回 helper 风格

3. **`backend/app/features/flags/db.py`** (扩展)
   - 现有 `get_user_flags(user_id)` 不动
   - 新增 admin helpers:
     - `list_all_assignments(flag: str | None = None) -> list[dict]`
     - `upsert_assignment(user_id: str, flag: str, enabled: bool = True) -> dict`
     - `delete_assignment(user_id: str, flag: str) -> bool`
   - 都走 `get_insforge_service().call_function("feature-flags", ...)`，沿用 service 单例

4. **`backend/app/features/flags/admin_router.py`** (新建)
   - `router = APIRouter(prefix="/api/admin/flags", tags=["admin-flags"])`
   - 所有路由 `Depends(verify_admin_user)` (来自 `app/core/deps.py:177`)
   - 端点:
     - `GET /` query params `?email=&flag=` → 返回 `{known_flags, assignments}`
       - `known_flags`: `KNOWN_FLAGS` 直接序列化
       - `assignments`: 调 `subscriptions.list_all` 拿 `[{user_id, email, name, plan}]`，再调 `list_all_assignments(flag)`，按 user_id 合并；email 子串过滤在 Python 层做
     - `POST /` body `{user_id, flag}` → 校验 `flag in {f.key for f in KNOWN_FLAGS}` 否则 422，调 `upsert_assignment(user_id, flag, True)`
     - `DELETE /?user_id=&flag=` → 调 `delete_assignment`
   - 返回结构（用户为主，flags 数组挂在每行）:
     ```json
     {
       "known_flags": [{"key": "for_you_v2", "description": "..."}],
       "assignments": [
         {"user_id": "uuid", "email": "a@b.com", "name": "...", "plan": "pro",
          "flags": [{"flag": "for_you_v2", "created_at": "..."}]}
       ]
     }
     ```
   - 关键: **filter by flag 时也要返回这些用户的所有 flags**（不只是被过滤的那个），这样列展示不丢上下文

5. **`backend/app/main.py`** (1 行改动)
   - `from app.features.flags.admin_router import router as flags_admin_router`
   - `app.include_router(flags_admin_router)`

6. **`backend/app/features/flags/.context.md`** (更新)
   - "Architecture" 段补充 admin 写路径
   - "Current Flags" 表强调 `registry.py` 是新增 flag 的唯一入口

### 前端

7. **`frontend/src/app/admin/flags/page.tsx`** (新建)
   - Server Component，参照 `admin/page.tsx` 模式：`getValidAccessToken()` → fetch `/api/admin/flags` → 渲染 `<FlagsAdminPanel initialData={...} accessToken={...} />`
   - `force-dynamic`, metadata `robots: noindex`

8. **`frontend/src/app/admin/flags/_components/FlagsAdminPanel.tsx`** (新建, client component)
   - 顶部工具栏:
     ```
     [← 返回 /admin]  [搜索 email ▢]  [flag 筛选 ▼ 全部 / for_you_v2 / ...]
     ```
   - 表格列: email | 姓名 | plan | flags (chips, 每个 chip 带 ×) | "+ 添加 flag" 按钮
   - 添加 flag 用 inline `<select>` + 按钮组合（按现有 AdminDashboard 的原生 `<select>` + Tailwind 风格，**不引入 shadcn Popover**，因为该 codebase admin 区都是裸 HTML+Tailwind）
   - email 搜索 debounce 300ms 后触发 `fetch('/api/admin/flags?email=' + q + '&flag=' + f)`
   - 删除 flag 操作前 `confirm()` 弹窗
   - 删除 / 添加成功后乐观更新 + 重新 fetch（参照 `AdminDashboard.tsx:198` 的 `bulkUpdateStatus` 模式：`fetch()` + 手动 `setData`，不引 TanStack mutation —— 和 admin 区现有代码一致）

9. **可选: `frontend/src/app/admin/_components/AdminDashboard.tsx`** (1 处微改)
   - 在合适位置加一个 `<Link href="/admin/flags">灰度管理 →</Link>` 入口（如顶栏或 summary cards 旁）

### 数据库

10. **无 schema 改动**。`feature_flags` 表 (`user_id, flag, enabled, created_at`, PK `(user_id, flag)`) 已就绪。

## 关键复用点（避免重造轮子）

| 复用对象 | 路径 |
|---|---|
| `verify_admin_user` | `backend/app/core/deps.py:177` |
| `get_insforge_service()` 单例 | `backend/app/core/database.py` |
| `subscriptions.list_all` (拿 email/name/plan) | `backend/app/edge_functions/subscriptions.js:309` |
| EF action routing 风格 | `backend/app/edge_functions/crm.js:19,33` |
| EF upsert/delete 写法 | `crm.js:66-69, 138-141` |
| Admin 前端 fetch + 乐观更新模式 | `AdminDashboard.tsx:198-221` |
| 服务端拿 admin token | `lib/auth-cookies.ts` + `getValidAccessToken()` |
| pytest DB write mock | `backend/tests/conftest.py:162-203` |

## 任务分解（建议执行顺序）

1. 加 `flags/registry.py`（≈ 10 行）
2. 扩 `feature-flags.js`（+ 3 actions ≈ 60 行）→ `insforge functions deploy feature-flags`
3. 扩 `flags/db.py`（+ 3 helpers ≈ 40 行）
4. 写 `flags/admin_router.py`（≈ 90 行）
5. 在 `main.py` 注册 router（1 行）
6. 后端 pytest（见验证段）
7. 写 `app/admin/flags/page.tsx`（≈ 40 行，照抄 `admin/page.tsx`）
8. 写 `_components/FlagsAdminPanel.tsx`（≈ 200 行）
9. 在 `AdminDashboard.tsx` 加入口链接
10. 跑前端 lint + build
11. 更新 `flags/.context.md`

## 验证手段

### 后端单元测试 (`backend/tests/test_flags_admin.py`, 新建)

参照 `conftest.py` 的 `monkeypatch` + `patch` 风格，mock `get_insforge_service().call_function`。覆盖：

- **认证**:
  - 非 admin email 调 `GET /api/admin/flags` → 403
  - 无 token → 401
- **GET /api/admin/flags**:
  - 无过滤 → 返回所有用户 + 各自的 flags 数组
  - `?email=voya` → 仅返回 email 含 "voya" 的用户
  - `?flag=for_you_v2` → 仅返回开了该 flag 的用户（且这些用户的 flags 数组完整）
  - `?email=voya&flag=for_you_v2` → 两个条件 AND
  - EF 失败 → 500 且日志告警
- **POST /api/admin/flags**:
  - 合法 `{user_id, flag: "for_you_v2"}` → 200，调用了 EF upsert
  - 非法 flag `{flag: "bogus"}` → 422
  - 缺字段 → 422
- **DELETE /api/admin/flags**:
  - 合法 → 200
  - 不存在的 (user_id, flag) → 仍返回 200（幂等，匹配 PostgreSQL DELETE 行为）

运行: `pytest backend/tests/test_flags_admin.py -v`

### 后端集成手测（dev 环境）

1. `uvicorn app.main:app --reload`
2. 用管理员账号（`xuxueyang1994@outlook.com` 在 `ADMIN_EMAILS` 里）登录，拿 access token
3. ```bash
   curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/flags
   curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/admin/flags?email=voya"
   curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/admin/flags?flag=for_you_v2"
   curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"user_id":"<test-uuid>","flag":"for_you_v2"}' \
     http://localhost:8000/api/admin/flags
   curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/admin/flags?user_id=<test-uuid>&flag=for_you_v2"
   ```
4. 在 Insforge Dashboard SQL 编辑器跑 `SELECT * FROM feature_flags WHERE user_id = '<test-uuid>'` 确认实际状态

### 前端验证

1. `npm run dev`，浏览器登录 admin 账号
2. 访问 `/admin/flags`，确认：
   - 表格能渲染所有用户的 email / name / plan / flags
   - email 搜索框输入 "voya" → 列表收敛
   - flag 下拉选 `for_you_v2` → 仅显示开了它的用户
   - 点 flag chip 上的 × → confirm 弹窗 → 确认后行立刻更新（chip 消失）
   - 点 "+ 添加 flag" → 下拉选 flag → 行上立刻出现新 chip
   - 非 admin 账号访问 `/admin/flags` → 404 / 跳转（沿用 `/admin` 现有 notFound 行为）
3. 在另一个浏览器用刚被开过 flag 的用户登录，访问 `/for-you`，确认 V2 体验生效（说明 `/api/flags` 读取链路未受新增写路径影响）
4. `npm run lint && npx tsc --noEmit && npm run build` 全绿

### 回归

- 跑 `pytest`（确认 `mock_db_writes` 把新增 admin 写操作也拦住，避免误污染 dev DB）
- 跑 `npm test` 看是否影响 Navbar / MobileMenu 等用到 `useFeatureFlags` 的快照测试

## 风险与回滚

- **风险 1**: 漏写 EF 部署 → 后端 admin 路由会 fallback 到错误。**缓解**: 步骤 2 完成后立刻 curl 一次新 action 验证再继续。
- **风险 2**: `subscriptions.list_all` 是 60s timeout 的重接口，admin flags 页面每次刷新都拉一遍。**缓解**: page-level `force-dynamic` 已存在，admin 量级可接受；后续若慢再加 5min in-memory cache。
- **风险 3**: 表 PK 是 `(user_id, flag)`，upsert 重复无副作用。**确认**: schema 已是 `PRIMARY KEY (user_id, flag)`。
- **回滚**: `git revert` 本 PR；EF 上一版本通过 `insforge functions deploy` 重新部署即可。表数据无需回滚（新增的字段没有破坏性 schema 变化）。
