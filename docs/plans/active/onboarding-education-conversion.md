# Onboarding Guided Tour Engineering Plan

> Status: Implementing
> Related: `frontend/src/app/page.tsx`, `frontend/src/components/HomeGuidedTour.tsx`, `frontend/src/components/OnboardingGate.tsx`, `frontend/src/app/login/.context.md`, `docs/constraints/auth.md`
> Vision: 新用户注册后直接回到真实首页，用轻量 Guided Tour 看懂顶部导航里的核心入口，并知道要添加自选股。

## 目标

把新用户 onboarding 从独立多步骤页面改为首页上的 contextual guided tour。用户注册或首次 OAuth 后回到 `/?tour=1`，直接高亮顶部导航里的「AI 研究助手 / 每日简报 / 投研 / 我的」四个入口，简单说明每天能从日报、Agent、结构化研究工具和自选股监控中获得什么。

## 设计原则

- **真实 UI 上教学**：不再先把用户带到单独介绍页，而是在用户会反复使用的顶部导航上做 spotlight/coach-mark。
- **短而清楚**：固定 4 步，不讲完整产品关系，只讲用户每天能得到的价值和下一步动作。
- **不阻塞使用**：用户可以跳过；完成或跳过都标记 onboarding complete，避免被旧 gate 反复拦截。
- **不保留独立介绍页**：独立 `/onboarding` 页面已移除；自选股、画像和转化动作回到真实功能页承接。

## 新流程

```text
注册 / 首次 OAuth
  -> 默认 redirect 到 /?tour=1
  -> HomeGuidedTour 检查完成状态后启动
  -> Step 1: AI 研究助手，解释如何深挖个股、宏观和事件问题
  -> Step 2: 每日简报，解释早报/晚报/KOL 日报每天解决什么
  -> Step 3: 投研，解释个股、宏观、博主研究室是结构化研究入口
  -> Step 4: 我的，提醒用户添加自选股以启动专属日报和关注列表
  -> 完成或跳过
  -> POST /api/user/onboarding/complete (best-effort)
  -> markLocalOnboardingCompleted(user.id)
  -> 留在首页继续使用
```

## 实现点

### 导航

- `frontend/src/app/page.tsx` 挂载 `HomeGuidedTour`。
- `frontend/src/components/navigation.ts` 在四个主导航项上配置 `tourTarget`：
  - `nav-research-agent`
  - `nav-daily-reports`
  - `nav-research-system`
  - `nav-my`
- `Navbar` 和 `MobileMenu` 渲染 `data-guided-tour-target`，移动端 `?tour=1` 自动展开菜单。

### Guided Tour

`frontend/src/components/HomeGuidedTour.tsx`：

- `?tour=1` 是注册/首次 OAuth 后的正常入口，启动前检查本地 `onboarding_completed:{userId}`、本地 home tour marker 和后端 `/user/onboarding-status`；已完成用户清理 URL 后不展示。
- `?tour=home` 是手动强制预览入口，用于调试和微调，不作为注册默认 redirect。
- 用 fixed spotlight ring + dark backdrop 高亮目标区域。
- 每一步定位到导航入口并显示 info chip。
- 支持移动端定位、resize/scroll 后重新测量。
- 完成/跳过时：
  - `api.user.completeOnboarding()` best-effort
  - 写 `onboarding_completed:{userId}` local marker
  - 写 `home_guided_tour_completed:{userId}` local marker
  - 清理 URL 上的 `tour` query

### Auth / Gate

- 邮箱注册默认 redirect 使用 `/?tour=1`。
- 邮箱验证完成后按 redirect 回首页 tour。
- OAuth callback 首次用户 `completed:false` 时落到 `/?tour=1`。
- `OnboardingGate` 未完成时跳 `/?tour=1`。

## Analytics

第一版只加前端产品事件：

- `home_guided_tour_started`
- `home_guided_tour_step_view`
- `home_guided_tour_completed`

## 验证清单

- [ ] 新用户 `/?tour=1` 能启动 tour。
- [ ] 已完成用户 `/?tour=1` 不启动 tour，并清理 `tour` 参数。
- [ ] `/?tour=home` 能强制启动 tour，方便微调。
- [ ] 桌面 1440px 下 4 步都能正确高亮顶部导航项、显示 chip。
- [ ] 移动 390px 下无水平滚动，chip 不遮挡到不可操作。
- [ ] 点击“完成导览”后 URL 清理、后端 complete API best-effort、本地 marker 写入。
- [ ] 点击“跳过”也不会再被 `OnboardingGate` 反复带回 tour。
- [ ] 邮箱注册默认 verify redirect 指向 `/?tour=1`。
- [ ] OAuth 首次用户落点是 `/?tour=1`。

## 后续可选

- 在最后一步增加一个轻 CTA：“先看盘后总览”或“进入 Research Agent”。
- 把 tour 进度接入 PostHog funnel。
- 在 `/for-you` 空态继续引导到 `/for-you/watchlist` 添加自选股，但不作为注册第一屏强制任务。
