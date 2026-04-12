# stock-agent 微信小程序 PoC

用于验证 **微信小程序 web-view 承载 Next.js 登录态** 的最小可运行骨架。

## 目的

在一期 WebView-first 方案落地之前，先用这个 PoC 回答两个关键问题：

1. **第一方 cookie 存活性** — Next.js 已经把 `app_access_token` / `app_refresh_token` 存为 themarketbrew.com 域下的 httpOnly cookie。web-view 组件在真机上是否保留这份 cookie？刷新、返回、重新进入是否还能自动恢复登录态？
2. **wx.login code 获取** — 原生端的 `wx.login()` 能否稳定返回临时 code（后续后端用 AppID+AppSecret 调 jscode2session 换 openid/unionid 的入口）。

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss / sitemap.json
├── project.config.json   # AppID 用 REPLACE_WITH_YOUR_APPID 占位
└── pages/
    ├── index/            # 入口菜单
    ├── webview/          # 通用 web-view 容器，通过 ?path=/xxx 加载 Next.js 页面
    └── diagnose/         # wx.login 原生诊断页
```

## 运行前准备

1. **注册小程序 + 拿到 AppID**
   - 个人或企业主体到 https://mp.weixin.qq.com 注册「小程序」
   - 记下 AppID，替换 `project.config.json` 中的 `REPLACE_WITH_YOUR_APPID`

2. **配置业务域名**
   - 管理后台 → 开发管理 → 开发设置 → 服务器域名 → 「业务域名」添加 `https://themarketbrew.com`
   - 该列表用于 web-view 白名单。localhost / ngrok 域名无法配置，真机测试必须用正式域名
   - 开发者工具里勾选「不校验合法域名」可临时绕过，但仅限模拟器
   - web-view 还要求下载并在网站根目录放置一个校验文件（管理后台会给出具体文件名）

3. **安装微信开发者工具**
   - https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

## 本地测试步骤

1. 用开发者工具打开 `miniprogram/` 目录，登录微信账号
2. 顶部工具栏「详情 → 本地设置」勾选「不校验合法域名...」
3. 确保 `app.js` 里的 `webBaseUrl` 指向一个**已经部署好的 https 站点**（不能用 http://localhost，web-view 组件禁止 http）
   - 选项 A：用正式站点 `https://themarketbrew.com`
   - 选项 B：用 `ngrok http 3000` + `ngrok --host-header` 把本地 Next.js 暴露为 https
4. 点击左侧「编译」运行小程序

## PoC 测试脚本

按顺序执行，记录每一步结果：

### 1. wx.login 基线验证
1. 打开「原生 wx.login 诊断」
2. 点击「调用 wx.login()」
3. 预期：页面显示一段约 32 字符的 code，无 error
4. 记录：✅ 能拿到 code / ❌ 报错（记录 errMsg）

### 2. WebView 登录态 Cold start
1. 清除所有缓存（开发者工具 → 清缓存 → 全部清除）
2. 回到小程序首页 → 点「打开网页 /login」
3. 在 web-view 里完成一次邮箱密码登录（用测试账号 voya.technologies@gmail.com / 123456）
4. 观察登录后是否跳转到 /today 或 redirect 目标
5. 记录：✅ 能正常进入登录态 / ❌ 卡住

### 3. WebView 登录态 Warm start（最关键）
1. **不清缓存**，返回小程序首页
2. 点「打开受保护页 /for-you」
3. 预期：直接进入 /for-you 内容，不被重定向到 /login
4. 如果被打回 /login，说明 web-view 之间的 cookie jar 隔离或 httpOnly first-party cookie 没存活
5. 记录：✅ 仍登录 / ❌ 被踢回登录页

### 4. WebView 刷新存活
1. 在已登录的 /for-you 页面，右上角胶囊菜单 → 重新加载当前页（或 pull-to-refresh 若实现）
2. 预期：刷新后仍登录
3. 记录：✅ / ❌

### 5. 杀进程恢复
1. 彻底关闭小程序（杀后台进程）
2. 重新打开 → 直接进 /for-you
3. 预期：refresh token（7 天有效期）仍在 web-view 的 cookie jar 中 → `/api/auth/session` 用 refresh token 换出新 access token → 保持登录
4. 记录：✅ / ❌

### 6. 诊断页交叉验证
1. 打开「打开 WebView 诊断页」（对应 Next.js 的 `/webview-check`，由后续 PR 提供）
2. 页面会展示当前 document.cookie、登录状态、session API 响应
3. 记录每个字段的观察值

## 预期结论

| 场景 | 理想结果 | 如果失败说明 |
|------|----------|-------------|
| Cold 登录 | 成功 | Next.js 登录链路在 web-view 环境下断裂（JS/跨域问题） |
| Warm 进入受保护页 | 保持登录 | web-view 之间 cookie 不共享 → 需要 URL 传参注入 token 方案 |
| 刷新存活 | 保持登录 | 同上 |
| 杀进程恢复 | 保持登录 | refresh token 没有被 web-view 持久化 → 需要原生端保存 token 再注入 |

## 如果 WebView 失败的 Plan B

把登录凭证改为「原生端拿 + URL 传参注入 web-view」：

1. 原生 `wx.login()` → code → `POST /api/wechat/login` → 后端返回一个短 TTL 的 `webview_login_token`
2. `wx.navigateTo` 时把 token 拼到 URL：`webview?path=/for-you?bridge_token=xxx`
3. Next.js 在 webview 入口识别 `bridge_token`，调 `/api/auth/bridge-exchange` 换成第一方 cookie
4. 之后的页面跳转就能保持登录态（至少一个 web-view 实例内）

## 注意事项

- web-view 组件**只能加载业务域名 HTTPS 页面**，localhost 和 http 都不行
- 每个 web-view 实例是独立的进程，路由 `navigateTo` 到新 webview 页不保证 cookie 共享（具体以真机实测为准）
- 不要在 PoC 阶段硬编码 AppSecret —— 小程序端 **永远不应持有** AppSecret，它只能在后端使用
