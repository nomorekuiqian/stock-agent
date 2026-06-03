# Track M (holdings_sync) · Go-Live Runbook

> **用途**：把 Track M 从「代码完成 / 测试全绿 / 已推送到 `claude/strange-cray-b75425`」推到「Stage 1 截图灰度上线 → Stage 2 粘贴+CSV → Stage 3 PDF → GA」。本仓库 Claude Code 不能 push / 部署 / 动 Insforge 控制台；所有按钮操作集中在本文。
> **配套**：`-tech-design.md`（设计）/ `-runbook.md`（实现进度）/ `-tasks.md`（任务粒度）。本文 = 上线 ops。
> **执行账号**：Insforge `xuxueyang1994@outlook.com`；测试账号 `voya.technologies@gmail.com` / `123456`。
> **代码分支**：`claude/strange-cray-b75425`（已 push）。

---

## 关键路径（按此顺序执行，不要跳）

```
A. Codex 再评 M4         ── 拦住任何 [high] 阻断
        │ clean
        ▼
B. Insforge 部署          ── 3 migrations + 3 EF；先 migration 再 EF
        │ 验证 OK
        ▼
C. 真实截图 eval (T2)     ── recall ≥ 0.90 才能 widen 到 Stage 1 真实用户
        │ PASS
        ▼
D. STAGE 灰度逐步翻       ── 1: 截图 → 2: 粘贴+CSV → 3: PDF
        │ 每阶段稳定 2 周
        ▼
E. GA + 退 flag           ── playbook §4 走完整 lifecycle
```

> **不要做**：跳过 A 直接部署；EF 部署前没跑 migration（reconcile/quota RPC 不存在 → 5xx）；STAGE 翻到 Stage 2/3 前没跑对应 source 的 eval；FE 三个 `*_TILE_LIVE` 与 backend `STAGE_ENABLED_SOURCES` 不同步（错位会显示"即将上线"但 backend 已开）。

---

## A · Codex 再评 M4（先做这一步）

M4 引入：新 PDF 模块 + `pypdfium2` 依赖 + SQL 函数签名变更（`p_amount`）+ 并发 vision 调用。三处都是非平凡变动，建议在部署/widen 之前再跑一轮对抗评审。

### A.1 启动评审

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.claude/worktrees/strange-cray-b75425

# 后台跑（推荐），让出终端
/opt/homebrew/bin/node "/Users/xuxueyang/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" \
  adversarial-review --base master \
  "Re-review of M4 PDF commit cbc2c3a. Focus: (1) pdf_utils.probe_pdf encrypted-rejection + sparse-text → vision branching correctness; (2) router _extract_pdf gate order — probe BEFORE quota consume, vision render BEFORE quota consume; (3) atomic quota signature change (p_amount DEFAULT 1) — whole-or-nothing semantics, DROP+CREATE idempotency, backwards compat for arity-4 callers (none should exist); (4) concurrent per-page vision via asyncio.gather + asyncio.wait_for — wall-clock bounded, partial-page failure handling; (5) FE CsvPdfTile dispatch by extension/MIME — does it ever submit a wrong source value? Flag only real ship-blocking issues."
# 输出文件路径会被打印，记下后台 ID（形如 bjxxxxxxx）
```

或前台直接跑（小 batch，看输出即走）：

```bash
/opt/homebrew/bin/node "/Users/xuxueyang/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" \
  adversarial-review --base master \
  "<同上 focus text>"
```

> **必须用 `/opt/homebrew/bin/node`**：默认 `node` 可能是 v6.x，跑 codex companion 会 `SyntaxError: Unexpected token import`。

### A.2 读结果 + 处置

后台完成后，Claude Code 会自动通知 + 给出输出文件路径。前台跑时直接看 stdout。

| verdict | 含义 | 该做什么 |
|---|---|---|
| `ready` / `looks-good` | 无阻断 | 进入 **B 部署** |
| `needs-attention` 含 [high] | 阻断 | 修 → 重跑 A.1 → 直到 clean |
| 含 [medium] 但无 [high] | 非阻断 | 记进 `tasks.md` 作为后续优化；可以继续进 B |

### A.3 修复回归门

修任何 [high] 后必跑：

```bash
cd backend
./venv/bin/python -m pytest tests/ -q -k "holdings_sync or portfolio or flags or architecture"
# 必须 158 passed 0 failed（或更高，新增回归 guard 视为正向增长）
```

---

## B · Insforge 部署

> **顺序硬性**：迁移 → EF（迁移建立 RPC，EF 调用 RPC，反过来会 5xx）。
> **部署目标**：Insforge production project（`stock-agent / 526a88dd-…`）。
> **CLI 版本**：`insforge --version` ≥ 0.1.49。

### B.0 前置 + 登录刷新

```bash
# 1. CLI 登录还有效？
insforge db tables | head -3
# 如果报 "Invalid API key"：
insforge login
# 浏览器走完 OAuth；再跑 db tables 应该正常

# 2. 在正确的 project
insforge current
# 应该看到 stock-agent / 526a88dd-483b-4549-8a58-bf452865f5ff

# 3. 切到 worktree 根
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.claude/worktrees/strange-cray-b75425
```

### B.1 迁移 1：portfolio geba（加列 + 索引 + reconcile RPC）

```bash
# 干跑预览（推荐先看一眼）
sed -n '100,165p' backend/migrations/u0a_portfolio_schema.sql

# 正式执行（幂等，重跑无害）
insforge db query --file backend/migrations/u0a_portfolio_schema.sql
```

**预期**：一连串 `ALTER TABLE` / `CREATE INDEX IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION` / `REVOKE` / `DO` 反馈。无 ERROR。

**验证 4 项**：

```bash
# (1) 三列存在
insforge db query --sql "SELECT column_name FROM information_schema.columns
  WHERE table_name='user_portfolios'
    AND column_name IN ('source','source_synced_at','external_account_id');"
# 必须看到全部 3 行

# (2) 旧行已回填 source='manual'
insforge db query --sql "SELECT COUNT(*) FROM user_portfolios WHERE source IS NULL;"
# 必须 0

# (3) 索引在
insforge db query --sql "SELECT indexname FROM pg_indexes
  WHERE tablename='user_portfolios' AND indexname='idx_user_portfolios_user_source';"
# 必须返回 1 行

# (4) RPC 存在 + 非 PUBLIC（关键！Codex 复评 [high] 决策）
insforge db query --sql "SELECT proname, proacl FROM pg_proc
  WHERE proname='reconcile_user_portfolio_source';"
# proacl 应该是 NULL 或 {anon=X/...,authenticated=X/...} —— 绝不能含 '=X/...' 的 PUBLIC 项
```

**回滚**（紧急）：

```bash
insforge db query --sql "
  DROP FUNCTION IF EXISTS reconcile_user_portfolio_source(TEXT,TEXT,JSONB,BOOLEAN);
  ALTER TABLE user_portfolios DROP COLUMN IF EXISTS external_account_id;
  ALTER TABLE user_portfolios DROP COLUMN IF EXISTS source_synced_at;
  ALTER TABLE user_portfolios DROP COLUMN IF EXISTS source;
  DROP INDEX IF EXISTS idx_user_portfolios_user_source;
"
```

⚠️ 回滚不会丢数据（DROP COLUMN 丢的只是 source 元数据），但**手敲行的 source 信息会永久丢失**——只有 staging 紧急用。

### B.2 迁移 2：symbol_resolution_cache（L2 缓存表）

```bash
insforge db query --file backend/migrations/holdings_sync_symbol_cache.sql
```

**验证**：

```bash
insforge db tables | grep symbol_resolution_cache
# 必须看到

insforge db query --sql "\d+ symbol_resolution_cache"
# 必须有列: query_norm PK / resolved_json jsonb / status / hit_count / resolved_at / expires_at
# 必须有 idx_symbol_cache_expires
```

**回滚**：

```bash
insforge db query --sql "DROP TABLE IF EXISTS symbol_resolution_cache;"
```

### B.3 迁移 3：research_quota 原子 consume + amount 参数

```bash
insforge db query --file backend/migrations/research_quota_atomic_consume.sql
```

**预期**：
- DO 块可能输出 `NOTICE: collapsed N duplicate rows`（如果旧 EF 已留下并发竞争结果，会先合并再加唯一约束）
- `DROP FUNCTION IF EXISTS … (TEXT,TEXT,DATE,INT)`：第一次部署时是 NOTICE skip；第二次部署 M4 之后会真删除 arity-4 旧版本。
- `CREATE OR REPLACE FUNCTION` + `REVOKE` + `DO` GRANT loop 全部成功。

**验证 3 项**：

```bash
# (1) 唯一约束在
insforge db query --sql "SELECT conname FROM pg_constraint
  WHERE conname='research_quota_identifier_date_unique';"
# 必须返回 1 行

# (2) 新签名 RPC 在（注意是 arity-5 含 p_amount）
insforge db query --sql "SELECT pg_get_function_identity_arguments(oid)
  FROM pg_proc WHERE proname='consume_research_quota_if_under_limit';"
# 必须返回:
#   p_identifier text, p_identifier_type text, p_usage_date date, p_limit integer, p_amount integer

# (3) 非 PUBLIC
insforge db query --sql "SELECT proacl FROM pg_proc
  WHERE proname='consume_research_quota_if_under_limit';"
# 同 B.1 的规则
```

**回滚**：

```bash
insforge db query --sql "
  DROP FUNCTION IF EXISTS consume_research_quota_if_under_limit(TEXT,TEXT,DATE,INT,INT);
  DROP FUNCTION IF EXISTS consume_research_quota_if_under_limit(TEXT,TEXT,DATE,INT);
  ALTER TABLE research_quota DROP CONSTRAINT IF EXISTS research_quota_identifier_date_unique;
"
```

⚠️ 回滚 unique 约束**不会**重新拆分已合并的重复行；并发竞争产生的数据丢失（旧 bug）无法还原——这是预期行为。

### B.4 EF 1：`portfolio.js`（含 reconcile 动作）

> **必须在 B.1 之后**——EF 的 `reconcile` action 直接 `.rpc("reconcile_user_portfolio_source", ...)`，函数不存在会立即 5xx。

```bash
insforge functions deploy portfolio --file backend/app/edge_functions/portfolio.js
# 期望: "Deployed function 'portfolio'"
```

**冒烟（按以下顺序，先确认 bulk 没被打挂，再测 reconcile）**：

```bash
# 1) bulk 兼容（手敲路径回归）
insforge functions invoke portfolio --params 'action=list&user_id=test_go_live'
# 期望 {"success": true, "data": []}

insforge functions invoke portfolio --params 'action=bulk' --body '{
  "user_id":"test_go_live",
  "rows":[{"symbol":"AAPL","weight_pct":60,"thesis":"hand-typed"},
          {"symbol":"$CASH","weight_pct":40}]
}'
# 期望 success=true，data 含 2 行；thesis="hand-typed" 在 AAPL 上保留

# 2) reconcile 单源写入（screenshot 桶）
insforge functions invoke portfolio --params 'action=reconcile' --body '{
  "user_id":"test_go_live",
  "source":"screenshot",
  "rows":[{"symbol":"NVDA","shares":10},{"symbol":"AAPL","shares":5}],
  "clear_source":false
}'
# 期望 success=true；数据应：
#   - AAPL：shares=5（screenshot 改写量化），thesis="hand-typed" 仍在（P1 COALESCE 保留）
#   - NVDA：shares=10, source=screenshot
#   - $CASH：source=manual 不动（cross-source 单例）

# 3) reconcile 空入参 - 必须 400 拒
insforge functions invoke portfolio --params 'action=reconcile' --body '{
  "user_id":"test_go_live", "source":"screenshot", "rows":[]
}'
# 期望 success=false, error 含 "empty rows requires clear_source=true"

# 4) reconcile clear_source 走通
insforge functions invoke portfolio --params 'action=reconcile' --body '{
  "user_id":"test_go_live", "source":"screenshot", "rows":[],
  "clear_source":true
}'
# 期望 success=true；screenshot 桶清空，AAPL 回到 manual（thesis 还在），$CASH 不动

# 5) **暴露面冒烟**（Codex M1 复评 [high] 决策记录）
# 用 anon-key 直连 PostgREST RPC 应当与直连 user_portfolios 表 DML 平价：
# 如果你的部署里 PostgREST 不外部直连（codebase 规则 5）→ 二者皆不可达 = 通过
# 如果可达 → 二者都可达 = 与 bulk 平价（已接受残留暴露）
# 二者结果不一致（仅 RPC 可达 / 仅 table 可达）→ 收紧到 service-role 模型
# （操作：参考 tech-design.md §4.1）
curl -sS -X POST \
  -H "Authorization: Bearer $INSFORGE_ANON_KEY" \
  -H "Content-Type: application/json" \
  "$INSFORGE_BASE_URL/rest/v1/rpc/reconcile_user_portfolio_source" \
  -d '{"p_user_id":"probe","p_source":"screenshot","p_rows":[],"p_clear_source":true}' \
  -o /tmp/rpc_probe.json -w "%{http_code}\n"
# 记录返回码 + 响应；同样 probe 一下 GET /rest/v1/user_portfolios
```

**回滚**：

```bash
# 部署上一版（Git 历史里 `master:backend/app/edge_functions/portfolio.js`）
git show master:backend/app/edge_functions/portfolio.js > /tmp/portfolio.old.js
insforge functions deploy portfolio --file /tmp/portfolio.old.js
```

⚠️ 回滚到 master 的 `portfolio.js` 会丢失 `reconcile` action + source 三列写入——会让 `holdings_sync.commit` 全部 5xx。仅紧急用。

### B.5 EF 2：`symbol-cache.js`（新 EF）

```bash
insforge functions deploy symbol-cache --file backend/app/edge_functions/symbol-cache.js
```

**冒烟（必须验证 fail-closed 鉴权）**：

```bash
# (1) 无 X-Internal-Secret → 必须 500（fail-closed，Codex M1 [high] 修复）
curl -sS -X GET "$INSFORGE_BASE_URL/functions/symbol-cache?action=get&query_norm=AAPL" \
  -w "\nstatus=%{http_code}\n"
# 期望 status=500，body 含 "Server misconfigured" 或 "EDGE_FUNCTION_SECRET unset"

# (2) 错 secret → 必须 403
curl -sS -X GET "$INSFORGE_BASE_URL/functions/symbol-cache?action=get&query_norm=AAPL" \
  -H "X-Internal-Secret: wrong-secret-abcd" \
  -w "\nstatus=%{http_code}\n"
# 期望 status=403

# (3) 对 secret + 写入 + 读出（用 .env 里的 EDGE_FUNCTION_SECRET）
SECRET="$(grep EDGE_FUNCTION_SECRET= backend/.env | cut -d= -f2 | tr -d '"')"
curl -sS -X POST "$INSFORGE_BASE_URL/functions/symbol-cache?action=put" \
  -H "X-Internal-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"query_norm":"AAPL","resolved_json":{"symbol":"AAPL","name":"Apple Inc."},
       "status":"ok","ttl_days":90}'
# 期望 {"success":true, "data":{"query_norm":"AAPL","expires_at":"..."}}

curl -sS -X GET "$INSFORGE_BASE_URL/functions/symbol-cache?action=get&query_norm=AAPL" \
  -H "X-Internal-Secret: $SECRET"
# 期望 {"success":true, "data":{"resolved_json":{"symbol":"AAPL",...},"status":"ok"}}

# (4) 不合规 key 拒绝（SAFE_KEY 守护）
curl -sS -X GET "$INSFORGE_BASE_URL/functions/symbol-cache?action=get&query_norm=hello%20world" \
  -H "X-Internal-Secret: $SECRET"
# 期望 success=false, error="unsafe query_norm"
```

**回滚**：

```bash
insforge functions delete symbol-cache
# 缓存表会留着；下次 deploy 时数据继续可用
```

### B.6 EF 3：`research-quota.js`（含新 consume_if_under_limit + amount）

> **必须在 B.3 之后**——EF 的 consume 动作调 RPC `consume_research_quota_if_under_limit(...)`，新 amount 签名不在会 5xx。

```bash
insforge functions deploy research-quota --file backend/app/edge_functions/research-quota.js
```

**冒烟**：

```bash
# (1) 现有 get_usage / increment 兼容（research chat 路径不能被打挂）
insforge functions invoke research-quota \
  --params 'action=get_usage&identifier=test_go_live&usage_date=2026-05-19'
# 期望 {"success":true,"data":{...,"count":0}}

# (2) 新 atomic consume （amount=1，单 LLM 调用场景）
insforge functions invoke research-quota \
  --params 'action=consume_if_under_limit' \
  --body '{"identifier":"hsync:test_go_live","identifier_type":"user",
           "usage_date":"2026-05-19","limit":8,"amount":1}'
# 第一次：{"success":true,"data":{"consumed":true,"count":1,"lim":8}}
# 连发 8 次后：consumed=false count=8

# (3) M4 amount 整批（PDF-vision 场景）— 一次扣 3
insforge functions invoke research-quota \
  --params 'action=consume_if_under_limit' \
  --body '{"identifier":"hsync:test_amount","identifier_type":"user",
           "usage_date":"2026-05-19","limit":8,"amount":3}'
# 期望 consumed=true count=3
# 再发同 body：consumed=true count=6
# 再发同 body（会 count+3=9 > 8）：consumed=false count=6 （整批拒，不部分扣）

# 清理测试 quota
insforge db query --sql "DELETE FROM research_quota
  WHERE identifier IN ('hsync:test_go_live','hsync:test_amount','test_go_live');"
```

**回滚**：

```bash
git show master:backend/app/edge_functions/research-quota.js > /tmp/research-quota.old.js
insforge functions deploy research-quota --file /tmp/research-quota.old.js
```

### B.7 后端服务重启

部署完 3 EF + 3 migration 后，后端代码（已 push）不需要任何 Insforge 改动；只需服务重启拉取最新代码。如果你使用 Railway/Vercel 自动部署：merge `claude/strange-cray-b75425` 到 `master`（或你的部署分支）触发自动构建。如果手动：

```bash
ssh <prod-server>
cd /path/to/stock-agent && git pull origin claude/strange-cray-b75425
source backend/venv/bin/activate
pip install -r backend/requirements.txt   # 拉 pypdfium2 + pypdf 等新依赖
systemctl restart stock-agent-backend     # 或 supervisor / pm2，按你的部署方式
journalctl -u stock-agent-backend -n 50   # 看启动日志，确认 router 全部 include 无错
```

**冒烟（生产 backend）**：

```bash
# 用真实测试账号登录前端获取 token，然后：
TOKEN="<bearer-from-devtools>"

# 1) 当前 flag 是 default off → /commit 必须 404（即使 token 有效）
curl -sS -X POST "$API_BASE/holdings-sync/commit" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"screenshot","rows":[{"symbol":"AAPL","shares":1}]}' \
  -w "\nstatus=%{http_code}\n"
# 期望 status=404（flag 不在 → "Not found"）

# 2) 给测试账号开 flag（不开则永远 404）
insforge functions invoke feature-flags \
  --params 'action=assign' \
  --body '{"flag":"holdings_sync_import","user_email":"voya.technologies@gmail.com","enabled":true}'

# 3) 再调 /commit（这次会因 STAGE 限制：rows 用 source=screenshot 是 OK 的，
#    但因为没 entitlement（测试号需 Pro）→ 403；正常 ）
```

---

## C · 真实截图 eval（T2 ship gate）

Stage 1（截图）面向真实用户灰度**之前**的硬门。设计 §7 / runbook M2 要求：macro recall ≥ 0.90 在真实截图上。

### C.1 收集 5–10 张截图

按 `backend/scripts/holdings_sync_poc/samples/real/README.md` 的 10 项 checklist 分布：

```
□ 1.  Robinhood mobile dark mode（Portfolio 页 iPhone 截图）
□ 2.  Robinhood mobile percent view（同账户切到 % allocation）
□ 3.  Fidelity desktop positions（带 Cost Basis Per Share 列）
□ 4.  Schwab desktop positions（带 "Qty (Quantity)" 列）
□ 5.  E*TRADE desktop positions（带 Purchase Price 列）
□ 6.  类别股账户（BRK.B + GOOG/GOOGL 任一）
□ 7.  Cash + 多币种（$CASH + CNY/HKD 一只）
□ 8.  长名 / 截断（基金名两行 wrap 或 ...）
□ 9.  Light-mode 打印视图（Schwab "Print Friendly"/Fidelity PDF 截图）
□ 10. 移动端横向滚动表格
```

**隐私**：可以涂黑账户号 / 用户名 / 总市值，但**保留 symbol 列 + 数量列**（涂黑 symbol = 没法验证）。

### C.2 写 gold.json

文件命名 `samples/real/<name>.png`（或 .jpg/.jpeg/.webp） + `samples/real/<name>.gold.json`，schema：

```json
{
  "looks_like_holdings": true,
  "rows": [
    {"symbol": "AAPL",  "shares": 120},
    {"symbol": "BRK.B", "shares": 1.5},
    {"symbol": "$CASH", "cost_basis": 1234.56}
  ]
}
```

字段说明：
- `symbol`：用户在截图上能看到的最显著的代码 / 名称（resolver 之后会规范化，这里写原文）
- `shares` / `cost_basis` / `entry_price` / `weight_pct`：只填**截图里写明的**字段，没写的别填
- 现金行：`{"symbol":"$CASH", "cost_basis":<金额>}`

### C.3 运行 eval

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.claude/worktrees/strange-cray-b75425/backend
source venv/bin/activate
export GOOGLE_API_KEY="<your key from .env>"   # 实际调 Gemini，每张图 ~$0.0005

# 人读输出
python scripts/holdings_sync_poc/evaluate.py --dir real

# 或 CI 友好（JSON）
python scripts/holdings_sync_poc/evaluate.py --dir real --json > /tmp/real_eval.json
```

**输出形态（人读）**：

```
✓ rh_mobile_dark           P=1.00  R=1.00  qty=4/4   lat=4.2s
✓ fidelity_desktop         P=0.95  R=0.95  qty=8/9   lat=3.8s
  missing: ['BRK.B']
× scanned_pdf_print        P=0.50  R=0.40  qty=2/5   lat=5.1s
  missing: ['VTI', 'BRK.B', 'JNJ']
  spurious: ['XYZ']
...
MACRO  P=0.892  R=0.910  (gate ≥0.9: PASS)
Adversarial looks_like_holdings=✓
```

**判定**：
- **PASS**（macro recall ≥ 0.90 且对抗样本正确处理）→ 可以进入 D.1 Stage 1 灰度
- **FAIL** → 分析 missing/spurious 模式（OCR 错？类别股漏？指令注入跑漏？），加 prompt 指令 / 调 resolver / 扩对抗样本，**不要降 gate**

### C.4 pytest 形态（CI 集成）

```bash
cd backend && source venv/bin/activate
# 默认 pytest 不跑（marked slow）；显式启用：
./venv/bin/python -m pytest -m slow tests/eval/holdings_sync_extraction/test_real_images.py -v
# 期望 PASSED 一行；FAILED 时 assertion message 含全部 per-sample 结果
```

---

## D · STAGE_ENABLED_SOURCES 灰度逐步翻

Backend 常量在 `backend/app/features/holdings_sync/router.py:STAGE_ENABLED_SOURCES`，FE 同步开关在 `frontend/src/components/holdings-sync/HoldingsSyncDialog.tsx:PASTE_TILE_LIVE/CSV_TILE_LIVE/PDF_TILE_LIVE`。**两端必须同步**——只翻 backend 会让 FE 显示"即将上线"但 backend 已接收；只翻 FE 会让 FE 提交后立即 400。

### D.1 Stage 1：截图灰度（已可生效）

**前置**：A clean + B 部署完 + C PASS。

**生效路径**：
- backend `STAGE_ENABLED_SOURCES = {"screenshot"}`（已是当前值，无需改）
- FE `PASTE_TILE_LIVE/CSV_TILE_LIVE/PDF_TILE_LIVE` 当前都是 `true` → 三个瓷砖都显示但提交 paste/csv/pdf 会 400 "即将上线"

**收紧 FE 与 backend 一致（推荐）**：

```ts
// frontend/src/components/holdings-sync/HoldingsSyncDialog.tsx
const PASTE_TILE_LIVE = false;   // 改为 false 直到 D.2
const CSV_TILE_LIVE   = false;   // 改为 false 直到 D.2
const PDF_TILE_LIVE   = false;   // 改为 false 直到 D.3
```

**灰度节奏**（playbook §3）：
- D1：admin + 测试号 `voya.technologies@gmail.com`
- D3：+3-5 内部
- D7：+10-20 付费用户
- D14：稳定（无 5xx 爆发 / 无支持工单堆积）→ 进 D.2

**开 flag**：

```bash
# 单用户开
insforge functions invoke feature-flags --params 'action=assign' \
  --body '{"flag":"holdings_sync_import","user_email":"<email>","enabled":true}'

# 批量
insforge db query --sql "
  INSERT INTO user_flag_assignments (user_id, flag, enabled, created_at)
  SELECT id::text, 'holdings_sync_import', true, now()
  FROM auth.users WHERE email IN ('a@x.com','b@y.com')
  ON CONFLICT (user_id, flag) DO UPDATE SET enabled=EXCLUDED.enabled;
"
```

**观测点**（这两周看这些）：
1. `/api/holdings-sync/extract` mode=screenshot 错误率（应 <2%）
2. `/api/holdings-sync/commit` 错误率（应 <1%）
3. 配额 EF 503 比率（fail-closed 没被频繁触发 = 健康）
4. Gemini API 成本（应 ≈ 0.0005 × LLM 调用次数）
5. 用户支持工单（关键词："识别错"/"导入失败"/"持仓被覆盖"）

**回滚**（如出问题）：

```bash
# 关 flag（即时生效，不需要部署）
insforge functions invoke feature-flags --params 'action=unassign-all' \
  --body '{"flag":"holdings_sync_import"}'

# 或针对单用户
insforge functions invoke feature-flags --params 'action=assign' \
  --body '{"flag":"holdings_sync_import","user_email":"<email>","enabled":false}'
```

### D.2 Stage 2：粘贴 + CSV

**前置**：D.1 稳定 2 周 + paste/CSV 各自的 eval（粘贴英中样本 + CSV 真实导出）recall ≥ 0.9。

```bash
# 同样收集 5-10 个真实粘贴/CSV 样本，gold.json 同 schema，跑 eval：
python scripts/holdings_sync_poc/evaluate.py --dir real_paste  # 如果你新建子目录
# CSV 的 eval 因为是确定性解析，直接对比 parse_csv 输出和 gold；可以补一个
# pytest 单元测试（无 LLM 调用，零成本）
```

**翻常量**：

```python
# backend/app/features/holdings_sync/router.py
STAGE_ENABLED_SOURCES: set[str] = {"screenshot", "paste", "csv"}
```

```ts
// frontend/src/components/holdings-sync/HoldingsSyncDialog.tsx
const PASTE_TILE_LIVE = true;
const CSV_TILE_LIVE   = true;
const PDF_TILE_LIVE   = false;
```

**部署**：commit + push + 后端重启（同 B.7）+ 前端重新部署。

**冒烟**（部署后立即）：

```bash
# 1) paste 路径
curl -sS -X POST "$API_BASE/holdings-sync/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "mode=paste" \
  -F "text=AAPL 10 shares
MSFT 5 shares
现金 1234.56"
# 期望 200 + ExtractDraft

# 2) CSV 路径 - broker 已识别
curl -sS -X POST "$API_BASE/holdings-sync/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "mode=csv" \
  -F "file=@<robinhood_export.csv>;type=text/csv"

# 3) CSV 路径 - 需要 mapping
curl -sS -X POST "$API_BASE/holdings-sync/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "mode=csv" \
  -F "file=@<unknown_format.csv>;type=text/csv"
# 期望 200 + rows=[], columns=[…], dropped_note="无法自动识别列…"

# 然后带 mapping 重交
curl -sS -X POST "$API_BASE/holdings-sync/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "mode=csv" \
  -F "file=@<unknown_format.csv>;type=text/csv" \
  -F 'mapping={"symbol":"colA","shares":"colB"}'
```

### D.3 Stage 3：PDF

**前置**：D.2 稳定 2 周 + PDF eval（数字版 + 扫描版各至少 2 张，recall ≥ 0.9）。

**翻常量**：

```python
STAGE_ENABLED_SOURCES: set[str] = {"screenshot", "paste", "csv", "pdf"}
```

```ts
const PDF_TILE_LIVE = true;
```

**冒烟**：

```bash
# 1) 数字版 PDF（券商对账单导出）
curl -sS -X POST "$API_BASE/holdings-sync/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "mode=pdf" \
  -F "file=@<fidelity_statement.pdf>;type=application/pdf"
# 期望 200，rows 来自文本路径（1 配额）

# 2) 扫描版 PDF
curl -sS -X POST "$API_BASE/holdings-sync/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "mode=pdf" \
  -F "file=@<scanned.pdf>;type=application/pdf"
# 期望 200，rows 来自 vision 路径（≤4 配额）

# 3) 加密 PDF
curl -sS -X POST "$API_BASE/holdings-sync/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "mode=pdf" \
  -F "file=@<encrypted.pdf>;type=application/pdf"
# 期望 400，detail 含 "加密 PDF 不支持，请先解锁或改用截图"

# 4) 配额观察 - 检查 PDF-vision 扣的是 amount=N 而非 N 次单调用
insforge db query --sql "SELECT count, updated_at FROM research_quota
  WHERE identifier='hsync:<your-user-id>' AND usage_date='<today>';"
# 若 PDF-vision 跑过一张 3 页扫描版，count 应该跳 +3
```

---

## E · GA + 退 flag

灰度 Stage 3 稳定 2 周后（约 D.1 起算 6 周），按 `docs/guides/feature-flags-playbook.md` §4 退 flag：

1. **代码**：删除 `_require_holdings_sync_flag` 守卫（router.py），保留 entitlement 守卫
2. **registry**：在 `flags/registry.py` 把 `holdings_sync_import` 从 `KNOWN_FLAGS` 移除
3. **数据**：清 `user_flag_assignments` 该 flag 行（playbook 给的标准清理 SQL）
4. **测试**：删 `test_flags_registry.py::test_holdings_sync_import_present`；其它 holdings_sync 测试不变
5. **文档**：更新 `holdings_sync/.context.md` 状态行（去掉 "GA+2wk 后退 flag" 一句），design doc §6 标注 GA 日期

---

## 常见故障速查

| 症状 | 可能原因 | 解决 |
|---|---|---|
| 部署 EF 后 `/commit` 全部 500 | migration 还没跑 → RPC 不存在 | 跑 B.1 / B.3 对应 migration，无需重新部署 EF |
| `/extract` mode=pdf 一直 503 | M4 配额 amount 没传 / arity-4 旧 RPC 还在 | 跑 B.3（DROP old + CREATE new），重启 backend |
| FE 显示"即将上线"但 backend 是新版 | `*_TILE_LIVE` 没翻 / 没重新部署前端 | 翻 + 部署 FE；二者必须同步 |
| `symbol-cache` 调用全部 500 | `EDGE_FUNCTION_SECRET` 未配置（fail-closed 起作用） | 在 Insforge 项目 secrets 加 `EDGE_FUNCTION_SECRET=<value>` + redeploy symbol-cache |
| eval 真图 recall 长期 <0.9 | 多半是 prompt 不够约束 / 截图质量太差 | 不要降 gate；先看 missing 模式（类别股？现金？长名？）针对加 sample + tune VISION_INSTRUCTION |
| reconcile 用户报"持仓被神秘删除" | 客户端发了 `rows=[]` 而非 `clear_source=true`，或并发提交 | 看 backend access log；现在有 advisory lock 应该不可能交错互删 |
| 配额每天上午 8 点全员 503 | 配额 EF 没起来 / Insforge 维护窗口 | fail-closed 是预期行为；用户改 CSV/手敲（不限次） |

---

## 检查总表（按顺序勾完才算 GA）

- [ ] A · Codex M4 再评 clean
- [ ] B.1 · u0a_portfolio_schema.sql 部署 + 4 项验证通过
- [ ] B.2 · holdings_sync_symbol_cache.sql 部署 + 表 + 索引验证
- [ ] B.3 · research_quota_atomic_consume.sql 部署 + 唯一约束 + arity-5 函数验证
- [ ] B.4 · portfolio.js 部署 + 5 步冒烟全过（含 RPC 暴露面 probe 记录）
- [ ] B.5 · symbol-cache.js 部署 + 3 鉴权路径冒烟过（500/403/200）
- [ ] B.6 · research-quota.js 部署 + amount 冒烟过（amount=3 整批 OK 与 整批拒）
- [ ] B.7 · 生产后端拉新代码 + 重启 + `flag-off → 404` 冒烟过
- [ ] C · 真实截图 ≥5 张 / gold.json 配齐 / `pytest -m slow … recall ≥0.9` PASS
- [ ] D.1 · Stage 1 灰度 admin → 内部 → 付费，2 周稳定（5xx/工单观测）
- [ ] D.2 · paste/csv eval PASS + STAGE 翻 + FE TILE_LIVE 同步 + 冒烟过 + 2 周稳定
- [ ] D.3 · PDF eval PASS（数字 + 扫描 各 ≥2）+ STAGE 翻 + 冒烟过 + 2 周稳定
- [ ] E · 退 flag + 清 assignments + 文档归档到 `docs/plans/completed/`
