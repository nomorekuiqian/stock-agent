# Auth Official Alignment Baseline

> Recorded at: 2026-03-19
> Branch: `master`
> Base commit: `66b0dbf2158e04dc0c6256fc43576a3348b843a4`
> Purpose: 作为本次 auth 官方化改造的明确回滚基线

## 说明

这份基线不是“只记录一个 commit hash”。

原因是当前工作区不是干净状态，auth 相关代码存在未提交改动。因此：

- 回滚到 **基础提交**：`66b0dbf2158e04dc0c6256fc43576a3348b843a4`
- 再叠加 **当前未提交 auth 差异**

两者合起来，才是“现在这版 authentication 框架状态”。

## 当前工作区状态

当前 `git status --short` 里与本次计划相关的条目：

- `M frontend/src/lib/auth.ts`
- `?? frontend/src/app/api/auth/oauth-callback/route.ts`
- `?? docs/plans/auth-official-alignment.md`

另外还有一个无关改动：

- `M .gitignore`

`.gitignore` 不属于本次 auth 回滚面，不应在 auth 回滚时被误处理。

## 当前 auth 关键文件

当前 auth 基线至少覆盖这些文件：

- `frontend/src/lib/auth.ts`
- `frontend/src/lib/insforge.ts`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/components/Providers.tsx`
- `frontend/src/app/api/auth/route.ts`
- `frontend/src/app/api/auth/session/route.ts`
- `frontend/src/app/api/auth/oauth-callback/route.ts`
- `frontend/middleware.ts`

## 当前未提交 auth 差异快照

为了支持精确回滚，已额外保存一份 patch 快照：

- [auth-official-alignment-baseline.patch](/Users/kedeng/Desktop/projects/stock-agent/docs/plans/auth-official-alignment-baseline.patch)

这份 patch 记录了当前未提交的 auth 差异：

1. `frontend/src/lib/auth.ts`
   - `signInWithGoogle()` 被改成手工 PKCE + `/api/auth/oauth/google`
2. `frontend/src/app/api/auth/oauth-callback/route.ts`
   - 新增 server-side OAuth exchange callback route

## 回滚到“现在这版状态”的方法

如果后续官方化改造失败，目标不是回到任意旧版本，而是回到本文件记录的当前状态。

回滚步骤：

1. 将仓库 auth 相关文件恢复到基础提交 `66b0dbf2158e04dc0c6256fc43576a3348b843a4`
2. 重新应用 `docs/plans/auth-official-alignment-baseline.patch`
3. 保留当前文档与测试基线记录
4. 重新跑以下验证：
   - `npm test`
   - `npm run build`
   - 邮箱密码登录
   - 页面刷新恢复
   - 浏览器重开恢复
   - Google OAuth
   - 登出

只有在以上验证重新通过后，才视为成功回滚到“现在这版 auth 框架状态”。
