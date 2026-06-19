# Panda Community Agent Engineering Plan

> Status: MVP implemented, pending migration/deploy
> Related: backend/app/features/kol_research/.context.md, backend/app/features/agent_runtime/.context.md, backend/app/features/flags/.context.md, backend/app/features/payment/.context.md, backend/app/features/invites/.context.md, frontend/src/app/research/.context.md, frontend/src/app/kol/.context.md, docs/constraints/auth.md
> Vision: Partner/community-scoped Agent access for 潘大的科技交流圈

## 目标

为潘大私域社群成员提供一个专属 Agent 入口：社群成员登录后自动拥有 Panda Agent 权限，但不获得 TheMarketBrew 主站其它付费权益，也不被引导使用主站其它功能。

## 实施前背景与当前实现

- `pandacircle` persona 已存在于 `backend/app/shared/kol_persona/registry.py`，语料绑定包括 `zsxq_thread(author_username=pandacircle)` 与相关 X/Twitter corpus。
- 改造前 Panda 通过通用 KOL Research Agent 深链 `/research?agent=kol&persona=pandacircle` 试用；正式 MVP 已改为 `/panda` 专属 facade。
- 普通 `/api/kol_research/chat*` 不再作为 Panda 正式入口；Panda chat 只允许走 `/api/community/panda/chat/stream`。
- 通用 KOL chat 仍走主站 research quota：Max 用户无限，其他用户每日 2 次。Panda 社群成员不应被误判为 Max，也不应看到 Max 升级文案。
- 主站付费权益由 Stripe -> `subscriptions.entitlements` 管理。Panda 社群权限不是 Stripe 订阅，不应写入 `subscriptions.entitlements`。
- 邀请码/自动试用模块已退役，不能复活旧 trial/invite 模型来承载社群会员。
- Auth 已有稳定的 server-cookie bridge，后端接口使用 `Depends(verify_user_token)` / `Depends(verify_user_token_with_email)`。

## 设计

### MVP 决策：知识星球评论 email + 手工授权

第一版不做知识星球账号与 TheMarketBrew 账号的一对一自动同步，也不做
challenge code。运营流程改为：

```text
潘大在知识星球发仅成员可见的报名帖
  -> 成员评论 TheMarketBrew 注册 email
  -> 运营手工收集 email
  -> Admin 后台批量 grant Panda Agent access
  -> 用户用该 email 登录 /panda 后可访问 Agent
```

这个方案的安全边界是：报名帖只有社群成员可见；授权绑定到 TheMarketBrew
登录 email；分享 `/panda` 链接无效；成员若替别人提交 email，就会占用自己的报名机会。
MVP 不处理社群过期，因为当前社群会员是一年制，短期主要风险是转发访问入口。

### 核心原则

1. **Agent 权限独立于订阅权限**：Panda 社群成员只获得 `panda_agent` 访问权，不获得 `ai_research_engine`、`stock_research`、`today_website` 等主站权益。
2. **入口独立于主站研究台**：提供 `/panda` 专属页面，锁定 `persona_username=pandacircle`，不展示 persona selector、pricing CTA、主站功能导航。
3. **会员来源可审计**：MVP 用 admin email grant 作为正式数据链路，不用 feature flag 临时白名单替代。需要记录来源、授权人、授权时间、首次访问用户和撤销状态。
4. **登录归登录，会员归会员**：用户仍用 TheMarketBrew/Insforge 账号登录；登录成功后通过当前账号 email 是否有 active Panda grant 获得 Panda Agent 权限。

### 后端模块

新增 `backend/app/features/community_access/`：

- `router.py`：Panda 专属 access、chat、conversation facade endpoints 和 admin grant endpoints。
- `service.py`：email 规范化、批量 grant dry-run 计划和访问 helper。
- `db.py`：调用新的 Edge Function 或直接封装 Insforge table access。
- `models.py`：Pydantic DTO。

建议不要改 `payment.entitlements`，也不要让 Panda 社群权限进入 `MAX_FEATURES`。

### 数据模型

MVP 可以先用 email grant 表，后续再扩展到 member_id 绑定：

```text
community_access_grants
  id
  partner_id: "panda"
  email_normalized
  user_id nullable
  status: active | revoked
  grant_source: zsxq_comment | admin
  granted_by
  granted_at
  revoked_at nullable
  notes nullable
  unique(partner_id, email_normalized)
```

访问权派生：

```text
can_use_panda_agent =
  logged_in_user
  AND normalized(user.email) has active community_access_grants row
```

首次访问时可以把 `user_id` 回填到 grant row，便于审计，但鉴权仍以当前登录
email + active grant 为准，避免用户注册前无法预授权。

后续自动化版本再使用完整三类表：

```text
community_partners
  id: "panda"
  display_name
  persona_username: "pandacircle"
  status
  quota_policy
  created_at
  updated_at

community_memberships
  id
  partner_id: "panda"
  external_member_id
  external_handle
  email_normalized nullable
  phone_hash nullable
  status: active | expired | removed | banned
  valid_until nullable
  source: zsxq_api | csv | admin | signed_link
  raw_metadata jsonb
  last_seen_at
  synced_at
  created_at
  updated_at
  unique(partner_id, external_member_id)

community_user_bindings
  id
  partner_id: "panda"
  user_id
  membership_id
  status: active | revoked
  bind_method: signed_link | email_match | phone_match | admin
  bound_at
  last_verified_at
  revoked_at nullable
  unique(partner_id, user_id)
  unique(partner_id, membership_id)

community_sync_runs
  id
  partner_id
  source
  status: running | success | failed
  fetched_count
  upserted_count
  expired_count
  removed_count
  error
  started_at
  completed_at
```

访问权实时派生：

```text
can_use_panda_agent =
  logged_in_user
  AND active community_user_bindings row
  AND linked community_memberships.status == active
  AND valid_until is null or valid_until > now()
```

不要把这个权限复制到 Stripe `subscriptions.entitlements`。

### Membership Sync / Grant

MVP 使用手工 grant，不依赖知识星球 API：

1. 潘大在知识星球报名帖说明：只填写 TheMarketBrew 注册 email；每个星球账号只授权一个 email；换绑需要联系运营。
2. 运营从评论区复制 email 列表，粘贴到 Admin 后台。
3. 后台先 dry-run：校验 email 格式、去重、显示新增/已存在/将撤销的数量。
4. apply 后 upsert `community_access_grants(partner_id="panda", email_normalized, status="active")`。
5. 如发现滥用，Admin 可按 email revoke。

后续自动化优先级从高到低：

1. **平台 API / webhook**：如果知识星球或社群系统能提供成员 API，使用 cron 定期 pull，并在 webhook 到达时增量更新。
2. **每日导出文件**：如果没有稳定 API，让潘大侧每天导出 CSV/JSON，后台提供 admin upload/import 或从受控 bucket 拉取。
3. **成员专属绑定链接**：给每个外部 member 生成一次性 signed link/code，在社群内发给对应用户。用户登录后 claim 该 code，绑定 `user_id -> membership_id`。

不要使用一个全员共享的邀请码作为正式权限来源。共享码泄露后无法证明用户仍是社群成员，也无法做自动失效。

同步策略：

- 每次 sync 以 `external_member_id` upsert `community_memberships`。
- 不要因为一次 API/CSV 缺失就立刻删除会员；先标记 `last_seen_at`，超过 grace window 再置为 `removed` 或 `expired`。
- 如果外部源提供到期时间，写入 `valid_until`；否则状态由 sync 是否仍存在决定。
- 对已绑定用户，权限不需要额外写入，只要 membership 状态变为 inactive，下一次访问立即失效。
- 记录 `community_sync_runs`，方便排查“为什么某个用户突然不能用”。

### 登录与绑定流程

推荐流程：

```text
用户打开 /panda
  -> 未登录：跳 /login?redirect=/panda
  -> 登录成功回 /panda
  -> GET /api/community/panda/me
      - email has active grant: 显示 Agent，并可回填 user_id
      - no active grant: 显示“请确认报名 email 是否与登录 email 一致”
```

MVP 不提供公开绑定入口，避免用户自行输入共享码。授权动作只在 Admin 后台发生。

### API 设计

新增 Panda facade endpoints，避免前端直接调用通用 `/api/kol_research/chat/stream`：

```text
GET  /api/community/panda/me
POST /api/community/panda/chat/stream
GET  /api/community/panda/conversations
GET  /api/community/panda/conversations/{id}
POST /api/community/panda/conversations
PUT  /api/community/panda/conversations/{id}
DELETE /api/community/panda/conversations/{id}

POST /api/admin/community/panda/grants/dry-run
POST /api/admin/community/panda/grants/apply
GET  /api/admin/community/panda/grants
DELETE /api/admin/community/panda/grants/{grant_id}
```

`/chat/stream` 内部固定调用现有 `stream_kol_research(persona_username="pandacircle")`，但在调用前执行 `require_panda_agent_access()`。请求体里即使传其它 persona 也忽略或拒绝。

### Quota

MVP 不复用当前 KOL quota 的 Max/free 文案，也不因免费研究台额度耗尽阻断 Panda
成员。后续如需要控制成本，再给 Panda 单独 quota namespace：

```text
community_agent_usage
  partner_id
  user_id
  date
  used_count
```

后续可以配置为：

- active Panda member：每日 20 次或 partner-config 无限但加 rate limit。
- 非 member：0 次。
- 错误文案：只说明“当前账号没有 Panda 社群 Agent 权限 / 会员状态未同步”，不要提示升级 Max。

### 前端

新增专属页面：

```text
frontend/src/app/panda/page.tsx
frontend/src/app/panda/.context.md
```

页面要求：

- 使用极简 shell，不展示主站功能导航和 pricing CTA。
- 锁定 Panda Agent，隐藏 persona selector。
- 复用现有 `ChatPanel` / `ChatInput` / `KolChunksPanel` 的可复用部分；必要时抽出 `CommunityAgentChat` 组件。
- 未授权状态只显示登录/绑定/会员状态说明，不导流主站订阅。
- 历史对话只列 Panda Agent 会话。

### 安全与隐私

- MVP 不使用全员共享访问码，也不提供公开 grant API。
- Admin grant endpoint 必须使用 `verify_admin_user`，支持 dry-run，apply 需要明确确认。
- 如果处理手机号，只保存 normalized hash，不保存明文。
- 如果后续增加 membership sync endpoint，必须使用 `verify_admin_user` 或 `verify_cron_secret`，不要暴露无认证 Edge Function 写入口。
- 会员状态读取失败时 fail closed：不要把失败当作 active，也不要把失败当作“无历史对话”覆盖用户数据。
- PostHog / logs 可记录 `partner_id=panda`、`access_status`，不要记录外部平台敏感原始字段。

## 实施状态

1. [x] 新建 `community_access` 后端模块和 `community_access_grants` 迁移/Edge Function。
2. [x] 实现 Panda access gate，以 active grant email 为准，并在首次访问时回填 user id。
3. [x] 新增 Admin grant dry-run/apply/list/revoke API，支持粘贴 email 文本。
4. [x] 新增 Panda chat facade endpoint，固定 `persona_username="pandacircle"`，并绕开通用 KOL chat 的 Max/free quota 文案。
5. [x] 新增 Panda conversation facade，复用 agent runtime session，但 metadata 写入 `partner_id=panda`，列表只返回 Panda 会话。
6. [x] 新增 `/panda` 前端页面，复用聊天组件，移除主站导航/定价/多 persona 入口。
7. [x] 新增 Admin UI：批量粘贴 email、dry-run 预览、apply、搜索/revoke 单个 email。
8. [x] 隐藏并阻断通用 `/research` 入口使用 `pandacircle`，只允许专属社群 facade 调用。
9. [x] 更新 `.context.md`、auth 文档、页面引用文档和相关测试。
10. [ ] 后续再评估是否升级到知识星球 member_id 自动同步。
11. [ ] 后续如需要成本控制，再加 `partner_id=panda` 的独立 quota namespace。

## 上线检查

1. 在生产数据库执行 `backend/migrations/community_access_grants.sql`。
2. 部署 `backend/app/edge_functions/community-access.js`。
3. 确认 `pandacircle` persona 的知识库/语料已同步，且 `/api/kol_research/personas` 默认 research scope 不再返回 Panda。
4. 在 `/admin/panda` 粘贴知识星球评论区收集到的 email，先 dry-run，再 apply。
5. 将用户入口只发 `/panda`；不要发 `/research?agent=kol&persona=pandacircle`。
6. 抽样用一个已授权 email 和一个未授权 email 登录验证访问结果。
