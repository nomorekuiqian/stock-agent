# Twitter Digest Max Paywall Engineering Plan

> Status: Implemented, pending verification
> Related: `backend/app/features/twitter_digest/.context.md`, `backend/app/features/twitter/.context.md`, `backend/app/features/payment/.context.md`, `backend/app/features/subscription/.context.md`, `frontend/src/app/today/.context.md`, `frontend/src/lib/.context.md`, `frontend/src/components/.context.md`
> Vision: 产品策略.md > 模块 4 机会发现 / 模块 5 风险预警；把 KOL 信息流作为 Max 层的高信号情报源，而不是普通邮件权益。

## 目标

把推特日报升级为 Max 专属情报产品，并补齐与普通日报一致的生命周期能力：邮件订阅、退订、往期归档、详情页访问控制和免费转化入口。

## 现状

- `/twitter-digest` 和 `/twitter-digest/[date]` 已存在，前端通过 `api.twitterDigest.getLatest()` / `getByDate(date)` 读取后端 `DailyDigest`。
- `backend/app/features/twitter_digest/router.py` 当前读取端点只要求登录，`.context.md` 标记 TODO：读取端点目前仅要求登录，后续替换为 entitlement 校验。
- `kol_daily_digests` 已支持按 date 取单日和 latest，但没有列表接口，所以没有 `/twitter-digest/archive`。
- `SubscriptionChannel.TWITTER_DIGEST` 和 `RESEND_SEGMENT_TWITTER_DIGEST` 已存在，`broadcast_twitter_digest()` 走 Resend Broadcasts API，生产环境只发 dedicated segment。
- 当前偏好页的 `twitter_digest` toggle 没有 entitlement 限制，且 `SubscriptionService.add_to_default_segments()` 会把新用户默认加入 `twitter_digest` segment，这与 Max-only 目标冲突。
- `payment/entitlements.py` 当前 Max-only feature 只有 `stock_research`、`ai_research_engine`、`portfolio_management`，没有推特日报 feature。
- `/unsubscribe` 目前是 daily_report 专用表单，不能按 channel 退订。

## 产品设计

### 分层

| 用户 | Web 访问 | 邮件 | Archive |
|------|----------|------|---------|
| 未登录 | 可看 teaser：日期、headline、Top tickers、覆盖 KOL 数 | 不可订阅 | 可看 teaser 列表 |
| 登录免费 / Pro | 可看 teaser + Max 升级 CTA | 不可开启推特日报邮件 | 可看 teaser 列表，详情锁住 |
| Max / lifetime | 完整 latest、单日详情、完整 archive | 可订阅 / 退订 | 完整访问 |

核心原则：完整内容严格 Max-only；免费层只展示“今天 KOL 圈在吵什么”的证据，不给完整论证和原文证据链。

### 转化入口

- `/twitter-digest` 免费态不显示空锁屏，而是显示最新一期预览：headline、input_tweet_count、tracked_kol_count、Top 3 tickers、1 段价值说明。
- `/today` 和每日普通日报邮件底部加小型 teaser：“今天 KOL 圈最热：NVDA / TSLA / PLTR”，CTA 指向 `/twitter-digest`。
- `/pricing` 的 Max 栏新增“推特 KOL 日报 + 历史归档 + 邮件推送”，把它从 Pro 邮件权益里移出。
- Max 用户首次进入 `/twitter-digest` 时提示“订阅每日邮件”，但不挡住内容。

### 订阅与退订

- Entitlement 决定是否有资格：新增 Max feature `twitter_digest`。
- Preference 决定是否收邮件：`twitter_digest=true|false`。
- Resend segment 只是发送缓存：`RESEND_SEGMENT_TWITTER_DIGEST` 中只能出现 `has_entitlement("twitter_digest") && preference.twitter_digest == true` 的用户。
- 邮件 footer 保留 Resend 原生退订能力，同时提供“管理邮件偏好”链接到 `/profile?tab=email`。
- `/unsubscribe?channel=twitter_digest` 支持输入邮箱退订指定频道，体验与普通日报一致。

## 设计

### 权限模型

新增 feature key：

```text
twitter_digest
```

放入：

- Stripe Dashboard 的 Max product entitlements。
- `backend/app/features/payment/entitlements.py` 的 `MAX_ONLY_FEATURES`。
- 前端 `PaywallGuard` / `EntitlementsContext` 使用 `requiredFeature="twitter_digest"`。
- `frontend/src/app/profile/page.tsx` 的 `PREFERENCE_ITEMS`，让推特日报邮件 toggle 对非 Max 用户锁住。

后端读取端点必须做权威校验，前端付费墙只负责体验。

### 数据流

```text
Stripe Max entitlement
  -> entitlements.active_entitlement_summary.updated webhook
  -> subscriptions.entitlements JSONB
  -> sync_resend_segments(email, sub)
  -> RESEND_SEGMENT_TWITTER_DIGEST = Max 且已订阅

用户访问 /twitter-digest
  -> teaser endpoint: 未登录也可读轻量预览
  -> full endpoint: verify_user_token + has_entitlement("twitter_digest")

用户打开 /profile 邮件偏好
  -> GET /api/subscriptions/preferences
  -> twitter_digest 显示当前偏好；非 Max 显示锁定
  -> POST /api/subscriptions/preferences
  -> 更新偏好并 reconcile Resend segment

邮件退订
  -> /unsubscribe?channel=twitter_digest
  -> POST /api/subscriptions/twitter_digest/unsubscribe
  -> preference=false + remove from segment
```

### API 变更

新增或修改：

| Endpoint | Auth | 行为 |
|----------|------|------|
| `GET /api/twitter-digest/latest` | Bearer + `twitter_digest` | 返回完整最新日报 |
| `GET /api/twitter-digest/{date}` | Bearer + `twitter_digest` | 返回完整单日详情 |
| `GET /api/twitter-digest/teaser/latest` | Open | 返回最新一期轻量 teaser |
| `GET /api/twitter-digest/archive` | Bearer + `twitter_digest` | 分页返回完整归档列表 |
| `GET /api/twitter-digest/archive/teaser` | Open | 分页返回轻量归档列表 |
| `POST /api/twitter-digest/broadcast` | Cron | 只发 Max 且 opt-in segment |
| `POST /api/subscriptions/preferences` | Bearer | `twitter_digest=true` 需要 `twitter_digest` entitlement |
| `POST /api/subscriptions/twitter_digest/unsubscribe` | Open | 邮箱退订推特日报频道 |
| `POST /api/subscriptions/twitter_digest/subscribe` | Open | 返回 403；推特日报只能在 Max 用户邮件偏好中开启 |

建议新增模型：

```python
class DailyDigestListItem(BaseModel):
    date: str
    generated_at: str
    headline: str
    input_tweet_count: int
    tracked_kol_count: int
    hot_tickers: list[HotItem] = []
    hot_sectors: list[HotItem] = []

class TwitterDigestTeaser(BaseModel):
    date: str
    headline: str
    input_tweet_count: int
    tracked_kol_count: int
    hot_tickers: list[HotItem] = []
    intro_preview: str = ""
```

### Database / Edge Function

在 `backend/app/edge_functions/kol-tweets.js` 增加：

- `GET ?action=list_digests&limit=12&offset=0`
- 返回 `data` 和 `total`，按 `date DESC` 排序。
- 字段只取归档列表需要的 lightweight 列，避免把完整 JSONB 正文拉到 archive 列表。

偏好持久化建议两步走：

1. 短期：继续使用 Resend segment 表达 `twitter_digest` opt-in 状态；`sync_resend_segments()` 只负责移除非 Max，Max 用户通过 profile 明确开启。
2. 推荐：在 `subscriptions` edge function 加 `email_preferences` JSONB，至少保存 `{"twitter_digest": true|false}`，避免 Stripe webhook 后续误覆盖用户退订状态。

如果做第 2 步，`RESEND_SEGMENT_TWITTER_DIGEST` 永远由 `entitlement && preference` 推导，不再作为偏好真相源。

### Frontend

新增页面：

- `/twitter-digest/archive`：复用 `/today/archive` 的分页体验，但卡片内容改为 headline、date、KOL 数、推文数、hot tickers。

修改页面：

- `/twitter-digest`：Max 用户读取完整 latest；非 Max 读取 teaser 并显示 preview paywall。
- `/twitter-digest/[date]`：Max 用户完整读取；非 Max 显示该日期 teaser + Max CTA。
- `/profile` 邮件偏好：推特日报 toggle 需要 `twitter_digest` entitlement；非 Max 显示锁标和“升级 Max”链接。
- `/pricing`：Max features 增加推特日报，Pro features 不出现推特日报。
- `/unsubscribe`：支持 `channel` query；默认仍是 `daily_report`，`channel=twitter_digest` 时文案和 API 切换。
- `Navbar` / `MobileMenu`：推特日报旁可加 Max 标识，但不直接跳 pricing，让 teaser 页面承接转化。

### Broadcast

- `broadcast_twitter_digest()` 继续只使用 `RESEND_SEGMENT_TWITTER_DIGEST`，不回退到 Daily audience。
- 非生产环境继续拒绝 broadcast，QA 走 `_qa_send_twitter_digest_to_email()`。
- 生产上线前必须跑一次 segment audit，确认 non-Max 不在推特日报 segment。

## 实施步骤

1. [x] Stripe / entitlement 准备：在 Stripe Max product 添加 `twitter_digest` entitlement；同步更新 `payment/entitlements.py`、价格页文案和 lifetime Max 逻辑。（Stripe Dashboard 需上线前人工确认）
2. [x] 后端权限门：在 `twitter_digest/router.py` 新增 `_require_twitter_digest_access()`，用 `Depends(verify_user_token)` + `has_entitlement(user_id, "twitter_digest")` 保护完整读取和 archive 完整列表。
3. [x] Teaser API：新增 latest/archive teaser endpoint，只返回轻量字段，供未登录和非 Max 用户转化页使用。
4. [x] Archive 数据层：给 `kol-tweets` Edge Function 和 `twitter_digest/db.py` 增加 `list_digests(limit, offset)`，返回 `DailyDigestListItem`。
5. [x] 前端 archive：新增 `/twitter-digest/archive`，布局参考 `/today/archive`，Max 用户完整可点，非 Max 显示 teaser 卡片和升级 CTA。
6. [x] 页面付费墙：改造 `/twitter-digest` 和 `/twitter-digest/[date]`，避免非 Max 直接调用完整 protected endpoint；使用 teaser view 承接转化。
7. [x] 邮件偏好 gating：给 `twitter_digest` 绑定 entitlement；非 Max 不能开启，Max 可开启/关闭。
8. [x] 订阅状态持久化：优先实现 `email_preferences.twitter_digest` 或等价字段；让 `sync_resend_segments()` 根据 `entitlement && preference` reconcile segment，避免 webhook 覆盖退订。
9. [x] 退订页多频道：`/unsubscribe` 支持 `channel=twitter_digest`，调用对应 channel API，文案从“每日报告”切换成“推特 KOL 日报”。
10. [x] Broadcast 收件人安全：移除 `add_to_default_segments()` 中对 `twitter_digest` 的默认加入；新增 audit 脚本清理 non-Max 或显式 opt-out segment 成员。
11. [x] 订阅入口安全：公开 `POST /api/subscriptions/twitter_digest/subscribe` 返回 403，避免绕开 Max 邮件偏好。
12. [x] 转化入口：在 `/today` 页面和普通日报邮件模板底部加推特日报 teaser CTA；确保只展示 headline/hot ticker，不泄露完整付费内容。
13. [x] 测试：补后端 router 权限测试、subscription preference 测试、entitlement catalog 测试、ReportTabs 测试。
14. [x] 文档更新：更新 `backend/app/features/twitter_digest/.context.md`、`payment/.context.md`、`subscription/.context.md`、`docs/reference/pages.md`、`docs/reference/components.md`。

## 上线与迁移

1. 部署前：在 Stripe 配好 `twitter_digest` Max entitlement。
2. 部署后：确认 `/api/payment/me/entitlements?fresh=true` 对 Max 用户返回 `twitter_digest`。
3. 先 dry-run segment audit：

```bash
python backend/scripts/audit_twitter_digest_segment.py
```

4. 确认将被移除的 non-Max / 显式 opt-out 数量。
5. 执行 apply：

```bash
python backend/scripts/audit_twitter_digest_segment.py --apply
```

6. 用一个 Max 测试账号验证：访问 latest、访问 archive、开启/关闭邮件偏好、收到 QA 单发。
7. 用一个免费账号验证：只能看到 teaser，完整 API 返回 403，不能开启邮件订阅。
8. 第一次生产 broadcast 后检查：Resend sent 数量、退订率、点击 `/twitter-digest` 的转化漏斗。

## 成功指标

- 访问控制：非 Max 调完整读取 API 的 403 率符合预期，无数据泄露。
- 订阅安全：`RESEND_SEGMENT_TWITTER_DIGEST` 中 non-Max 成员数为 0。
- 转化：从 `/today` teaser 到 `/twitter-digest` 的点击率、从 teaser 到 `/pricing` 的点击率、Max trial/checkout 转化率。
- 邮件健康：open rate、unsubscribe rate、complaint rate；退订率超过 5% 需要复盘频率和默认 opt-in 策略。
- 内容健康：Max 用户对每期“有用 / 不相关”反馈，低评分优先改 prompt，不先加功能。

## 待定问题

1. Max 用户是否默认订阅推特日报邮件？当前实现为显式 opt-in，不默认加入；后续如改默认开启，必须继续尊重 `email_preferences.twitter_digest=false`。
2. 免费用户 archive teaser 展示多少历史？推荐 10-20 条标题级列表，完整内容仍 Max-only。
3. Pro 用户是否给一次性 7 天体验？如果目标是抬 Max 转化，推荐只给 teaser，不给 Pro 特权。
4. 推特日报邮件是否要日发工作日？当前维持工作日；如果退订率高，改成“每日 / 每周精选”双模式。
5. 邮件 footer 用 Resend 原生退订还是站内多频道退订作为主入口？推荐两者都保留：原生退订合规兜底，站内链接负责精细偏好。

## 风险

| 风险 | 应对 |
|------|------|
| 只做硬付费墙导致转化差 | 保留 teaser、日报入口、邮件入口，让用户先看到价值证据 |
| Resend segment 误发给非 Max | segment audit + broadcast 前只认 dedicated segment + nonprod 禁发 |
| 用户退订后被 webhook 重新加入 | 增加 app-side preference，segment 只做派生缓存 |
| 前端 paywall 被绕过 | 后端完整读取端点做 entitlement 权威校验 |
| Archive 列表拉完整 JSONB 太慢 | Edge Function list 只返回轻量字段 |
| Stripe entitlement 未配置导致 Max 无权限 | 上线 checklist 先验证 `me/entitlements?fresh=true` |
