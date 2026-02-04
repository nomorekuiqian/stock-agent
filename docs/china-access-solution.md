# MarketBrew 中国访问解决方案

> 最后更新: 2025-01-31

## 问题背景

MarketBrew (themarketbrew.com) 目前部署在 Vercel 和 Railway 上，中国大陆用户无法正常访问。

### 当前部署架构

| 服务 | 平台 | 区域 | 中国可访问性 |
|------|------|------|-------------|
| 前端 (Next.js) | Vercel | 全球 Edge | 被墙 |
| 后端 (FastAPI) | Railway | us-west (GCP) | 被墙 |
| 数据库 | Insforge | us-east | 未测试 |

### 核心问题：API 调用是客户端发起的

```
前端代码中使用 NEXT_PUBLIC_API_URL，这意味着 API 请求是从用户浏览器直接发起的：

用户浏览器
     |
     +---> Vercel (获取 HTML/JS)  <-- 需要能访问
     |
     +---> Railway API (获取数据) <-- 也需要能访问！
```

**误区澄清**：后端 API 不是被 Vercel 服务器调用的，而是被用户浏览器直接调用的。因此即使解决了 Vercel 的访问问题，如果 Railway 仍被墙，用户会看到页面能打开但数据加载失败。

---

## 架构分析：哪些是 Edge？

```
+---------------------------------------------------------------+
|                        用户浏览器                              |
+---------------+-------------------------+---------------------+
                |                         |
                v                         v
+---------------------------+   +-------------------------------+
|   Vercel (前端)            |   |   Railway (后端)               |
|   Edge Network            |   |   不是 Edge                    |
|   全球 CDN 分发静态资源     |   |   单一区域的 Python 服务器      |
|                           |   |   - AI Agent (Gemini/OpenAI)  |
|                           |   |   - 数据获取 (yfinance/FMP)    |
+---------------------------+   +--------------+----------------+
                                               |
                                               v
                                +-------------------------------+
                                |   Insforge (us-east)          |
                                |   Edge Functions (数据库层)   |
                                |   但只有后端调用它             |
                                +-------------------------------+
```

| 组件 | Edge? | 说明 |
|------|-------|------|
| Vercel 静态资源 | 是 | HTML/JS/CSS 全球边缘分发 |
| Railway FastAPI | 否 | 单一区域的传统服务器 |
| Insforge Edge Functions | 是 | 但只有后端调用，用户浏览器不直接访问 |

---

## 解决方案对比

### 方案 A：Vercel 官方中国优化 (仅解决前端)

Vercel 提供了针对中国优化的 DNS：

```
CNAME: cname-china.vercel-dns.com
或
A 记录: 76.223.126.88
```

**问题**：只解决前端，后端 Railway 仍然无法访问。

---

### 方案 B：第三方优选 CNAME 中转

使用 [enhanced-FaaS-in-China](https://github.com/xingpingcn/enhanced-FaaS-in-China) 项目：

**Vercel 配置**：
```
1. 先设置 CNAME -> cname.vercel-dns.com (等证书生成)
2. 改为 -> vercel-cname.xingpingcn.top
```

**Railway 配置**：
- 无官方支持
- Cloudflare 代理在中国很多地区被重置连接
- 第三方优选 IP 存活时间短，不稳定

| 优点 | 缺点 |
|------|------|
| 零成本 | Railway 中转不稳定 |
| 不需要迁移 | 需要持续监控 |
| 配置简单 | 部分地区仍无法访问 |

---

### 方案 C：全部迁移到 Zeabur 香港节点

[Zeabur](https://zeabur.com) 是台湾团队开发的 PaaS 平台，提供香港节点。

**特点**：
- 香港节点对中国大陆延迟 30-80ms
- 支持 Docker 部署（项目已有 Dockerfile）
- 原生支持 Next.js
- 支持中文界面

**预估费用**：
- Developer Plan: $5/月 + 用量
- 前端 + 后端总计约 $10-15/月

| 优点 | 缺点 |
|------|------|
| 稳定可靠 | 有月费成本 |
| 一劳永逸 | 需要迁移工作 |
| 统一平台管理 | 美国用户可能变慢 |

---

### 方案 D：混合部署 + DNS 智能分流

针对不同地区用户使用不同的服务器：

```
                    +-------------------+
                    |   Cloudflare      |
                    |   (DNS 智能分流)   |
                    +---------+---------+
                              |
         +--------------------+--------------------+
         |                    |                    |
         v                    v                    v
   +----------+         +----------+         +----------+
   | 美国用户  |         | 欧洲用户  |         | 中国用户  |
   +----+-----+         +----+-----+         +----+-----+
        |                    |                    |
        v                    v                    v
+---------------+    +---------------+    +---------------+
| Vercel+Railway|    | Vercel+Railway|    | Zeabur (香港)  |
| (保持现状)     |    | (保持现状)     |    | 前端+后端      |
+---------------+    +---------------+    +---------------+
        |                    |                    |
        +--------------------+--------------------+
                             |
                             v
                    +-------------------+
                    |   Insforge        |
                    |   (us-east)       |
                    +-------------------+
```

| 优点 | 缺点 |
|------|------|
| 各地区用户都有最优体验 | 架构复杂 |
| 灵活可扩展 | 需要维护两套部署 |
| 渐进式迁移 | 成本较高 |

---

### 方案 E：Vercel API Routes 代理

把后端 API 调用改成通过 Vercel 代理，利用 Vercel 的 Edge Network：

```typescript
// frontend/app/api/proxy/[...path]/route.ts
export async function GET(request: Request) {
  // Vercel Edge -> Railway，用户不直接访问 Railway
  const response = await fetch(`${RAILWAY_URL}${path}`);
  return response;
}
```

```
中国用户 -> Vercel Edge (优化后可访问) -> Railway -> Insforge
            ^
      用户只需访问 Vercel
      不需要直接访问 Railway
```

| 优点 | 缺点 |
|------|------|
| 只需解决 Vercel 访问问题 | 增加一跳延迟 |
| 不需要迁移后端 | Vercel 流量费用增加 |
| 代码改动小 | 需要改造前端代码 |

---

## 方案选择建议

| 用户群体 | 推荐方案 |
|----------|---------|
| 主要是中国用户 | 方案 C（全部迁移 Zeabur 香港） |
| 中美用户各半 | 方案 D（混合部署 + DNS 分流） |
| 快速验证，预算有限 | 方案 E（Vercel API 代理） |
| 追求零成本 | 方案 B（中转，但不稳定） |

---

## 详细方案对比表

| 维度 | 方案 B: 中转 | 方案 C: Zeabur | 方案 D: 混合 | 方案 E: 代理 |
|------|-------------|---------------|-------------|-------------|
| 前端解决方案 | Vercel 优化 CNAME | 香港节点 | 智能分流 | Vercel 优化 CNAME |
| 后端解决方案 | 不稳定中转 | 香港节点 | 智能分流 | Vercel 代理 |
| 稳定性 | 差 | 优 | 优 | 良 |
| 迁移工作量 | 低 | 中 | 高 | 低 |
| 月费用 | $0 | $10-15 | $15-25 | $0-5 |
| 长期维护 | 需要监控 | 一劳永逸 | 较复杂 | 简单 |
| 中国访问速度 | 不稳定 | 30-80ms | 30-80ms | 50-150ms |
| 美国访问速度 | 不变 | 可能变慢 | 不变 | 略增延迟 |

---

## Zeabur 迁移步骤 (方案 C)

如果选择迁移到 Zeabur：

```bash
1. 注册 Zeabur 账号 (zeabur.com)
2. 创建项目，选择香港 (HKG) 区域
3. 连接 GitHub 仓库
4. 导入 backend/ 目录 (自动识别 Dockerfile)
5. 导入 frontend/ 目录 (自动识别 Next.js)
6. 配置环境变量 (从 Railway/Vercel 复制)
7. 绑定自定义域名
8. 测试验证后切换 DNS
```

**环境变量需要迁移**：

后端:
- GOOGLE_API_KEY
- FMP_API_KEY
- OPENAI_API_KEY
- FRED_API_KEY
- RESEND_API_KEY
- CRON_SECRET
- FRONTEND_URL

前端:
- NEXT_PUBLIC_API_URL (改为 Zeabur 后端地址)
- NEXT_PUBLIC_INSFORGE_URL
- NEXT_PUBLIC_INSFORGE_ANON_KEY

---

## 参考资源

- [enhanced-FaaS-in-China](https://github.com/xingpingcn/enhanced-FaaS-in-China) - 优选 CNAME 项目
- [Cloudflare China Network](https://www.cloudflare.com/application-services/products/china-network/) - 企业版中国网络
- [Zeabur 定价](https://zeabur.com/pricing)
- [Zeabur vs Railway 对比](https://getdeploying.com/railway-vs-zeabur)
- [Vercel 中国访问 Cloudflare 中转](https://zhuanlan.zhihu.com/p/646818470)

---

## 待决定事项

- [ ] 确认目标用户群体分布（中国 vs 海外比例）
- [ ] 选择最终方案
- [ ] 如选择 Zeabur，规划迁移时间表
- [ ] 测试 Insforge 在中国的可访问性
