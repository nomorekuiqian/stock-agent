# 服务降级与 staging 停机记录

执行日期：2026-10-13，Asia/Taipei；生产健康检查时间 20:29。授权范围：Vercel Speed Insights Plus 降回基础档、Railway Pro 降为 Hobby、暂停 staging；其他服务不动。

| 项目 | 结果 | 生效与费用说明 |
|---|---|---|
| Vercel Speed Insights Plus | 已有降级安排，本次核实后未重复修改 | API 显示 9 月 29 日已取消续订，2026-10-14 15:00（台北时间）结束 Plus；界面显示 Ends Today，菜单仅提供 Upgrade to Speed Insights Plus |
| Railway | 当前套餐已是 Hobby | 页面明确显示 You're on the Hobby Plan；最低消费 $5/月，超额资源另外计费。本期最终结算与抵扣以账单为准 |
| Railway staging / stock-agent | 已停止，运行中的部署数为 0 | 已移除当前运行部署，并禁用 staging 的 GitHub 自动部署；环境、仓库连接、变量、域名及服务配置保留 |

## 必要的前置设置

Railway 首次降级被 Trusted Domain 配置阻挡。工作区仅有 1 名 Admin；现有自动加入规则验证状态为 Failed，域名字段误填为完整邮箱。移除这条无效规则后，页面确认 Hobby 已生效；没有移除成员，没有修改域名解析、生产服务域名或其他认证设置。

Trusted Domain 用于让匹配邮箱域名的新成员自动加入工作区，见 [Railway 官方说明](https://docs.railway.com/projects/workspaces#trusted-domains)。

## 验证

- Railway production 仍运行原部署 `1bfdd20b-6471-44b4-ad67-d47ae9d0936c`，状态 SUCCESS，没有重启或重新部署。
- 20:29 读取生产 `/health` 和 `/ready`，均为 HTTP 200；返回分别为 ok 与 ready。`/ready` 是应用自身的轻量检查，不代表完整业务回归。
- staging 原活动部署 `00f23062-ca99-45ff-9646-1efc0d22a143` 显示 REMOVED；API 活动部署为空，页面显示 Service is offline；staging `/health` 返回 HTTP 404。
- 页面出现的 FAILED 是 9 月 5 日已有的旧构建记录，不是本次新增部署失败。
- staging 设置显示 Auto deploy is disabled；原仓库 `nomorekuiqian/stock-agent`、分支 `master`、根目录 `/backend` 保留。
- Vercel 团队基础套餐仍为 Pro。两个原本无活动部署的 OKX MCP 服务未修改，其他供应商未操作。
- 本次未改应用代码，未提交或推送 Git，未发送邮件。

## 后续恢复 staging

需要测试时，可在 staging 服务中重新部署已知可用版本，或按原根目录及配置通过 CLI 部署。若恢复持续自动部署，再在 staging 的 Source 设置中点击 Enable。不要对 production 执行这些恢复操作。

## 证据

- [脱敏状态记录](service-cost-actions-2026-10-13/evidence.json)
- [Railway Hobby](service-cost-actions-2026-10-13/railway-hobby.jpg)
- [staging 已停止](service-cost-actions-2026-10-13/railway-staging-offline.jpg)
- [staging 自动部署已关闭](service-cost-actions-2026-10-13/railway-staging-auto-deploy-disabled.jpg)
- [Vercel Plus 已安排结束](service-cost-actions-2026-10-13/vercel-speed-insights-ending.jpg)
