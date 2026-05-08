# Lifetime Max 系统

## 背景

当前 Stripe 是权限唯一真相源，`webhook → entitlements 列 → 前端` 是单向链路。给用户打 `invite_code: LIFETIME_GIFT` 标签不起任何代码作用——只要绑了真实 Stripe 订阅，订阅一过期 webhook 就把用户刷成 free/canceled，entitlements 清空。

事故案例：
- `wushaoqing1986@gmail.com` (Frank) 4/17 标 LIFETIME_GIFT，绑了一条月度 max 订阅，5/1 自动到期 → `customer.subscription.deleted` webhook 触发 `payment/router.py:308-314` 把他刷成 free + entitlements=[]。

## 目标

加一个 `is_lifetime` 字段做永久豁免标记——为 true 时所有 webhook 跳过降级，权限永久保留。

## 影响面

| 层 | 文件 | 改动 |
|---|---|---|
| DB | Insforge `subscriptions` 表 | 加列 `is_lifetime BOOLEAN DEFAULT FALSE` |
| Edge | `backend/app/edge_functions/subscriptions.js` | upsert 接受 `is_lifetime`；返回字段；新 action `set_lifetime` |
| Backend DB | `backend/app/features/payment/db.py` | `upsert_subscription` 加参数；新 helper `set_lifetime` |
| Backend Webhook | `backend/app/features/payment/router.py` | `subscription.deleted` / `entitlements.active_entitlement_summary.updated` 进函数先读 sub，is_lifetime=true 直接 return |
| Backend Gateway | `backend/app/features/payment/entitlements.py` | `has_entitlement` / `get_user_entitlements` 检测 is_lifetime → 返回完整 MAX_FEATURES（双保险） |
| Tools | `backend/scripts/grant_lifetime.py` | CLI: `python -m scripts.grant_lifetime <email>` 一键开通 |
| Docs | `backend/app/features/payment/.context.md` | 补充 lifetime 机制说明 |

## 防护原理

```
webhook → router.py 入口 → get_subscription() → is_lifetime?
                                                  ├─ true → return 200, 不写库
                                                  └─ false → 走原逻辑
```

即使有别的代码意外清空 entitlements 列，`get_user_entitlements()` 也会因为 is_lifetime=true 返回完整 MAX_FEATURES → 前端权限不受影响。

## 用户操作清单

1. 在 Insforge dashboard `subscriptions` 表加列 `is_lifetime`（BOOLEAN，default false）
2. 部署后端
3. `cd backend && python -m scripts.grant_lifetime wushaoqing1986@gmail.com`
4. 验证：`curl '...subscriptions?action=get&user_id=...'` 看到 `is_lifetime: true, plan: max, entitlements: 9 items`

## 不做

- 不动 Stripe 端订阅（终身用户不必绑 Stripe 订阅）
- 不做后台 UI（CLI 即可，开终身是低频操作）
- 不做 macro_dashboard：context 已说明该权限免费开放，无需进 entitlements
