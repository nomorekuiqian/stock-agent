# Email Setup TODO

DNS 记录已添加，等待生效（通常几分钟到 4 小时）。以下是剩余步骤。

---

## 1. 创建 Private Email 邮箱

DNS 生效后：

1. 登录 Namecheap → **Domain List** → **themarketbrew.com** → **Private Email**
2. 点击 **CREATE MAILBOX**
3. 填写：
   - **Email**: `ke`（将创建 ke@themarketbrew.com）
   - **Password**: 设置一个强密码（记住它！）
   - **Display Name**: `Ke` 或你的名字
4. 保存

创建完成后，访问 [privateemail.com](https://privateemail.com) 用 `ke@themarketbrew.com` 和密码登录测试。

---

## 2. 设置邮件别名（可选）

如果你想用 `hello@themarketbrew.com` 等其他地址：

1. 登录 [privateemail.com](https://privateemail.com)
2. 右上角 Settings → **Mail** → **Aliases**
3. 添加别名：`hello`、`support` 等
4. 发到这些地址的邮件都会进入 `ke@` 的收件箱

---

## 3. 在 Gmail 中配置收发（推荐）

这样你可以在 Gmail 界面管理工作邮箱。

### 3.1 添加收件（POP3）

1. Gmail → 右上角 ⚙️ → **See all settings**
2. **Accounts and Import** 标签
3. **Check mail from other accounts** → **Add a mail account**
4. 输入 `ke@themarketbrew.com`
5. 选择 **Import emails from my other account (POP3)**
6. 填写：
   - Username: `ke@themarketbrew.com`
   - Password: 你的 Private Email 密码
   - POP Server: `mail.privateemail.com`
   - Port: `995`
   - ✅ Always use SSL
7. 点击 **Add Account**

### 3.2 添加发件（SMTP）

1. 继续上一步，选择 **Yes, I want to be able to send mail as...**
2. Name: `Ke`（或你想显示的名字）
3. SMTP Server: `mail.privateemail.com`
4. Port: `465`
5. Username: `ke@themarketbrew.com`
6. Password: 你的密码
7. ✅ Secured connection using SSL
8. Gmail 会发验证邮件，点击链接确认

---

## 4. 确认 Resend 域名配置

1. 登录 [Resend Dashboard → Domains](https://resend.com/domains)
2. 确认 `themarketbrew.com` 状态是 **Verified**
3. 如果没有验证，查看 Resend 要求的 DNS 记录并添加

---

## 5. 修复生产环境 Insforge 问题

**问题**：今日日报页面显示空白，因为 Insforge anon key 签名无效。

**解决**：在 Vercel Dashboard 设置环境变量：

| 变量名 | 值 |
|--------|-----|
| `NEXT_PUBLIC_INSFORGE_URL` | `https://9wmhxyi4.us-east.insforge.app` |
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY3NDd9.Ivb5TVSub_jt6dmyst7rjZWX1TrmfaCbgPM4k-NuHMs` |

设置后重新部署。

同时更新本地 `frontend/.env.local`：
```
NEXT_PUBLIC_INSFORGE_URL=https://9wmhxyi4.us-east.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY3NDd9.Ivb5TVSub_jt6dmyst7rjZWX1TrmfaCbgPM4k-NuHMs
```

---

## 6. 自定义邮件广播功能（待实现）

当你准备好给订阅者发送个人邮件时，可以让我实现一个 API 端点：

```
POST /api/email/custom-broadcast
{
  "subject": "来自 Ke 的一封信",
  "content": "邮件内容...",
  "from_name": "Ke",
  "from_email": "ke@themarketbrew.com",
  "preview": true  // 先预览
}
```

---

## 快速检查清单

- [ ] DNS 记录生效（等待 4 小时）
- [ ] 创建 Private Email 邮箱
- [ ] 测试登录 privateemail.com
- [ ] 配置 Gmail 收发
- [ ] 确认 Resend 域名已验证
- [ ] 更新 Vercel 环境变量
- [ ] 重新部署，验证今日日报页面正常

---

*创建时间: 2026-02-03*
