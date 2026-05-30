# Phase 2 微信小程序 UI 重构计划

## Context

当前 login 页面使用已废弃的密码绑定方式（email + password），不支持 Google OAuth 用户；profile 页面只有二态（isLoggedIn true/false），没有三态账号模型的 UI 分流。Phase 2 目标：切换到 OTP 邮件验证链接绑定，并实现完整的三态 UI（unbound / email_only / bound）。

**三态定义：**
- `unbound` — wx.login 后未绑定邮箱（游客）
- `email_only` — OTP 验证了邮箱但无现有 Insforge 账号（轻量用户）
- `bound` — 绑定了现有 Insforge 账号（完整用户）

**OTP 流程（无 push callback，用户手动确认）：**
1. 小程序调 `POST /api/wechat/register/request { email }` → 后端发邮件
2. 用户在手机邮件客户端点击链接 → 浏览器打开 `/wechat-verify?t=token` 完成验证
3. 用户回到小程序点"我已完成验证" → 重新调 `wx.login()` 获取带新状态的 JWT

---

## 关键文件

| 文件 | 改动类型 |
|------|---------|
| `miniprogram/utils/storage.ts` | ❌ 新增 account_state / email 存取 |
| `miniprogram/services/auth.ts` | ⚠️ 已有 registerRequest/refreshLogin，仅需加 setAccountState/setEmail 调用 |
| `miniprogram/pages/login/login.ts` | ⚠️ 已有 3-view 状态机，仅需加倒计时 + maskedEmail |
| `miniprogram/pages/login/login.wxml` | ⚠️ 已有基本结构，需加倒计时绑定 + maskedEmail + 价值引导 |
| `miniprogram/pages/login/login.scss` | ⚠️ 已有主体，需加倒计时/btn-disabled 样式 |
| `miniprogram/pages/profile/profile.ts` | ❌ 完整重构三态分流 |
| `miniprogram/pages/profile/profile.wxml` | ❌ 完整重构三态 UI |
| `miniprogram/pages/profile/profile.scss` | ❌ 完整重构样式 |

**Repo 路径：** `/Users/xuxueyang/Documents/GitHub/stock-agent/miniprogram/`（小程序已并入主 repo）

---

## 实现方案

### Task 1：`utils/storage.ts` — 新增两个键

新增常量：
```typescript
const ACCOUNT_STATE_KEY = 'tmb_account_state';
const EMAIL_KEY = 'tmb_email';
```

新增导出类型和 4 个函数：
```typescript
export type AccountState = 'unbound' | 'email_only' | 'bound';

export function getAccountState(): AccountState   // 无缓存默认 'unbound'
export function setAccountState(state: AccountState): void
export function getEmail(): string
export function setEmail(email: string): void
```

`clearAll()` 中新增清除这两个 key。

---

### Task 2：`services/auth.ts` — 补全 storage 调用（已有函数骨架）

`registerRequest`、`refreshLogin`、`account_state` 字段均已实现。仅需在以下位置补充调用：

**`wechatLogin()` 中，存 token 后追加：**
```typescript
import { ..., setAccountState, setEmail, AccountState } from '../utils/storage';

if (result.account_state) {
  setAccountState(result.account_state as AccountState);
}
```

**`registerRequest()` 成功后存 email（可选，便于 profile 展示）：**
```typescript
import { ..., setEmail } from '../utils/storage';
// 在 registerRequest 调用端（login.ts）成功后存：setEmail(email)
// （也可在 auth.ts 内改造，但 email 是调用方传入的，在 login.ts 侧存更合理）
```

---

### Task 3：`pages/login/login.ts` — 补充倒计时 + maskedEmail（骨架已存在）

现有 3-view 状态机（`login | register | pending`）和 OTP 核心逻辑已完整。仅需新增：

**新增 data 字段：**
```typescript
maskedEmail: '',       // "x**@domain.com" 截断显示
countdown: 0,          // 倒计时秒数（60→0）
countdownActive: false,
```

**新增私有计时器管理：**
```typescript
_countdownTimer: null as ReturnType<typeof setInterval> | null

_startCountdown()   // setInterval 60s，归零后 clearInterval
_clearCountdown()   // clearInterval + reset
onUnload()          // 调 _clearCountdown，防泄漏
```

**修改 `onSendVerification()`：** 成功后同时：
- `setData({ maskedEmail: maskEmail(email) })`
- `_startCountdown()`
- `setEmail(email)` 存储（需 import setEmail）

**新增 `onResend()`：** 仅 `countdownActive=false` 时执行发送，否则 return。

**`maskEmail` 纯函数：** `x**@domain.com`，超 20 字符才截断。

---

### Task 4：`pages/login/login.wxml` — 补充缺失区块（基础结构已存在）

现有 3-view 结构（`login / register / pending`）已完整。需要修改：

**register view 新增价值引导卡（在邮箱输入框上方）：**
```xml
<view class="value-props">
  <view class="value-item">·跨设备同步订阅列表</view>
  <view class="value-item">·接收每日市场简报邮件</view>
  <view class="value-item">·解锁完整账号所有功能</view>
</view>
```

**register view section-desc 文案优化：**
`"输入邮箱以接收验证链接，或跳过直接使用"` 保持或微调。

**pending view 新增 maskedEmail 展示：**
```xml
<view class="section-desc">
  链接已发至 <text class="email-highlight">{{maskedEmail}}</text>
</view>
```

**pending view 重发按钮改为倒计时版：**
```xml
<view class="btn-secondary {{countdownActive ? 'btn-disabled' : ''}}" bind:tap="onResend">
  <text wx:if="{{countdownActive}}">重新发送（{{countdown}}s）</text>
  <text wx:else>重新发送</text>
</view>
```

**注意：** 现有 `view='login'/'register'/'pending'` 命名保持不变，无需改为 step。

---

### Task 5：`pages/login/login.scss` — 补充新增样式（主体已存在）

现有样式已覆盖：brand、register-section、pending-section、section-header 等。仅需追加：

```scss
/* 价值引导列表（register view）*/
.value-props { background: var(--bg-muted); border: 2rpx solid var(--border); border-radius: var(--radius-sm); padding: 24rpx 28rpx; margin-bottom: 32rpx; }
.value-item { font-size: 26rpx; color: var(--fg-muted); padding: 6rpx 0; display: flex; gap: 12rpx; }

/* 邮箱高亮（pending view）*/
.email-highlight { color: var(--emerald); font-weight: 500; }

/* 重发按钮禁用态 */
.btn-disabled { opacity: 0.5; pointer-events: none; }
```

---

### Task 6：`pages/profile/profile.ts` — 三态分流

**data 字段：**
```typescript
data: {
  accountState: 'unbound' as AccountState,
  email: '',
  emailInitial: '',   // 头像首字母
  isLoggedIn: false,
}
```

**onShow 逻辑：**
```
isLoggedIn = !!getToken()
accountState = isLoggedIn ? getAccountState() : 'unbound'

若 accountState === 'bound':
  redirectTo WebView /profile?from=wechat&token=xxx
  （用 redirectTo 而非 navigateTo，避免返回键死循环）
```

**方法：**
- `onGoBindEmail()` → navigateTo login（unbound CTA）
- `onBrowseContent()` → switchTab home（unbound 次要操作）
- `onEmailSubscribe()` → 打开 WebView /subscription（email_only）
- `onUpgradeAccount()` → 打开 WebView /register（email_only 次要升级）
- `onLogout()` → showModal 确认 → clearAll → 页面刷新为 unbound 态

---

### Task 7：`pages/profile/profile.wxml` — 三态 UI

三个 `<block wx:if>` 分支：

**unbound（游客态）：**
- 灰色头像 + amber 角标"游客"
- 价值引导卡（3 项：跨设备同步 / 每日简报 / 账号安全）
- 主 CTA："立即绑定邮箱"
- 次要："继续浏览内容"

**email_only（邮箱用户态）：**
- emerald 头像（邮箱首字母）+ 邮箱地址 + "邮箱用户"绿色 tag
- 菜单卡：邮件订阅 →
- 次要升级引导（小字）：注册完整账号 →
- 退出登录按钮

**bound（跳转中）：**
- skeleton 骨架屏（头像 + name + tag 三行），onShow 已触发 redirectTo

---

### Task 8：`pages/profile/profile.scss` — 新增样式

复用全局类：`.card`、`.btn-primary`、`.accent-bar`、`.skeleton`

新增：
- `.avatar-badge` + `.badge-amber` — 头像右下角角标
- `.tag-dot-amber` — amber 色状态点
- `.value-guide-card` / `.value-guide-item` / `.value-guide-icon/label/desc`
- `.cta-section` — unbound CTA 区域
- `.upgrade-hint` / `.upgrade-hint-link` — email_only 次要升级
- `.bound-loading` + `.skeleton-avatar/name/tag` — bound 骨架屏尺寸

---

## 测试计划

### 模拟器测试（15 个场景）

| # | 场景 | 验收标准 |
|---|------|---------|
| T1 | 无 token，进入我的 | 显示游客态 UI（灰色头像 + amber 角标） |
| T2 | 点击微信登录，后端返回 unbound | step: initial → wx_loading → otp_idle |
| T3 | 输入合法邮箱点发送 | step: otp_sent；maskedEmail 截断；倒计时 60s 启动 |
| T4 | 输入无 @ 邮箱点发送 | 显示 emailError，不发请求 |
| T5 | 倒计时中点重发 | 按钮 disabled，无请求 |
| T6 | 倒计时归零后点重发 | 正常发送，倒计时重启 |
| T7 | 点"我已完成验证"，后端已升级 | otp_confirming → switchTab home |
| T8 | 点"我已完成验证"，后端未升级 | Toast 提示，回 otp_sent |
| T9 | 点"跳过" | switchTab home；account_state=unbound |
| T10 | account_state=email_only 进入我的 | 邮箱首字母头像 + 绿色 tag + 菜单 |
| T11 | account_state=bound 进入我的 | skeleton 后 redirectTo WebView /profile |
| T12 | 退出登录 → 确认 | clearAll；页面显示游客态 |
| T13 | 退出登录 → 取消 | 无变化 |
| T14 | 倒计时 60s 后归零 | countdownActive=false，重发按钮恢复 |
| T15 | navigateTo 其他页再返回 | 无内存泄漏（旧 timer 已 clear） |

### 真机专项（5 项，需真机调试 2.0）

1. `type="email"` 键盘弹出带 "@" 的邮件输入法
2. 后台挂起返回后倒计时数值准确（若不准，改为记录开始时间戳计算剩余）
3. bound → redirectTo WebView 无白屏闪烁（< 300ms skeleton）
4. 超长邮箱截断显示正确：`xuxueyang.professional@longcompany.com` → `x**@longcompany.com`
5. wx.login 网络失败：Toast 正确，step 回到 initial

---

## 注意事项

1. **不修改 `miniprogram/services/api.ts`**，`buildWebViewUrl` 已实现 token 注入
2. **不删除 `bindAccount(email, password)`** 旧函数，仅新增 OTP 函数
3. **`redirectTo` 用于 bound 跳转**，`navigateTo` 用于 login 页，避免死循环
4. **所有 UI 文案用中文**
5. **沿用现有 CSS 变量和全局类**，不引入新的颜色值
6. `requestOtp` 调用时需带 Bearer token（unbound JWT），`request()` 中传 `needAuth: true`
