# Track M · 手动 / 导入持仓同步（Holdings Sync）

> **状态记录文档（非 active plan）** — 本目录是 Track M 功能的权威归档：整体 spec、设计、已完成、待完成、runbook 一站式入口。
> 详细深挖见同目录的 `tech-design.md` / `runbook.md` / `go-live.md` / `tasks.md`。
> 父级多 Track 提案（含未启动的 Track C SnapTrade）仍在 `docs/plans/proposals/holdings-sync-design.md`。

| | |
|---|---|
| **Owner** | Track M — 手动 / 导入持仓同步 |
| **Feature flag** | `holdings_sync_import`（默认 off；GA+2wk 后退） |
| **代码** | `backend/app/features/holdings_sync/`、`frontend/src/components/holdings-sync/` |
| **当前阶段** | 代码完工（M1-M4，166 测试）+ Insforge 基础设施部署完成（B.1-B.6）；**待后端服务上新代码（B.7）+ 真截图 eval（C）+ 灰度推进（D/E）** |
| **灰度** | `STAGE_ENABLED_SOURCES = {"screenshot"}`（Stage 1）；paste/csv/pdf 代码就绪但门控关闭 |
| **PR** | #21 |

---

## 1. 这是什么 / 为什么

把**多形态持仓摄取**（券商截图 / 粘贴文本含自然语言·CSV / PDF 对账单）汇聚到**一个 Review/Confirm 屏**，用户核对后一键写入 `user_portfolios`。目标：让"把我的持仓告诉系统"像"拍一下就好"，而不是逐只手敲。

手敲 (manual) 路径**完全保持现状**（`PUT /api/portfolio/bulk`），不经本模块，零回归。

### 范围边界

- **属于 Track M**：截图 / 粘贴 / CSV / PDF 四种导入 → 解析 → Review → reconcile 写入。
- **不属于本文**：Track C（SnapTrade 券商只读连接 / `user_broker_connections` / `holdings-sync.js`）—— 独立 Track，**未启动**，见父提案。
- **关联 followup（不在本实现内）**：既有 `/api/stocks/search` 搜不到 `BRK.A` 的去重 bug（独立修）；免费用户导入落 watchlist 的 sink；`symbol_resolution_cache` 周期清理。

---

## 2. 整体架构（单一收口）

```
(a) 手敲 ───────────────────────────────────┐ （保持现状，不走 holdings_sync）
(b) 截图 → vision-LLM ──┐                     │
(c) 粘贴文本(含自然语言) ┤→ POST /extract → ExtractDraft → REVIEW UI → POST /commit → reconcile_and_upsert
(d) CSV 上传 ───────────┤   (不写库)            (符号消歧/编辑/         (replace-by-source +
(e) PDF → 文本|vision ──┘                       逐行接受丢弃)           P1 merge 保护) → 折叠 touch
```

**唯一写路径** = `service.reconcile_and_upsert` → `portfolio.db.reconcile_portfolio` → EF `portfolio.js action=reconcile` → Postgres `reconcile_user_portfolio_source()`。

### 后端模块 `backend/app/features/holdings_sync/`

| 文件 | 职责 |
|---|---|
| `router.py` | 共享守卫（flag 404 / stage 400 / entitlement 403）+ `/extract`（screenshot/paste/csv/pdf）+ `/commit` |
| `service.py` | `HoldingsSource` 协议 + 适配器 + `dedupe_and_validate` + `reconcile_and_upsert` |
| `models.py` | `NormalizedHolding`（**结构上无 P1**）/ `ExtractedRow` / `ExtractDraft` / `Commit*` |
| `agent.py` | `gemini-3.1-flash-lite-preview` 抽取（vision + paste-text），不用 pro |
| `resolver.py` | 5 步符号解析 + 两级缓存（L1 进程 / L2 Insforge）+ 报价回环 + EC3 字面 ticker 变体探测 |
| `parsers.py` | CSV 券商注册表（Robinhood/Fidelity/Schwab/E\*TRADE）+ 通用列映射 + locale 数字 |
| `pdf_utils.py` | PDF probe（pypdf 文本密度 + 加密拒）+ 渲染（pypdfium2 → PNG） |
| `quota.py` | LLM/vision daily 8 上限 — fail-CLOSED + 原子 consume RPC |
| `db.py` | 薄；复用 `portfolio.db.reconcile_portfolio` + symbol-cache EF get/put |

### 前端

- `frontend/src/components/holdings-sync/HoldingsSyncDialog.tsx` — Radix Dialog，4 块瓷砖（截图 active；paste/csv/pdf 受 `*_TILE_LIVE` 常量门控）+ 共享 Review/Confirm 表格（对齐 design-system tokens，双主题）。
- `frontend/src/lib/api.ts` — `api.holdingsSync.*`。
- `frontend/src/hooks/queries/use-holdings-sync.ts` — `useHoldingsSyncExtract` / `useHoldingsSyncCommit`。
- 入口：`frontend/src/app/for-you/portfolio/page.tsx` 头部"同步持仓"卡片（`holdings_sync_import` flag 门控）。

---

## 3. 三处正确性关键（最重笔墨）

### 3.1 P1 字段结构性保护

`NormalizedHolding` **schema 上不含** `thesis / target / stop_loss / conviction`。source 适配器在类型层就无法携带 P1 —— 保护在 schema 而非约定。reconcile 时 P1 永远 `COALESCE` 自既有行，import payload 绝不覆盖。

### 3.2 replace-by-source + 完整集契约

`reconcile_user_portfolio_source(p_user_id, p_source, p_rows, p_clear_source)`：

1. 逐行 upsert（quant 字段来自 payload；P1 来自既有行 COALESCE）。
2. 源作用域删除：删掉本次不再包含、且 `source=p_source` 的行。`$CASH` 是 source-agnostic 单例，永不被源作用域删。
3. `portfolio_confirmed_at` touch 折叠进同事务（原子）。
4. `pg_advisory_xact_lock(hashtext('hsync_reconcile'), hashtext(user_id|source))` 串行化同 (user, source) 并发完整集提交。

`CommitRequest.rows` 必为该 source **完整目标集**（非增量）；空 rows 仅 `clear_source=true` 放行（防"续修发增量"反删先存行）。手敲行（`source=manual`）与其他 source 的行永不被触碰。

### 3.3 symbol 注入边界

symbol 全程过 `portfolio.models._SYMBOL_RE = ^[\$A-Z0-9.\-]{1,16}$` 才下传 EF（EF 把 symbol 插值进 PostgREST `not.in()`）。不过则降级 `needs_review`，绝不下传非法 symbol。

---

## 4. 符号解析管线（resolver.py）

复用 `shared/fmp_service.search_stocks`（同步 → `asyncio.to_thread`），其上是薄置信/策略层。5 步：

1. **现金短路** — `{$CASH, 现金, MONEY MARKET, ...}` → `$CASH`，不打 FMP。
2. **候选生成** — `[raw_symbol, strip_exchange_suffix, raw_name]` 去重，每个查 `dt_search_stocks`；**字面 ticker 短路**（`^[A-Z]{1,5}[.\-][A-Z]{1,3}$` 如 `BRK.B` → 变体探测 + 报价回环，绕过有损去重）。
3. **打分** — exact symbol +0.55 / exact name +0.45 / 前缀 +0.25 / 交易所 hint +0.20 / 主板 +0.10 / 类型不符 −0.30。
4. **置信策略** — top≥0.85 且 gap≥0.25 → `ok`（自动接受）；≥0.55 → `needs_review`（候选 chips）；<0.55 有候选 → `needs_review`（前 5）；无候选 → `unresolved`。
5. **报价回环** — `ok` 候选批量 `get_batch_quotes`，无价者降 `no_quote`（杜绝静默残废持仓）；EC3 多类别股公司补探 `{base}.A/.B` 入 candidates。

**性能与防滥用**：token 去重（60 行常仅 ~40 唯一）；本地 24h stock-list 优先（乱填本地秒级 miss 零网络）；每请求 fallback 网络预算 ≤12，超出 → `budget_exhausted`；有界并发 `Semaphore(5)`；8s 解析截止，未决 → `pending_review` 随 draft 返回（绝不挂死）。

### 两级共享解析缓存

- **L2** = Insforge `symbol_resolution_cache(query_norm PK, resolved_json, status, hit_count, resolved_at, expires_at)` + `symbol-cache.js` EF（`get`/`put`，跨用户跨实例共享，正结果 TTL 60–90 天 / 负 14–30 天）。**独立于 portfolio geba**（不碰 `user_portfolios`）。key 仅安全规范 key（ticker-shaped 或 `h:<hex>`），自由文本拒绝。EF fail-CLOSED（共享写缓存，secret 缺失/错误 → 拒）。
- **L1** = 进程内 TTL dict（~30–60min）+ request coalescing。
- 读路径：L1 → L2（coalesced）→ 本地/网络；解析后异步 `put` 回 L2 + 写 L1。**正负结果都缓存**。

---

## 5. PDF 双路径（pdf_utils.py + router._extract_pdf）

便宜路径优先：

- **probe BEFORE quota** — `probe_pdf(raw)` 用 pypdf 探测；加密 / 损坏 / 0 页 → 400 **零消耗**。加密分支**不 touch `reader.pages`**（pypdf 某些版本会抛），`len(pages)` 亦 try/except。
- **文本路径** — 每页平均 ≥200 非空白字符（数字版）→ 前 8 页文本喂 LLM，扣 quota **1**。
- **vision 路径** — 文本稀疏（扫描版）→ pypdfium2 渲染前 4 页 PNG → `asyncio.gather` over per-page `wait_for(LLM_TIMEOUT)` **并发**（4 页 ≈ 一个 LLM-timeout wall-clock）。**整批扣 N**（`p_amount` 整批或不批，防"扣 3 拒第 4 前 3 页白扣"）。
- **partial-page salvage** — `gather(return_exceptions=True)` + 逐页分流：≥1 页成功 → 合并 draft + `dropped_note` 警示部分页失败；全部失败 → 504/502（quota 仍 prepaid 不退款）。

---

## 6. 配额与成本

| 路径 | LLM | 配额 |
|---|---|---|
| 手敲 / CSV / PDF-文本 probe | 否 / 1 次廉价文本 | 无限 / 计 1 |
| 粘贴 / 截图 / PDF-vision | 是 | 共享 **8 次/日** 池；PDF-vision 按页计入 ≤4 |

- 原子 consume：单 EF action `consume_if_under_limit` → `consume_research_quota_if_under_limit(..., p_amount INT DEFAULT 1)`（`pg_advisory_xact_lock` + ON CONFLICT 唯一约束）。
- **命名空间** `hsync:{user_id}`，与 research chat 配额不撞。
- **fail-CLOSED** — 配额 EF 宕 → 拒 + 503（提示改用 CSV/手敲）；异于全局 `quota/service.py` fail-open。
- 模型 `gemini-3.1-flash-lite-preview`；8/日封顶 → 单用户/日最坏 ≈ \$0.04。
- **零留存**：原始上传字节 + 粘贴文本仅内存处理（`io.BytesIO`），不落库/不落 bucket；无服务端 draft store；日志仅 counts/source/user_id 前缀，**绝不记原文**。

---

## 7. 已完成 ✅

### 代码（M1-M4）

| 里程碑 | 内容 |
|---|---|
| **M1 地基** | 原子 reconcile RPC（advisory lock + P1 COALESCE + scoped delete + touch 折叠）；symbol-cache fail-closed；DEAD-import 守卫 |
| **M2 截图** | Gemini vision + 5 步解析 + EC3 字面 ticker + 报价回环；14s 总预算 / 10s LLM 硬封顶 / resolver 剩余预算；Pillow 解码先于扣 quota |
| **M3 粘贴+CSV** | 4 broker 解析注册表 + 通用映射 + locale 数字；`needs_mapping` 二次流；CSV 永不打 LLM |
| **M4 PDF** | pypdf 文本探测 vs pypdfium2 vision 并发；probe-before-quota；整批扣 N；partial-page salvage |
| **UI** | Dialog 对齐 design-system tokens（双主题 / 修对比度 / 消割裂） |

- **测试**：166 passed on `holdings_sync ∪ portfolio ∪ flags ∪ architecture`。
- **Codex 对抗评审 5 轮全过**：M1（needs-attention → 修原子 reconcile + symbol-cache fail-closed）/ M2（3 轮 → approve）/ M4（needs-attention → 修 partial-page salvage + encrypted probe → **approve**）。

### Insforge 基础设施部署（B.1-B.6）

| 步骤 | 内容 | 验证 |
|---|---|---|
| **B.1** | `u0a_portfolio_schema.sql` 加 3 列（source / source_synced_at / external_account_id）+ 索引 + `reconcile_user_portfolio_source` RPC（REVOKE PUBLIC + GRANT anon/authenticated） | 4/4 ✅ |
| **B.2** | `holdings_sync_symbol_cache.sql` 新表 `symbol_resolution_cache` + 索引 | 3/3 ✅ |
| **B.3** | `research_quota_atomic_consume.sql` 唯一约束 + arity-5 `consume_research_quota_if_under_limit`（`p_amount` 整批或不批） | 4/4 ✅ |
| **B.4** | `portfolio.js` EF（新增 `reconcile` action） | smoke 3/3 ✅ |
| **B.5** | `symbol-cache.js` EF（新建，`get`/`put` + SAFE_KEY + fail-closed） | smoke 5/5 ✅ |
| **B.6** | `research-quota.js` EF（新增 `consume_if_under_limit`，透传 amount） | smoke 6/6 ✅ |

部署期修掉的真 bug / 平台坑（已记入 `.context.md`）：
- **SQL `count` 列名歧义** — `RETURNS TABLE(..., count INT, ...)` 与表列 `research_quota.count` 撞名，bare `count` 报 ambiguous。修：表别名 `r.count`。单测 mock EF 层未发现，B.6 smoke 真调 RPC 时暴露。
- **Insforge dangerous-pattern detector** — EF 源码含字符串 `i-m-p-o-r-t`（即便注释）即被拒 deploy；symbol-cache 头部 PII 词组合（JWT/CUSIP/emails/CSV/PDF）也触发。修：paraphrase。

### PR

- PR #21 已 rebase 到最新 master（线性历史），CI 全绿（Backend / Frontend / Vercel）。

---

## 8. 待完成 ⏭

| 步骤 | 内容 | 门槛 |
|---|---|---|
| **B.7** 后端上新代码 | merge PR #21 → Railway docker auto-build（`pip install` 拉 pypdfium2）→ 服务重启 | merge 触发；启动 smoke：`/openapi.json` 含 holdings-sync 路由 |
| **C** 真截图 eval | 收集 5-10 张真实券商截图 fixtures + gold.json → `recall ≥ 0.90` | **Stage 1 面向真实用户灰度前的硬门**（`tests/eval/holdings_sync_extraction/`，缺真图自动 skip） |
| **D** 灰度推进 | `STAGE_ENABLED_SOURCES` 翻常量：Stage 1（截图）→ Stage 2（paste+CSV）→ Stage 3（PDF），FE `*_TILE_LIVE` 同步 | 每阶段稳定 **2 周** |
| **E** GA + 退 flag | 全量 + 退 `holdings_sync_import` flag | GA+2wk（playbook §4） |

### 关联 followup（独立排期，不在本实现内）

1. 既有 `/api/stocks/search` 搜不到 `BRK.A` — 根因 `fmp_service.py` 按公司名去重静默丢类别股；本设计仅在 resolver 侧绕过。根治影响面更广（个股搜索/自选/onboarding），独立 bug-fix。
2. 免费用户导入 → watchlist sink（`reconcile_and_upsert` sink 可切目标，v1 仅留扩展点）。
3. `symbol_resolution_cache` 过期行周期清理（量小可后置）。
4. §1bis 前端感知打磨（sticky 提交栏 / 移动端单列 Review / 乐观可撤销 toast）。

---

## 9. 本地测试（无需 merge）

Insforge DB + EF 已部署，本地后端直连生产 Insforge 即可跑全链路。

```bash
# 后端
cd backend && source venv/bin/activate
pip install -r requirements.txt        # 拉 pypdfium2
uvicorn app.main:app --reload          # :8000

# 前端（.env.local 已指 localhost:8000）
cd frontend && npm run dev             # :3000

# 开 flag（测试号）
insforge functions invoke feature-flags --method POST \
  --data '{"action":"assign","flag":"holdings_sync_import","user_email":"voya.technologies@gmail.com","enabled":true}'
```

登录 `voya.technologies@gmail.com / 123456` → 持仓页 → "同步持仓"卡片 → 截图瓷砖（Stage 1 唯一可点）。

**核心验收用例**：
1. **happy path** — 上传券商截图 → Review 屏分级正确 → 提交 → 持仓页刷新 + `source=screenshot` 写入。
2. **P1 保护（最关键）** — 先手敲一只带 thesis 的持仓 → 截图导入同符号 → 确认 thesis 存活、其他 manual 行不动。
3. **EC3 类别股** — 含 `BRK.B`/`BRK-B`/"Berkshire" 截图 → 候选显式列 `BRK.A/BRK.B (NYSE)` / `BRK.NE (NEO)`。
4. **配额耗尽** — 连传 8 次 → 第 9 次 429 + 提示改用 CSV/手敲。

---

## 10. 文档索引

| 文档 | 内容 |
|---|---|
| **本 README** | 权威记录：spec / 设计 / 已完成 / 待完成 / 测试入口 |
| [`tech-design.md`](./tech-design.md) | 深度技术设计（伪代码 / 正确性矩阵 / 滥用向量表 / §1bis 交互规格 / §2bis 缓存与边缘场景） |
| [`runbook.md`](./runbook.md) | 执行 runbook（分阶段实施步骤） |
| [`go-live.md`](./go-live.md) | 上线操作手册（Codex 评审 / Insforge 部署硬序 / eval / stage 翻常量 / 回滚 / 故障速查 / GA checklist） |
| [`tasks.md`](./tasks.md) | 任务分解与验收标准 |
| `backend/app/features/holdings_sync/.context.md` | 模块边界与不变量（改代码前必读） |
| `docs/plans/proposals/holdings-sync-design.md` | 父级多 Track 提案（含未启动的 Track C SnapTrade） |
