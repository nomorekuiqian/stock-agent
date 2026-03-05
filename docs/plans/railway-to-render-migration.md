# Railway to Render Migration Plan

> Status: Planning
> Related: backend/app/core/.context.md
> Vision: 降低托管成本，从 ~$14/月降到 $7/月固定价格

## 目标

将后端从 Railway ($14/月按量) 迁移到 Render ($7/月固定)，零停机切换，保持所有 cron 任务和 API 功能正常。

## 现状

### 当前架构
- **托管**: Railway Hobby Plan, 按量计费 ~$14/月
- **部署方式**: Dockerfile (`python:3.12-slim` + `uvicorn`)
- **配置**: `backend/railway.json` (builder: DOCKERFILE, health check: `/`, restart: ON_FAILURE x3)
- **域名**: `stock-agent-production.up.railway.app`
- **GitHub Actions**: 6 个 workflow 通过 `secrets.BACKEND_URL` + `secrets.CRON_SECRET` 调用后端

### 需要迁移的内容
1. 后端服务 (FastAPI + Dockerfile)
2. 12 个环境变量
3. GitHub Actions 的 `BACKEND_URL` secret
4. 前端 CORS 配置 (`FRONTEND_URL`)

## 设计

### 迁移策略: Blue-Green 切换

```
阶段 1: Render 部署并验证 (Railway 继续运行)
阶段 2: GitHub Actions 指向 Render
阶段 3: 监控 1-2 天确认稳定
阶段 4: 关闭 Railway
```

### Render 服务配置

| 配置项 | 值 |
|--------|-----|
| Service Type | Web Service |
| Plan | Starter ($7/月) |
| Region | Oregon (US West) |
| Runtime | Docker |
| Health Check | `/health` |
| Auto-Deploy | Yes (main branch) |

### render.yaml (Blueprint)

```yaml
services:
  - type: web
    name: stock-agent
    runtime: docker
    dockerfilePath: ./backend/Dockerfile
    dockerContext: ./backend
    plan: starter
    region: oregon
    healthCheckPath: /health
    envVars:
      - key: ENVIRONMENT
        value: production
      - key: PORT
        value: "8000"
      - key: FRONTEND_URL
        value: https://themarketbrew.com
      - key: GOOGLE_API_KEY
        sync: false  # 手动设置
      - key: FMP_API_KEY
        sync: false
      - key: FRED_API_KEY
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: STRIPE_SECRET_KEY
        sync: false
      - key: STRIPE_WEBHOOK_SECRET
        sync: false
      - key: STRIPE_PRO_PRICE_ID
        sync: false
      - key: RESEND_API_KEY
        sync: false
      - key: CRON_SECRET
        sync: false
      - key: INSFORGE_ANON_KEY
        sync: false
      - key: INSFORGE_BASE_URL
        sync: false
```

### 不需要改动的部分
- **Dockerfile**: 完全兼容，Render 原生支持 Docker
- **后端代码**: 零改动，`PORT` 环境变量 Render 也会注入
- **前端代码**: 不受影响，只改 GitHub Actions secret
- **Stripe Webhook**: 需要在 Stripe Dashboard 更新 endpoint URL

## 实施步骤

### 阶段 1: Render 部署 (~15 分钟)

1. [ ] 在 Render Dashboard 创建 Web Service，连接 GitHub repo
2. [ ] 配置 Docker 构建路径 (`backend/Dockerfile`, context: `backend/`)
3. [ ] 设置所有环境变量 (从 Railway 复制)
4. [ ] 等待首次部署完成
5. [ ] 验证 health check: `curl https://<render-url>/health`
6. [ ] 验证 API 响应: `curl https://<render-url>/api/health`

### 阶段 2: 功能验证 (~10 分钟)

7. [ ] 手动触发一个 cron 端点测试 (如 macro-cache refresh tier 1)
8. [ ] 检查日志确认无报错
9. [ ] 用测试账号登录前端，确认后端 API 可用

### 阶段 3: 流量切换 (~5 分钟)

10. [ ] 更新 GitHub Actions secret `BACKEND_URL` 指向 Render URL
11. [ ] 更新 Stripe Webhook endpoint URL (如有)
12. [ ] 确认下一次 cron 任务成功执行

### 阶段 4: 监控期 (1-2 天)

13. [ ] 监控 Render logs 确认所有 cron 任务正常
14. [ ] 确认日报/早报邮件正常发送
15. [ ] 确认用户可正常登录和使用

### 阶段 5: 清理

16. [ ] 关闭 Railway 服务 (先暂停，不删除)
17. [ ] 1 周后确认无问题，删除 Railway 项目
18. [ ] 更新 CLAUDE.md 中的后端域名说明
19. [ ] 安装 Render MCP 到 Claude Code 配置
20. [ ] (可选) 配置 Render CLI: `brew install render-oss/render/render`

## 成本对比

| 项目 | Railway (现在) | Render (迁移后) |
|------|---------------|-----------------|
| 月费 | ~$14 (浮动) | $7 (固定) |
| 年费 | ~$168 | $84 |
| 年省 | - | **$84 (50%)** |
| 账单风险 | 有 (按量) | 无 (固定) |

## 风险与回滚

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| Render 构建失败 | 低 | Dockerfile 已验证，直接复用 |
| 冷启动慢 | 低 | Starter plan 不休眠 |
| Stripe Webhook 中断 | 中 | 切换前先在 Stripe 添加新 endpoint，保留旧的 |
| Cron 任务遗漏 | 低 | Blue-Green 策略，Railway 保留到确认 |

**回滚方案**: Railway 在监控期内保持运行，切换 `BACKEND_URL` 回 Railway 即可在 1 分钟内回滚。

## 待定问题

1. Render Starter plan 的 512MB RAM 是否足够？(当前 Railway 用量需确认，预计够用)
2. Stripe Webhook 是否需要同时配两个 endpoint 做过渡？
