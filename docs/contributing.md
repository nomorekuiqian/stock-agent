# 协作指南 (Contributing)

这份文档定义"非项目主理人"参与 TheMarketBrew 代码的工作方式。目标：朋友能快速上手、不互相踩脚、不污染生产、不绕过质量门禁。

主理人：**@kedeng**（GitHub: `nomorekuiqian`，邮箱 `kedengpan@gmail.com`，下文简称"主理人"）。

适用对象：任何主理人之外的贡献者。AI 工具（Claude Code / Codex / Cursor）协助产生的代码也算 —— 提交人对 AI 产出负责。

---

## 目录

- [C1. Onboarding（从 0 到第一个 PR）](#c1-onboarding从-0-到第一个-pr)
- [C3. AI-Native Git 工作流](#c3-ai-native-git-工作流)
- [C4. 质量门禁](#c4-质量门禁)
- [C5. Code Review 流程](#c5-code-review-流程)
- [C7. 环境变量与密钥管理](#c7-环境变量与密钥管理)
- [测试账号 / Admin / 终身付费](#测试账号--admin--终身付费)
- [服务清单](#服务清单)
- [数据安全与回滚](#数据安全与回滚)
- [项目自带工具栈](#项目自带工具栈)
- [主理人落地清单](#主理人落地清单)

---

## C1. Onboarding（从 0 到第一个 PR）

### Step 0：先读什么（30 分钟）

按顺序读：
1. `README.md` — 项目在做什么
2. `CLAUDE.md` — 全局工程规则（**最重要**）
3. `AGENTS.md` — AI agent 协作规则（如果你用 Claude Code / Codex）
4. `docs/constraints/engineering-rules.md` — Git / CI / 测试 / 错误处理规范
5. `docs/constraints/reliability.md` — 可靠性设计
6. 你要动的那个模块的 `.context.md`

读不完不要急着写代码。先在群里说"读完了，准备做 X"，主理人会确认范围。

### Step 1：环境要求（CLI 清单）

主理人本地装了下表全部工具，给朋友的推荐配置是**核心 + 部署 + 项目服务**三组必装，其余可选。所有工具都建议用 Homebrew 装。

**核心（必装）**

| 工具 | 用途 | 主理人版本 | 安装 |
|------|------|-----------|------|
| Node.js | 前端 / lint-staged | v22.22.0 | `brew install node` |
| Python 3.12 | 后端 | 3.12.3 | `brew install python@3.12` |
| uv | Python 包管理（比 pip 快 10x） | 0.8.11 | `brew install uv` |
| git | 版本控制 | 2.50.1 | macOS 自带 |
| gh | GitHub CLI（创建 PR / 评论） | 2.92.0 | `brew install gh` |
| claude | Claude Code CLI（强烈推荐） | 2.1.133 | https://claude.com/claude-code |
| codex | OpenAI Codex CLI（用于 /codex review） | 0.125.0 | `npm i -g @openai/codex` |
| ctx7 | 在线文档拉取（个人规则里强制用） | 0.4.1 | `npm i -g ctx7` |

**部署（必装）**

| 工具 | 用途 | 主理人版本 | 安装 |
|------|------|-----------|------|
| vercel | 前端日志 / preview 排查 | 53.3.1 | `npm i -g vercel@latest` |
| railway | 后端日志 / env 查询 | 4.30.5 | `brew install railway` |

**Insforge CLI（必装，但权限受限）**

| 工具 | 用途 | 安装 |
|------|------|------|
| insforge | Insforge 数据库 / edge function / bucket 操作 | 按官方文档（`npm i -g @insforge/cli` 或同类，主理人会更新此处） |

**朋友可以跑的 Insforge 命令**（只读 / debug 类）：

```bash
insforge auth login            # 用你自己的 Insforge 账号登录
insforge functions list         # 列出所有 edge functions
insforge functions logs <name>  # 看某个 edge function 的运行日志
insforge db schema              # 拉数据库 schema 看结构
insforge db sql --readonly "SELECT ..."  # 跑只读 SQL（如果 CLI 支持 readonly 模式）
```

**朋友禁止跑的 Insforge 命令**（写 / 部署类）：

```bash
# 部署 / 修改 edge function —— 必须主理人执行
insforge functions deploy <name>
insforge functions create <name>
insforge functions update <name>
insforge functions delete <name>

# DDL / 写 SQL —— 必须主理人执行
insforge db sql "INSERT ... / UPDATE ... / DELETE ... / CREATE ... / ALTER ... / DROP ..."
insforge db migrate

# Bucket / RLS 管理 —— 必须主理人执行
insforge buckets create / delete
insforge rls policy ...
```

**兜底机制**：朋友本地**没有** `INSFORGE_SERVICE_KEY`（L3，主理人独占），所有需要 service key 的特权操作都会直接报权限错。这是物理保护，不是道德约束 —— 即使朋友手滑跑了禁止的命令，Insforge 也会拒绝。

如果朋友需要做"禁止类"操作（比如部署 edge function 改动），流程是：
1. 在 PR 里把改动 + 部署需求写清楚
2. 主理人合并后用主理人本地的 CLI（带 service key）部署

**不要装的**（混淆项目栈）：
- pyenv / nvm（我们用系统 python / node）
- poetry（我们用 uv）
- pnpm / yarn / bun（前端用 npm）
- docker（项目没用容器）
- stripe CLI / resend CLI / supabase CLI / gcloud / jq / ripgrep（项目不需要）

### Step 2：拿到 Repo

```bash
# 主理人会先邀你做 GitHub collaborator，接受邀请后：
gh repo clone nomorekuiqian/stock-agent
cd stock-agent

# 根目录 npm install 会自动配 husky pre-commit hook
npm install
```

### Step 3：装项目依赖

```bash
# 后端（用 uv，比 pip 快非常多）
cd backend
uv venv                                 # 创建 .venv/
source .venv/bin/activate
uv pip install -r requirements.txt

# 前端
cd ../frontend
npm install
```

### Step 4：配 `.env`

详见 [C7](#c7-环境变量与密钥管理)。简版：

```bash
cp backend/.env.example backend/.env             # 主理人需先创建 .env.example
cp frontend/.env.local.example frontend/.env.local
```

按 C7 表格填 key。**大部分 key 你自己注册一个免费账号就有**，少数（带"L2"标记的）找主理人要。

### Step 5：注册自己的测试账号

> **不要用主理人的测试账号。** 早期文档里出现的 `voya.technologies@gmail.com` 是主理人自己的账号，不要用。

朋友自己的流程：
1. 打开 https://themarketbrew.com/login
2. 用**你自己的邮箱**注册（推荐用 Gmail，方便收测试邮件）
3. 把邮箱告诉主理人，主理人会做两件事：
   - 把你的邮箱加进 `ADMIN_EMAILS`，你就能访问 `/admin` 后台
   - 在 Insforge 把你的 `is_lifetime=true`，你就能解锁所有付费功能不用过 Stripe
4. 退出登录、重新登录，应该能看到 `/admin` 入口和 Max 等级权限

这样你自己的账号同时是 admin + 终身付费用户，不影响主理人和真用户。

### Step 6：启动 + 冒烟

```bash
# Terminal 1：后端
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload

# Terminal 2：前端
cd frontend && npm run dev

# Terminal 3：验证
curl http://localhost:8000/health           # 期望 {"status":"ok",...}
curl http://localhost:8000/ready            # 期望 {"status":"ready",...}
open http://localhost:3000                  # 期望首页可打开
```

用 Step 5 注册的自己账号登录。

如果 `/ready` 返回 `degraded`，看 `checks` 字段哪个 service 是 `error` / `missing` —— 通常是 `.env` 没配齐对应 key（参见 C7 哪些 key 必填）。

### Step 7：跑测试

```bash
# 在 Claude Code 里直接：
/test

# 或手动：
cd frontend && npm run lint && npm run test
cd ../backend && source .venv/bin/activate && pytest tests/ -v -x
```

**全跑通才算 onboarding 完成。**

### Step 8：第一个 PR — 破冰任务

主理人会给你一个 ~30 分钟的小任务（typo / 文案 / 补一个测试），用来跑通完整 PR 流程。先把流程跑通，再做正经任务。

下一节告诉你**怎么让 AI 来完成整个 PR 流程**。

---

## C3. AI-Native Git 工作流

这个项目设计成**以 AI 为主操作者**的协作模式。朋友不需要记 git 命令、不需要手写 commit message、不需要手敲 PR 描述 —— Claude Code（或 Codex）来做。朋友的工作是**审批 AI 的产出**。

### 核心原则

1. **AI 操作 git，朋友确认每一步写操作**（不要 yolo，看清楚再 enter）
2. **每个 commit / push / PR 都是 AI 起草 + 朋友确认**
3. **CLAUDE.md 已经声明 "禁止自动 Git 操作"，这条规则继续生效** —— AI 不会自作主张 commit/push，必须朋友说了才做

### 完整 Flow（推荐用 Claude Code）

下面是一个典型 feature 从想法到合并的全过程。所有命令都在 Claude Code 对话里发送，朋友不用切到终端。

**Step A：先写 plan**

```
> 帮我用 /plan 写一个 plan，feature 是「screener 加价格-成交量过滤器」
```

Claude Code 调用 `/plan` skill，把设计文档写到 `docs/plans/active/screener-price-volume-filter.md`。朋友 review、调整，然后说 "ok 开始做"。

**Step B：创建分支**

```
> 帮我从 master 起一个新分支 feat/alice-screener-filter，开始做这个 plan
```

Claude Code 会执行：
```bash
git checkout master
git pull origin master
git checkout -b feat/alice-screener-filter
```

每个 git 命令朋友会看到一个确认提示。一路 enter 即可。

**Step C：写代码**

朋友既可以让 Claude 直接改代码（"帮我把 filter 加到 screener service 里"），也可以自己改。Claude Code 的 PostToolUse hook 会在保存 `.ts/.tsx` 时自动跑 ESLint。

**Step D：测 + 补测试 + 自审**

```
> /test backend         # 跑后端测试
> /cover-changes        # 让 AI 看 diff 补单测
> /review-changes       # 多 agent 并行 review 当前 diff
```

`/review-changes` 跑完会输出"建议改的点"。朋友可以让 Claude 修，也可以自己修。

**Step E：拿独立第二意见**

```
> /codex review         # 切到 Codex 跨 AI 独立审查
```

Codex 不知道 Claude 在你这边干了什么，会用全新视角看代码。它的反馈比"自己 AI review 自己"更可信。

**Step F：分组 commit**

```
> /commit-diffs         # AI 按逻辑把 diff 拆成多个 commit
```

`/commit-diffs` skill 会：
1. 看当前所有改动
2. 按"一个 commit 改一件事"切分
3. 给每个 commit 生成符合规范的 message（`feat(screener): xxx`）
4. **逐个让朋友确认**才执行

朋友看到不满意可以让 AI 重切：
```
> 把第 2、3 个 commit 合并，message 改成 "..."
```

**Step G：push**

```
> 帮我 push 这个分支到远端
```

Claude 执行 `git push -u origin feat/alice-screener-filter`，朋友确认。

**Step H：创建 PR**

```
> 用 gh pr create 帮我创建 PR，base 是 master，body 按 C5 模板填
```

Claude 用 `gh pr create` 创建 PR。Claude 会自动从 plan 和 commit 信息生成符合 C5 模板的 PR 描述。朋友 review PR 描述、调整、确认。

或者直接用 `/ship` skill（功能更全）：
```
> /ship
```

`/ship` 会做：跑测试 → review diff → bump VERSION（如果需要） → 更新 CHANGELOG → commit → push → 创建 PR。

**Step I：响应 review**

reviewer 给 comment 后：
```
> 把 PR 上 reviewer 的 comment 拉下来，一条条解决
```

Claude 用 `gh pr view --comments` / `gh api repos/.../pulls/X/comments` 拉评论，然后逐条改代码 + 回复。朋友确认每次改动。

**Step J：merge 后清理**

PR 合并后：
```
> 帮我清理本地分支，切回 master 拉最新
```

Claude 执行：
```bash
git checkout master
git pull
git branch -d feat/alice-screener-filter
git push origin --delete feat/alice-screener-filter
```

### 用 Codex 时的差异

Codex 工作模式类似，主要差异：
- 用 `codex` CLI 启动会话
- Slash command 集合可能不一样（看 Codex 的 skill 系统）
- 推荐让 Codex 做 **review-only**：朋友主操作用 Claude，PR 提交前切到 Codex 跑 `codex review`
- 不要同时让 Claude + Codex 改同一份代码（会互相覆盖）

### Fallback：手敲 Git 命令

万一 AI 抽风或不在身边，下面这套命令保证有效：

```bash
# 从 master 起分支
git checkout master && git pull
git checkout -b feat/<your-handle>-<scope>

# 改代码、保存

# 测试
cd frontend && npm run lint && npm run test
cd ../backend && source .venv/bin/activate && pytest tests/ -v

# 提交（pre-commit hook 会自动 lint）
git add <files>
git commit -m "feat(scope): description"

# 推到远端
git push -u origin feat/<your-handle>-<scope>

# 创建 PR
gh pr create --base master --title "..." --body "..."
```

### 分支命名（无论手敲还是 AI 起）

| 类型 | 格式 | 示例 |
|------|------|------|
| 新功能 | `feat/<author>-<scope>` | `feat/alice-screener-filter` |
| Bug 修复 | `fix/<author>-<scope>` | `fix/bob-stripe-webhook` |
| 重构 | `refactor/<author>-<scope>` | `refactor/alice-brew-agent` |
| 文档 | `docs/<author>-<scope>` | `docs/alice-onboarding` |

### Commit Message 格式

`type(scope): description`。常用 type：`feat` / `fix` / `style` / `refactor` / `test` / `chore` / `docs`。`/commit-diffs` 会自动按这个格式生成。

### Branch Protection

`master` 受保护：
- 任何人禁止 force push
- 非主理人禁止直接 push
- 合并需 1 个 approval + CI 通过

### 在 Vercel 上测分支

push 任何分支后 1-2 分钟，Vercel 自动构建一个独立 preview：

1. 打开 PR 页面，找 Vercel bot 的评论
2. 点 "Visit Preview"，拿到形如 `https://stock-agent-git-feat-alice-xxx.vercel.app`
3. 在浏览器测

**Preview 默认连什么后端**：连**生产** Railway 后端 `stock-agent-production.up.railway.app`。这意味着：
- preview 里登录、看页面、看日报 —— 走的都是**生产数据**
- **不要在 preview 上做破坏性操作**（删数据、改设置、给真用户发邮件）
- preview 适合测纯前端 UI 改动
- 如果改了**前端调用后端**的接口（新增字段等），preview 后端是旧版本，可能不兼容 —— 这种 PR 必须本地起后端测，或先 merge 后端改动

**Preview env vars**：Vercel Dashboard → Project Settings → Environment Variables 里按环境分 `production` / `preview` / `development`。需要新加 env var 时主理人先在 Vercel 加，朋友再 push（否则构建失败）。

### PR 大小

一个 PR 改一件事，目标 < 500 行 diff。改 5 件不相关的事 → 5 个 PR。

---

## C4. 质量门禁

### 三道闸

**闸 1：本地 pre-commit hook**

`git commit` 自动触发 husky + lint-staged（见根目录 `package.json`）：
- 前端 `.ts/.tsx`：ESLint --fix + `tsc --noEmit`
- 后端 `.py`：Python AST 语法检查

**不允许 `git commit --no-verify` 跳过 pre-commit。** Hook 报错就修代码，或让 AI 修。

**闸 2：本地完整测试**

push 前在 Claude Code 里跑 `/test all`，覆盖 lint + unit + e2e + build。

**闸 3：GitHub Actions CI**

每个 push / PR 自动跑 `.github/workflows/ci.yml`：
- 前端：npm ci → ESLint → tsc → Vitest → next build
- 后端：pip install → import check → unit tests → E2E tests → startup check

**CI 失败 = 不能合并**（任何人，包括主理人）。

### 测试要求

新代码必配测试。原则（详见 `docs/constraints/engineering-rules.md`）：

1. **测真实逻辑，不测 mock 本身**
2. **验证传参，不只验证"被调用了"**
3. **每个测试必须能捕获真实 bug**

**bug 修复必须先写一个能复现 bug 的测试**，再修代码。

### 不许做的事

- `pytest.skip` / `it.skip` 别人的测试
- 改 `.env.example` / `core/config.py` 的默认值（除非 PR 主题就是改它且主理人 approve）
- 改死代码目录 `backend/app/services/` 或 `backend/app/models/`
- disable CI（注释 workflow / 删 job）
- 代码里写 emoji
- 用 `print()`，必须 `get_logger(__name__)`

---

## C5. Code Review 流程

### Flow

```
作者                            Reviewer
  |                                 |
  | 1. /review-changes（自审）       |
  | 2. /codex review（独立第二意见） |
  | 3. push + 创建 PR                |
  | 4. PR 描述按模板填               |
  | 5. request reviewer  --------->  |
  |                                  | 6. 跑 /codex review（再独立 review）
  |                                  | 7. 人工 review（业务/设计/取舍）
  |                                  | 8. 留 comment 或 approve
  | 9. 改完 push 新 commit            |
  | 10. resolve 每条 comment          |
  |                                  | 11. re-approve
  | 12. squash merge                  |
```

### PR 描述模板

```markdown
## 改了什么
一句话说明。

## 为什么
关联 issue / plan / 用户反馈。

## 怎么测的
- [ ] 本地 pytest 通过
- [ ] 本地 vitest 通过
- [ ] 本地手动验证：<具体步骤>
- [ ] Vercel preview 验证：<链接>
- [ ] 跑了 /review-changes
- [ ] 跑了 /codex review

## 风险
影响哪些用户 / 功能。如果回滚，怎么回滚。

## 截图（前端改动必填）
before / after
```

### Reviewer 责任

- **48 小时 SLA**：被 request 后 48 小时内首次响应
- **不止读 diff**：必要时本地 checkout 跑，或打开 Vercel preview 实测
- **focus 在不可逆的事**：业务逻辑、安全、数据正确性
- **签字即背书**：你 approve 的 PR 出问题，你一起 debug

### 主理人豁免

主理人可以在 master 直接 commit 小修复 / 自己 PR 自己 approve / 紧急 hotfix。**不能**豁免：CI 失败仍合并 / 跳过 pre-commit / 改 `.env` 不通知。

---

## C7. 环境变量与密钥管理

### 设计原则

1. **能让朋友自己注册的 key，朋友自己注册** —— 退出时主理人不用 revoke
2. **必须共享的 key，用一次性链接（onetimesecret.com / password.link）传输** —— 不走 git / IM / 邮件
3. **生产专用 key，永不外发**

### 总表

下面把项目里所有 env var 全部列出来，每一个标明：**谁去拿、必填吗、空着会发生什么**。

#### 后端 `backend/.env`

**L1 — 朋友自己注册**

| Env Var | 注册地址 | 免费额度 | 必填？ | 不填的后果 |
|---------|----------|----------|--------|------------|
| `GOOGLE_API_KEY` | https://aistudio.google.com/apikey | 有免费 Gemini quota | 跑 AI 功能必填 | 日报 / 个股分析 / brew 都不能本地跑 |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | 按用量付费，建议存 $5 | 可选 | OpenAI 备用通道不可用，但 Gemini 还在 |
| `FMP_API_KEY` | https://site.financialmodelingprep.com/developer/docs | 250 req/day | 跑股票/财经数据必填 | 个股价格、treasury rates 拿不到 |
| `FRED_API_KEY` | https://fred.stlouisfed.org/docs/api/api_key.html | 完全免费 | 跑宏观数据必填 | macro 流动性指标拿不到 |
| `RESEND_API_KEY` | https://resend.com/api-keys | 100/day, 3000/月 | 跑邮件功能必填 | 本地不能测发邮件 |
| `STRIPE_SECRET_KEY` | https://dashboard.stripe.com/test/apikeys | test mode 永久免费 | 跑支付功能必填，用 `sk_test_*` | 订阅页面跑不通 |

**L2 — `.env.example` 里已有默认值，直接用**

| Env Var | 说明 |
|---------|------|
| `INSFORGE_BASE_URL` | Insforge 实例 URL（公开值，已在 example 里） |
| `INSFORGE_ANON_KEY` | Insforge anon JWT（前端 bundle 公开值，已在 example 里） |
| `NEXT_PUBLIC_INSFORGE_URL` / `NEXT_PUBLIC_INSFORGE_ANON_KEY` | 同上（前端） |

**L2.1 — 找主理人要（仅特定功能需要）**

| Env Var | 说明 | 何时需要 |
|---------|------|----------|
| `WECHAT_APP_ID` | 微信小程序 AppID | 仅做微信功能 |
| `INVITE_CODES` | 共享开发邀请码（逗号分隔） | 仅走注册测试流程 |

**L3 — 永不外发（主理人独占）**

| Env Var | 用途 |
|---------|------|
| `INSFORGE_SERVICE_KEY` | Insforge 超管 key，能绕过所有 RLS |
| `CRON_SECRET` | 定时任务身份令牌 |
| `EDGE_FUNCTION_SECRET` | Edge function 身份令牌 |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook 签名密钥（live） |
| `WECHAT_APP_SECRET` | 微信小程序 backend secret |
| `WECHAT_JWT_SECRET` | 微信 JWT 签名 |
| `RESEND_SEGMENT_MORNING` / `_EVENING` / `_WEEKLY` | 主理人 Resend 账号的 segment id（朋友用自己 Resend 不需要这些） |
| `ADMIN_EMAILS` | Admin 邮箱白名单（朋友本地无所谓，反正只影响 `/admin` 路由） |
| 任何 Stripe live key（`sk_live_*`） | 生产支付 |

**配置类（非密钥，朋友本地随便填）**

| Env Var | 本地推荐值 |
|---------|------------|
| `ENVIRONMENT` | `development` |
| `FRONTEND_URL` | `http://localhost:3000` |
| `EMAIL_PRO_GATE` | `false` |
| `STRIPE_PRO_PRICE_ID` / `STRIPE_MAX_PRICE_ID` | 朋友自己在 Stripe test mode 创建两个测试产品，把 price id 填进去；或找主理人要主理人 test 账号的 price id（L2） |

#### 前端 `frontend/.env.local`

| Env Var | 谁去拿 | 推荐值 |
|---------|--------|--------|
| `NEXT_PUBLIC_API_URL` | 朋友自己填 | `http://localhost:8000/api` |
| `NEXT_PUBLIC_INSFORGE_URL` | L2 找主理人要 | 同 `INSFORGE_BASE_URL` |
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` | L2 找主理人要 | 同 `INSFORGE_ANON_KEY` |

### 拿 key 流程

第一次：
1. 主理人提供 `backend/.env.example` 和 `frontend/.env.local.example`（**主理人 TODO**）
2. 朋友 `cp .env.example .env`
3. 按 L1 表逐个注册账号、拿 key、填 `.env`
4. 列出 L2 的需要项，私信主理人："我需要 INSFORGE_ANON_KEY、INSFORGE_BASE_URL"
5. 主理人去 https://onetimesecret.com（或 https://password.link）把 key 粘进去，生成一次性链接，私聊发给朋友
6. 朋友打开链接、复制 key、关闭页面（链接读一次就销毁）

朋友退出时：
- 主理人 revoke GitHub collaborator
- 主理人 revoke Vercel / Railway / Insforge viewer 权限（如果开过）
- 主理人把朋友邮箱从 `ADMIN_EMAILS` 移除
- 主理人在 Insforge 把朋友账号的 `is_lifetime` 设回 false
- L1 key 是朋友自己的账号，主理人不用管 —— **这是这套设计最大的好处**
- L2 key 是半公开值，朋友带走也没事（不影响安全）
- L3 key 朋友从来没拿过，无需 rotate

### 安全网（已实现，不要绕过）

- `ENVIRONMENT != "production"` 时，所有 Resend broadcast 自动路由到测试 segment
- `broadcast_personal_digests` 自动过滤只保留主理人测试邮箱
- CI 用 fake key 跑（`ENVIRONMENT=test`），不调真实 API

**不要修改这些逻辑**。如果你的需求要改广播路由，先开 issue 讨论。

### 不许做的事

- 把任何 key 写进代码、commit 进 git、贴进 PR / issue / 截图
- 把 `.env` 加进 git（`.gitignore` 已覆盖，仍要警惕）
- 本地把 `ENVIRONMENT` 改成 `production`
- 本地手动跑 cron workflow / 调真实 broadcast 接口

---

## 测试账号 / Admin / 终身付费

不要用主理人的账号。每个贡献者都要自己注册一个**真账号**，主理人会给你加 admin + lifetime，相当于一个"内部超级账号"。

### 1. 注册自己的账号

打开 https://themarketbrew.com/login → 用你自己的 Gmail / 其他邮箱注册（推荐 Gmail，方便收测试邮件，也容易在 Insforge 后台找）。

注册完把邮箱告诉主理人。

### 2. 主理人给你 Admin 权限

机制：环境变量 `ADMIN_EMAILS`（逗号分隔的邮箱列表，默认只有 `kedengpan@gmail.com`）。

主理人要做的：
1. 打开 Railway → stock-agent service → Variables
2. 找到 `ADMIN_EMAILS`，追加你的邮箱（如 `kedengpan@gmail.com,alice@gmail.com`）
3. Save，Railway 自动重启后端

你刷新页面就能看到 `/admin` 入口。

### 3. 主理人给你终身付费权限

机制：Insforge 的 `subscriptions` 表里有 `is_lifetime: boolean`。设为 true 后，用户跳过 Stripe，直接拥有 Max 等级所有权限。

主理人要做的（任选其一）：

**方式 A：调内部接口（推荐，未来会有 admin UI）**
```python
# Python REPL
from app.features.payment.db import set_lifetime
await set_lifetime(user_id="<alice-的-user-id>", is_lifetime=True)
```

**方式 B：直接改 Insforge**
1. Insforge dashboard → `subscriptions` 表
2. 找到 `user_id = <alice 的 user_id>` 的行（如果不存在，先 insert 一行）
3. 把 `is_lifetime` 设为 `true`，`entitlements` 设为 `["all"]` 或对应 Max 权限列表

朋友刷新页面或重新登录，就拥有 Max 权限了。

### 4. 验证你的 super 账号

- 打开 `/admin` 应该能进（验证 admin）
- 打开 `/for-you` 应该能看到个性化日报（验证 Pro 权限）
- 打开个股分析 `/stock/AAPL` 应该能看到完整四维分析（验证 Max 权限）
- 在 Insforge 后台搜你的邮箱，应该看到一条 `subscriptions` 行，`is_lifetime=true`

### 5. 朋友退出后清理

主理人：
- 把朋友邮箱从 `ADMIN_EMAILS` 删掉
- 把朋友的 `is_lifetime` 改回 `false`（或保留，看主理人决定）
- 朋友的账号本身不用删，留着做用户研究样本也行

---

## 服务清单

### Vercel（前端部署）

- **用途**：部署 `frontend/` 到 `themarketbrew.com`，每次 push 自动构建
- **环境**：`production`（master 分支）/ `preview`（非 master 分支）/ `development`（本地）
- **朋友权限**：默认**不需要**。看 Vercel bot 在 PR 里贴的 preview URL 即可
- **需要 Viewer 权限的情况**：要看 build log / 改 env var / 看 analytics → 主理人在 Vercel team 邀请 `Member` 角色
- **CLI**：装了 `vercel`，登录后 `vercel link` 关联本项目
  - `vercel logs <deployment-url>` —— 看 runtime log
  - `vercel env pull .env.local` —— 拉 env vars 到本地（需主理人开权限）

### Railway（后端部署）

- **用途**：部署 `backend/` 到 `stock-agent-production.up.railway.app`，push master 自动部署
- **没有 preview 分支**：朋友改后端无法直接在 Railway 上预览，本地起后端测，或主理人合并后看生产
- **朋友权限**：默认不需要。看 logs → 主理人在 Railway team 给 `Viewer`
- **CLI**：`railway logs` 看后端 log。**不要**在本地 `railway run` 连生产环境

### Insforge（数据库 + Edge Functions + Auth + Storage）

- **用途**：相当于自托管 Supabase。PostgreSQL + Edge Functions（`backend/app/edge_functions/*.js`）+ 用户认证（邮箱 / 微信）+ 文件存储
- **朋友权限**：默认不需要。Edge function 部署用 `/insforge-cli` skill，主理人代部署
- **关键约束**：
  - DDL（CREATE / ALTER / DROP TABLE）仅主理人执行
  - Edge function 部署走 PR → 合并后主理人 `insforge functions deploy`
  - 不要直接在 Insforge dashboard 改业务数据

详见 [数据安全与回滚](#数据安全与回滚)。

### Resend（邮件）

- **用途**：发日报 / 早报 / 个性化 digest / 营销 broadcast
- **朋友自己注册**：免费 3000/月，但只能发到**自己验证过**的邮箱（足够本地测试）
- **Segments**：生产 segment id 在 L3，朋友用自己的 Resend 不需要这些
- **CLI**：不用装。本地通过项目 API 调用 Resend 即可

### Stripe（支付）

- **用途**：订阅付费（Pro / Max），Webhook 同步订阅状态
- **朋友自己注册**：用 test mode（`sk_test_*` + `pk_test_*`），测试卡 `4242 4242 4242 4242`
- **创建测试产品**：朋友在自己 Stripe test dashboard 创建两个 Product（Pro / Max），把 price id 填进 `.env`
- **CLI**：不用装本地 Stripe CLI。如果需要测 webhook，方案是让主理人在 Stripe Dashboard 临时把 webhook URL 指向 ngrok 之类的本地隧道，或直接在生产上验证
- **生产 live key**：永不外发

### GitHub

- **代码**：`nomorekuiqian/stock-agent` 私有 repo
- **CI workflow**：`ci.yml` 每个 push / PR 自动跑
- **Cron workflows**（11 个，`.github/workflows/`）：生产定时任务，**不要手动触发**
- **朋友权限**：Repo Write 即可（创建分支 + PR）。改 workflow 走 PR + 主理人 review

### Cloudflare / DNS

- `themarketbrew.com` 在 Cloudflare 管理 DNS
- 朋友不需要权限

---

## 数据安全与回滚

代码出问题可以 revert，**数据出问题可能丢失永久**。

### 代码回滚（容易）

```bash
git revert <bad-commit>
git push
# Vercel / Railway 自动重新部署，3-5 分钟生效
```

**从不 `git reset --hard` master。**

### Insforge 数据回滚（**当前是缺口**）

**现状**：项目**没有**自动化 Insforge 备份 / PITR。任何 `DROP TABLE` / `DELETE` / 错误 `UPDATE` —— **没法快速回滚**。这是已知风险。

### 安全边界

**DDL — 仅主理人**

朋友代码里不应出现：
- `CREATE TABLE` / `DROP TABLE` / `ALTER TABLE`
- `CREATE INDEX` / `DROP INDEX`
- 修改 RLS policy / bucket 配置

需要新表 / 改 schema 的流程：
1. PR 里**用文字描述**需要的表结构（不写 SQL）
2. 主理人 review 后手动执行 DDL
3. 你的代码再 merge

**DML 限制**

允许朋友写：
- 自己测试账号 user_id 下的数据
- Edge function 内通过用户身份验证后写的数据

不允许：
- 不带 `WHERE` 的 `UPDATE` / `DELETE`
- 写其他用户的数据（除非 schema 明确支持）
- 任何 `TRUNCATE`

**软删除约定**

业务需要"删除" → 用 `deleted_at` 时间戳，不要 `DELETE FROM`。物理清理由主理人在确认 N 天后执行。

**Edge Function 部署门禁**

- Edge function 代码在 git（`backend/app/edge_functions/*.js`）
- 改动走 PR + review
- 合并后**主理人** `insforge functions deploy`
- 找回旧版本：`git checkout <commit> -- backend/app/edge_functions/xxx.js && insforge functions deploy xxx`

**生产 vs 开发**

当前只有一个 Insforge 实例（生产 = 开发）。中期方案：开第二个 Insforge 实例当 staging，朋友连 staging。短期：本地代码连生产 Insforge，但只读 / 只写自己测试账号。

### 主理人 TODO

- [ ] `scripts/backup_insforge.py`：每天 cron dump 关键表到 S3 / 本地
- [ ] 跟 Insforge 确认是否提供 PITR / 自动 snapshot
- [ ] 评估开 staging Insforge 实例

---

## 项目自带工具栈

`.claude/` 目录预装了一套工具，朋友 clone 完直接能用。**强烈推荐用 Claude Code 协作**。

### 怎么启用

1. 装 Claude Code：https://claude.com/claude-code
2. 在项目根目录：`cd stock-agent && claude`
3. Claude Code 自动读取：
   - `CLAUDE.md` — 项目规则
   - `.claude/settings.json` — hooks + plugin
   - `.claude/skills/` — 项目自带 skills
   - `.claude/commands/` — 项目自定义 slash command
   - `skills-lock.json` — skills 版本锁

### 自带 Skills（部分）

**工作流类**

| 命令 | 做什么 |
|------|--------|
| `/test` | 跑 lint + unit + e2e + build |
| `/test frontend` `/test backend` `/test lint` | 范围限定 |
| `/plan <feature>` | 创建 engineering plan 到 `docs/plans/active/` |
| `/review-changes` | 多 agent 并行 review 当前 diff |
| `/cover-changes` | 看 diff 自动补测试 |
| `/audit-docs` | 扫文档 vs 代码 drift |
| `/commit-diffs` | 按逻辑分组提交 |
| `/ship` | 测试 → diff review → bump VERSION → CHANGELOG → commit → push → 创建 PR |
| `/ready-to-ship` | 上线前检查（不自动 ship） |
| `/shape` | 写代码前做 UX/UI 设计 brief |

**集成类（项目专属）**

| 命令 | 做什么 |
|------|--------|
| `/insforge-cli` | Insforge edge function 部署 / SQL / bucket |
| `/insforge` | 前端 Insforge SDK 集成模式 |
| `/resend` | Resend 邮件 API 用法 |
| `/stripe-best-practices` | Stripe 集成最佳实践 |

**设计/UI 类**

| 命令 | 做什么 |
|------|--------|
| `/critique` `/polish` `/distill` | 设计评审 / 上线扫尾 / 简化 |
| `/typeset` `/colorize` `/layout` | 单点优化 |
| `/sweep` | 跑完整 Impeccable UI pipeline |

**自定义 commands**（`.claude/commands/`）

| 命令 | 做什么 |
|------|--------|
| `/update-wechat-qr` | 更新微信小程序二维码 |

完整列表见 `skills-lock.json`，搜的话用 `/find-skills`。

### Plugin

`.claude/settings.json` 启用：

```json
"enabledPlugins": {
  "vercel@claude-plugins-official": true
}
```

提供 Vercel 相关的 skill 集合（部署、env 管理、监控）。朋友进项目自动加载。

### Hooks

`.claude/settings.json` 配了两个 PostToolUse hook：

1. **Edit|Write `.ts/.tsx`** → 自动 ESLint 反馈
2. **EnterWorktree** → 自动启动 worktree 独立 dev 服务（用 `scripts/start-worktree-dev.sh`）

### Shell Scripts

`scripts/`：

| Script | 做什么 |
|--------|--------|
| `setup-worktree-ports.sh` | 给 worktree 分配独立端口 |
| `start-worktree-dev.sh` | 启动 worktree dev 服务 |
| `stop-worktree-dev.sh` | 停止 worktree dev 服务 |
| `worktree-status.sh` | 查看所有 worktree 状态 |

### Git Worktree（同时做多个 feature）

```bash
git worktree add ../stock-agent-feat-screener feat/alice-screener-filter
cd ../stock-agent-feat-screener
# Claude Code 进入会自动跑 start-worktree-dev.sh
```

每个 worktree 独立目录、独立分支、独立 dev 端口，互不干扰。

### Codex（独立第二意见）

Codex CLI 与 Claude Code 并存，专门用来做独立 review：

```bash
# 在 PR 分支上
codex review
```

Codex 不共享 Claude 的上下文，能给出真正"第二意见"。建议工作流：Claude 写代码 + Codex review。

---

## 主理人落地清单

文档生效前主理人需要做：

- [ ] 创建 `backend/.env.example` 和 `frontend/.env.local.example`（按 C7 总表标注 L1/L2/L3 和注册链接）
- [ ] 创建 `.github/pull_request_template.md`（用 C5 模板）
- [ ] GitHub repo 启用 master branch protection：
  - Require PR + 1 approval
  - Require status checks (CI) to pass
  - Restrict force push
- [ ] `README.md` 顶部加 "贡献者请先读 `docs/contributing.md`"
- [ ] `docs/index.md` 加 contributing.md 条目
- [ ] 准备 onetimesecret.com 账号（或同类），用于发 L2 key
- [ ] 实现 Insforge 备份方案（`scripts/backup_insforge.py`）
- [ ] 评估开 staging Insforge 实例
- [ ] 准备一个 admin UI（或脚本），快速 `set_lifetime(user_id, true/false)`

---

## 修订记录

- 2026-05-18 v3：CLI 清单精简（移除 stripe / resend / supabase / gcloud / jq / rg）；Insforge CLI 加入必装，明确"允许 / 禁止"命令清单，靠 SERVICE_KEY 不外发兜底
- 2026-05-18 v2：CLI 清单按主理人实际安装情况校准；env var 按 L1/L2/L3 全量列出；测试账号改为朋友自注册 + 主理人设 admin/lifetime；Git 工作流改为 AI-native（手敲作 fallback）
- 2026-05-18 v1：初版
