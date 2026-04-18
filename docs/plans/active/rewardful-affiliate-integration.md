# Rewardful Affiliate 集成计划

## 目标

为 TheMarketBrew 接入 Rewardful 联盟营销系统，让推广者通过专属链接推荐新用户订阅，自动追踪佣金并完成结算。

## 背景

- 已有 Stripe 订阅支付体系（Pro $4.99/月、Max $9.99/月）
- Rewardful 与 Stripe 原生集成，接入成本极低
- 定价：Starter $49/月，14 天免费试用，0% 交易手续费

## 佣金策略

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 佣金类型 | 百分比 | 按实际支付金额 |
| 佣金比例 | 30% | 官方建议最低值 |
| 佣金模式 | Recurring（循环） | 用户续费期间持续产生佣金 |
| Cookie 有效期 | 60 天 | 默认值 |
| 归因模型 | Last-touch | 归功于最后一个推广者 |

## 实施步骤

### Phase 1: Rewardful 账户与 Stripe 连接

- [ ] 注册 Rewardful（14 天免费试用）
- [ ] 一键连接 Stripe 账户（Rewardful 自动配置 webhook）
- [ ] 创建 Campaign：设置佣金比例 30%、Cookie 60 天、Last-touch 归因
- [ ] 获取 Rewardful API Key

### Phase 2: 前端集成（3 处改动）

- [ ] `frontend/src/app/layout.tsx` — 添加 Rewardful 追踪脚本（2 个 Script 标签）
- [ ] `frontend/src/contexts/SubscriptionContext.tsx` — `createCheckout` 传递 `Rewardful.referral`
- [ ] 添加 TypeScript 类型声明（`window.Rewardful`）

### Phase 3: 后端集成（1 处改动）

- [ ] `backend/app/features/payment/service.py` — `create_checkout_session` 接收 `referral_id` 参数，传入 Stripe Checkout Session 的 `client_reference_id`

### Phase 4: 测试验证

- [ ] 无痕窗口打开联盟链接（`?via=test`）
- [ ] 完成测试订阅购买
- [ ] 确认 Rewardful 仪表盘正确追踪到转化和佣金
- [ ] 测试退款场景下佣金自动调整

### Phase 5: 上线推广

- [ ] 发布联盟成员注册页面
- [ ] 配置 PayPal Business 或 Wise Business 账户用于付款
- [ ] 招募首批联盟成员
- [ ] （可选）在 app 内嵌入联盟门户（通过 SSO 魔术链接 API）

## 技术细节

### 前端追踪脚本

```tsx
// app/layout.tsx <head> 中
<Script id="rewardful-queue" strategy="beforeInteractive">
  {`(function(w,r){w._rwq=r;w[r]=w[r]||function(){(w[r].q=w[r].q||[]).push(arguments)}})(window,'rewardful');`}
</Script>
<Script
  src="https://r.wdfl.co/rw.js"
  data-rewardful="YOUR_API_KEY"
  strategy="afterInteractive"
/>
```

### Checkout 传递 referral

```tsx
// SubscriptionContext.tsx createCheckout
const res = await api.post('/api/payment/checkout-session', {
  tier,
  referral: typeof window !== 'undefined' && window.Rewardful?.referral || undefined
});
```

### 后端 Checkout Session

```python
# payment/service.py create_checkout_session
session = stripe.checkout.Session.create(
    customer=customer_id,
    mode="subscription",
    line_items=[{"price": price_id, "quantity": 1}],
    client_reference_id=referral_id,  # Rewardful 归因
    success_url=...,
    cancel_url=...,
)
```

### Rewardful REST API（后续扩展用）

- Base URL: `https://api.getrewardful.com/v1/`
- 认证: HTTP Basic Auth（API Secret 作为用户名）
- 联盟成员管理: `/v1/affiliates`
- SSO 魔术链接: `/v1/affiliates/:id/sso`
- 佣金查询: `/v1/commissions`
- Webhook: 31 种事件类型

## 风险与注意

- Rewardful 免费试用仅 14 天，需在试用期内完成集成测试
- Starter 方案联盟收入上限 $7,500/月，超过需升级到 Growth $99/月
- 付款需要 PayPal Business 或 Wise Business 账户
- Rewardful 不自动付款，需商家手动下载 CSV 并上传到 PayPal/Wise 批量付款
