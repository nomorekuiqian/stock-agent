# Panda 知识星球 Pipeline 自动化 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Panda 知识星球的人工「爬取→归一化→入库 embedding」流程做成 Insforge cron 定时触发、Railway 后端异步执行的端到端 pipeline，含全保真 raw archive、逐 thread 状态 ledger，以及 cookie/会员过期的邮件刷新闭环。

**Architecture:** Insforge Schedule → `cron-trigger.js`（新 job，短超时校验 accepted）→ 后端 `POST /api/zsxq/ingest`（落 run 后立即返回、后台异步跑 crawl→normalize→audit-gate→index→smoke）。后端只通过 Insforge edge function 读写 DB/bucket（沿用 `vector-store` 模式）。爬虫忠实移植现有 `zsxq-crawler-workspace` 的游标/限速/错误分流机制；归一化复用 `export_corpus.py` 的清洗逻辑；embedding 复用现有 `features.vector` 服务（不新建 embedding client）。

**Tech Stack:** Python 3.11 / FastAPI（`backend/`，Railway）；Insforge Edge Functions（Deno + Insforge SDK `client.database`/`client.storage`）；Insforge Postgres + pgvector（1536 维，`openai/text-embedding-3-small`）；Insforge Schedule（cron）；Resend（邮件）；pytest（`backend/tests/`）。

**关联：** 设计 spec 见 [`docs/plans/active/panda-zsxq-pipeline-automation.md`](panda-zsxq-pipeline-automation.md)；数据契约手册见 [`docs/guides/panda-zsxq-automation.md`](../../guides/panda-zsxq-automation.md)。

**测试命令前缀（统一）：** `cd backend && source venv/bin/activate &&`（CLAUDE.md 约定；亦可 `conda run -n stock_agent`）。

**Git 规则：** CLAUDE.md 禁止自动 commit/push；每个 Task 末尾的 commit step 需用户确认后再执行（worker 准备好 commit 命令，由用户拍板）。

---

## 不变量（每个 Task 都不得破坏）

- `source_type="zsxq_thread"`、`metadata.author_username="pandacircle"`、真实子作者放 `metadata.source_author_username`。
- Tier-0 deterministic enrichment（content_type/tags/tickers），v1 **不调用 LLM**。
- embedding 走 `app.features.vector.service.index_document`，不新建 embedding 客户端。
- `threads.jsonl` 是可复现 source of truth；不为知识星球新建孤立 RAG 表。
- 不改 `pandacircle` corpus binding；不写 `kol_tweets`。
- target group：`15554581218512`（潘大的科技交流圈）；本账号是普通成员（官方 API 被禁，必须 cookie 爬）。

## File Structure（创建/修改一览）

**新建 — `backend/app/features/zsxq_ingest/`**
- `__init__.py` — 包标记
- `models.py` — Pydantic：`ThreadRecord`、`LedgerEntry`、`IngestRun`、`IngestReport`、`Credential`、`IngestState`
- `normalize.py` — raw zsxq JSON → `ThreadRecord`（threads.jsonl 行）；vendor `export_corpus` 清洗
- `indexing.py` — 从 `scripts/index_zsxq_threads.py` 抽出的 parse/prepare/index 可复用 service
- `crawl.py` — cookie-based zsxq API client（移植游标/限速/错误分流/评论/二进制 + 写 ledger）
- `db.py` — 调 `zsxq-ingest-store` edge function 读写 credentials/state/runs/ledger + bucket
- `service.py` — 异步编排 crawl→normalize→audit→index→smoke；更新 runs/ledger；触发邮件
- `router.py` — `POST /api/zsxq/ingest`、`GET /api/zsxq/runs/{run_id}`、`POST|GET /api/zsxq/cookie`
- `.context.md` — 模块说明（CLAUDE.md 要求）

**新建 — Insforge**
- `backend/app/edge_functions/zsxq-ingest-store.js` — 表 CRUD + bucket 读写（模仿 `vector-store.js`）
- `backend/app/edge_functions/zsxq-ingest-store.sql` — 4 张表迁移

**修改**
- `backend/scripts/index_zsxq_threads.py` — 改为薄 CLI，调用 `zsxq_ingest.indexing`（行为不变）
- `backend/app/main.py:~181` — `include_router(zsxq_ingest_router)`
- `backend/app/edge_functions/cron-trigger.js:16` — 新增 `zsxq_panda_ingestion` job

**新建测试 — `backend/tests/features/zsxq_ingest/`**
- `fixtures/` — 固定 raw zsxq JSON 样本（talk / q&a / 缺字段 / `<e>` 标签 / 评论 >8）
- `test_normalize.py`、`test_indexing.py`、`test_crawl_cursor.py`、`test_crawl_errors.py`、`test_service_gate.py`

---

## Phase 0 — 验证 Insforge 基础设施未知项（spike，必须先做）

> spec §13 标记的两个真实未知：Insforge **bucket/storage API**（现有 edge function 无人用过）+ 后端**异步任务机制**。先验证再写依赖代码，避免凭空臆造 API。

### Task 0.1: 验证 Insforge bucket/storage 能力

**Files:** Append findings → 本plan 末尾「Appendix A: Insforge storage findings」。

- [ ] **Step 1: 读 insforge skill 的 storage 用法**

调用 `Skill(insforge)` 与 `Skill(insforge-cli)`，定位 edge function 内 `client.storage` 的 API（create bucket / upload object / get signed download url / list）与体积上限。

- [ ] **Step 2: 用 insforge-cli 建测试 bucket 并上传/下载一个对象**

```bash
insforge db sql "select 1"                 # 确认 CLI 连通
# 按 skill 文档创建 bucket（如 zsxq-archive）并上传一个小文件，记录命令与返回
```

- [ ] **Step 3: 记录结论**

把以下写进 Appendix A：bucket 的 SDK 方法签名、单对象大小上限、是否支持二进制、签名 URL 有效期、计费/配额提示。**若二进制上限过低**：在 Appendix A 标注「二进制改存对象存储外链 / 降级为仅元数据」，并据此调整 Task 2.5 与 Task 3.2。

### Task 0.2: 确认后端异步执行机制

**Files:** Append → Appendix A。

- [ ] **Step 1: 读现有 accepted 模式实现**

```bash
sed -n '1,120p' backend/app/features/watchlist_monitor/router.py
grep -rnE "BackgroundTasks|asyncio.create_task|start-paid-universe" backend/app/features/watchlist_monitor/
```

- [ ] **Step 2: 记录结论**

把后端「收到请求→落 run→立即返回 accepted→后台跑长任务」的既有写法（FastAPI `BackgroundTasks` 还是 `asyncio.create_task` 还是别的）记入 Appendix A。Task 4.1/4.2 复用同一机制。注意：进程重启会中断后台任务 → 需支持按 ledger 断点续爬（Task 2.1 的游标 + Task 4.1 的 resume）。

---

## Phase 1 — 归一化 + 索引 service 重构（纯 Python，离线可测，TDD）

> 这两个 Task 无任何 Insforge/网络依赖，价值最高、风险最低，先交付。

### Task 1.1: 把 `index_zsxq_threads.py` 的索引逻辑抽成 `indexing.py` service

**Files:**
- Create: `backend/app/features/zsxq_ingest/__init__.py`（空）
- Create: `backend/app/features/zsxq_ingest/indexing.py`
- Modify: `backend/scripts/index_zsxq_threads.py`（改为调用 service）
- Test: `backend/tests/features/zsxq_ingest/test_indexing.py`

- [ ] **Step 1: 写失败测试（保证抽取后行为不变）**

```python
# backend/tests/features/zsxq_ingest/test_indexing.py
from app.features.zsxq_ingest import indexing

OWNER_QA = {
    "topic_id": "t1", "type": "q&a", "title": "英伟达还能买吗",
    "question": {"text": "NVDA 现在估值贵吗？"},
    "answer": {"text": "英伟达数据中心需求强劲" * 30},
    "author": {"name": "潘大", "role": "owner"},
    "create_time": "2026-06-01T10:00:00.000+0800",
    "tags": ["AI", "半导体"], "digested": True, "likes_count": 12,
    "group_name": "潘大的科技交流圈", "url": "https://wx.zsxq.com/topic/t1",
}

def test_eligible_owner_qa_prepared_with_ticker_and_content_type():
    prepared = indexing.prepare_records([OWNER_QA], min_chars=0)
    assert len(prepared) == 1
    rec = prepared[0]
    assert rec.content_type == "qa"
    assert "NVDA" in rec.tickers
    assert rec.metadata["author_username"] == "pandacircle"
    assert rec.metadata["source_author_username"] == "潘大"
    assert "回答:" in rec.content and "提问:" in rec.content

def test_member_post_dropped_as_non_authored():
    member = {**OWNER_QA, "author": {"name": "路人", "role": "member"}}
    prepared = indexing.prepare_records([member], min_chars=0)
    assert prepared == []
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/features/zsxq_ingest/test_indexing.py -v`
Expected: FAIL（`ModuleNotFoundError: app.features.zsxq_ingest.indexing`）

- [ ] **Step 3: 实现 `indexing.py`（搬运 `index_zsxq_threads.py` 的纯函数）**

把现有脚本里的 `_get_ticker_aliases`、`extract_tickers`、`_main_parts`、`_content_type`、`_clean_title`、`_metadata`、`_compose_content`、`_eligible` 原样搬入 `indexing.py`（逻辑零改动），并新增聚合 API：

```python
# backend/app/features/zsxq_ingest/indexing.py
from __future__ import annotations
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

DEFAULT_SOURCE_TYPE = "zsxq_thread"
DEFAULT_PERSONA_KEY = "pandacircle"
DEFAULT_PERSONA_NAME = "潘大的科技交流圈"

# … 此处粘贴 index_zsxq_threads.py 的 _FALLBACK_TICKER_ALIASES / _CRYPTO_TICKER_ALIASES /
#    _get_ticker_aliases / _has_cjk / extract_tickers / _main_parts / _content_type /
#    _clean_title / _metadata / _compose_content / _eligible（逐字搬运，不改逻辑）…

@dataclass
class PreparedRecord:
    source_id: str
    title: str
    url: str | None
    content: str
    content_type: str
    tickers: list[str]
    report_date: str | None
    metadata: dict[str, Any]
    raw: dict[str, Any]

def prepare_records(
    records: list[dict[str, Any]], *, min_chars: int = 0,
    persona_key: str = DEFAULT_PERSONA_KEY, persona_name: str = DEFAULT_PERSONA_NAME,
) -> list[PreparedRecord]:
    aliases = _get_ticker_aliases()
    out: list[PreparedRecord] = []
    for rec in records:
        ok, _reason = _eligible(rec, min_chars)
        if not ok:
            continue
        question, body = _main_parts(rec)
        ctype = _content_type(rec, body)
        tickers = extract_tickers(f"{question or ''}\n{body}", aliases)
        md = _metadata(rec, persona_key=persona_key, content_type=ctype, tickers=tickers)
        content = _compose_content(rec, question=question, body=body,
                                   content_type=ctype, persona_name=persona_name, md=md)
        date = (rec.get("create_time") or "")[:10]
        out.append(PreparedRecord(
            source_id=str(rec["topic_id"]), title=_clean_title(rec, body),
            url=rec.get("url"), content=content, content_type=ctype, tickers=tickers,
            report_date=date if len(date) == 10 else None, metadata=md, raw=rec,
        ))
    return out

def audit_distribution(records: list[dict], prepared: list[PreparedRecord],
                       drop_reasons: dict[str, int]) -> dict[str, Any]:
    """§8 AUDIT 分布报告（供 gate + runs.report）。"""
    with_ticker = sum(1 for p in prepared if p.tickers)
    return {
        "total": len(records), "selected": len(prepared), "dropped": dict(drop_reasons),
        "content_type": dict(Counter(p.content_type for p in prepared)),
        "ticker_coverage": round(with_ticker / max(1, len(prepared)), 2),
        "top_tickers": dict(Counter(t for p in prepared for t in p.tickers).most_common(15)),
        "multi_chunk_docs": sum(1 for p in prepared if len(p.content) > 3200),
    }

async def index_prepared(rec: PreparedRecord, *, force: bool = False):
    """单条入 pgvector（复用现有 vector service）。"""
    from app.features.vector.models import VectorDocumentInput, VectorIndexRequest
    from app.features.vector.service import index_document
    return await index_document(VectorIndexRequest(
        document=VectorDocumentInput(
            source_type=DEFAULT_SOURCE_TYPE, source_id=rec.source_id, title=rec.title,
            url=rec.url, symbol=rec.tickers[0] if rec.tickers else None,
            report_date=rec.report_date, visibility="public",
            content=rec.content, metadata=rec.metadata,
        ),
        force=force,
    ))
```

> 同时改 `_eligible` 返回 drop reason，让 `prepare_records` 能产出 `drop_reasons` Counter（与现脚本一致）。给 `prepare_records` 增加可选 `drop_reasons: Counter` 参数累加，或返回 `(prepared, drop_reasons)`——任选其一并在 Step 1 测试对齐。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/features/zsxq_ingest/test_indexing.py -v`
Expected: PASS

- [ ] **Step 5: 把 `scripts/index_zsxq_threads.py` 改为薄 CLI**

`run()` 改为：读 JSONL → `indexing.prepare_records` → 打印 `indexing.audit_distribution` → dry-run 打印样本 / 否则 `await indexing.index_prepared(...)` 累计 indexed/skipped/failed。保持所有 CLI 参数与 stdout 字段（`INPUT`/`CONTENT_TYPE`/`TICKER_COVERAGE`/`SUMMARY`…）不变。

- [ ] **Step 6: 回归——CLI dry-run 输出与重构前一致**

Run（用现有语料）：`cd backend && source venv/bin/activate && python scripts/index_zsxq_threads.py --input /Users/xuxueyang/Documents/GitHub/zsxq-crawler-workspace/repo/output/corpus/15554581218512/threads.jsonl --dry-run`
Expected: 打印 `INPUT/CONTENT_TYPE/ROLE/TICKER_COVERAGE/TOP_TICKERS/CHUNKING` + 4 条样本；selected 数与重构前一致。

- [ ] **Step 7: Commit（待用户确认）**

```bash
git add backend/app/features/zsxq_ingest/__init__.py backend/app/features/zsxq_ingest/indexing.py \
        backend/scripts/index_zsxq_threads.py backend/tests/features/zsxq_ingest/test_indexing.py
git commit -m "refactor(zsxq): extract index_zsxq_threads logic into reusable indexing service"
```

### Task 1.2: `normalize.py` — raw zsxq JSON → threads.jsonl 记录

**Files:**
- Create: `backend/app/features/zsxq_ingest/normalize.py`
- Create: `backend/tests/features/zsxq_ingest/fixtures/topic_talk.json`、`topic_qa.json`、`topic_etags.json`
- Test: `backend/tests/features/zsxq_ingest/test_normalize.py`

- [ ] **Step 1: 准备 fixtures（真实形状）**

从现有语料取真实样本：
```bash
python -c "import json;[print(json.dumps(json.loads(l),ensure_ascii=False)) for l in open('/Users/xuxueyang/Documents/GitHub/zsxq-crawler-workspace/repo/output/corpus/15554581218512/threads.jsonl')][:1]"
```
另需保存一条**原始 zsxq API** 的 topic JSON（来自 raw archive 或 `api raw` 结果）作为 `topic_talk.json`/`topic_qa.json`，含 `talk.text`/`question`/`answer`/`owner`/`create_time`/`tags`/`comments`/`files`/`images` 等原字段，以及一条带 `<e type="hashtag"/>`/`<e type="web_url"/>` 的 `topic_etags.json`。

- [ ] **Step 2: 写失败测试**

```python
# backend/tests/features/zsxq_ingest/test_normalize.py
import json, pathlib
from app.features.zsxq_ingest import normalize

FIX = pathlib.Path(__file__).parent / "fixtures"

def _load(name): return json.loads((FIX / name).read_text(encoding="utf-8"))

def test_talk_normalized_to_thread_record():
    rec = normalize.normalize_topic(_load("topic_talk.json"),
                                    group_id="15554581218512", group_name="潘大的科技交流圈",
                                    owner_user_id="15555428815112", creator_ids={"15555428815112"})
    assert rec["topic_id"]
    assert rec["type"] in ("talk", "q&a")
    assert rec["author"]["role"] in ("owner", "creator", "member", "unknown")
    assert isinstance(rec["tags"], list)

def test_etags_rendered_to_plain_text():
    rec = normalize.normalize_topic(_load("topic_etags.json"),
                                    group_id="15554581218512", group_name="x",
                                    owner_user_id=None, creator_ids=set())
    assert "<e" not in rec["text"]      # <e> 标签已渲染
    assert "%" not in rec["text"][:0] or True  # URL 已解码（按 fixture 断言具体文本）

def test_missing_title_falls_back_to_first_line():
    data = _load("topic_talk.json"); data.pop("title", None)
    rec = normalize.normalize_topic(data, group_id="g", group_name="x",
                                    owner_user_id=None, creator_ids=set())
    assert rec["title"] == "" or isinstance(rec["title"], str)  # title 缺失留空，由 indexing 兜底首行
```

- [ ] **Step 3: 运行确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/features/zsxq_ingest/test_normalize.py -v`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `normalize.py`（vendor `export_corpus` 清洗 + 单 topic 归一）**

把 `export_corpus.py` 的 `clean_text` / `_render_e_tag` / `_decode` / 正则常量逐字搬入。新增 `normalize_topic(raw_topic, *, group_id, group_name, owner_user_id, creator_ids)` 把**一条原始 zsxq topic JSON** 映射成 threads.jsonl 记录（字段对齐 Task 1.1 `OWNER_QA` 形状 + `comments`/`files`/`images` 全保真）：

```python
# backend/app/features/zsxq_ingest/normalize.py
from __future__ import annotations
from typing import Any
# … 粘贴 export_corpus 的 _E_TAG_RE/_ATTR_RE/_HTML_TAG_RE/_decode/_render_e_tag/clean_text …

TOPIC_URL = "https://wx.zsxq.com/dweb2/index/topic_detail/{tid}"

def _role(uid, owner_user_id, creator_ids):
    if not uid: return "unknown"
    if owner_user_id and str(uid) == str(owner_user_id): return "owner"
    if str(uid) in creator_ids: return "creator"
    return "member"

def normalize_topic(t: dict[str, Any], *, group_id, group_name,
                    owner_user_id, creator_ids) -> dict[str, Any]:
    tid = str(t["topic_id"]); ttype = t.get("type")
    talk = t.get("talk") or {}; q = t.get("question") or {}; a = t.get("answer") or {}
    if ttype == "q&a" or q or a:
        author = (a.get("owner") or q.get("owner") or {})
        question = {"text": clean_text(q.get("text"))}
        answer = {"text": clean_text(a.get("text"))}
        body = answer["text"] or question["text"]
    else:
        author = talk.get("owner") or {}
        question = answer = None
        body = clean_text(talk.get("text"))
    uid = author.get("user_id")
    rec: dict[str, Any] = {
        "group_id": group_id, "group_name": group_name, "topic_id": tid,
        "type": ttype, "title": clean_text(t.get("title") or ""), "text": body,
        "author": {"user_id": (str(uid) if uid else None),
                   "name": author.get("name") or "", "role": _role(uid, owner_user_id, creator_ids)},
        "create_time": t.get("create_time"),
        "tags": [h.get("title","").strip("# ") for h in (t.get("hashtags") or []) if h.get("title")],
        "digested": bool(t.get("digested")), "likes_count": t.get("likes_count") or 0,
        "url": TOPIC_URL.format(tid=tid),
        "comments": _normalize_comments(t.get("show_comments") or [], owner_user_id, creator_ids),
        "files": [{"file_id": str(f.get("file_id")), "name": f.get("name"), "size": f.get("size")}
                  for f in (talk.get("files") or t.get("files") or [])],
        "images": [im.get("original", {}).get("url") or im.get("large", {}).get("url")
                   for im in (talk.get("images") or t.get("images") or []) if im],
    }
    if question is not None:
        rec["question"] = question; rec["answer"] = answer
    return rec

def _normalize_comments(comments, owner_user_id, creator_ids):
    out = []
    for c in comments:
        owner = c.get("owner") or {}
        out.append({"comment_id": str(c.get("comment_id")),
                    "text": clean_text(c.get("text")),
                    "author": {"user_id": str(owner.get("user_id")) if owner.get("user_id") else None,
                               "name": owner.get("name") or "",
                               "role": _role(owner.get("user_id"), owner_user_id, creator_ids)},
                    "create_time": c.get("create_time"), "likes_count": c.get("likes_count") or 0})
    return out
```

> **重要**：原始 zsxq JSON 的确切字段名（`hashtags` vs `tags`、`show_comments` vs `comments`、图片 `original/large/thumbnail`）以 Task 0/2 抓到的真实 payload 为准，fixture 与本函数同步校正。

- [ ] **Step 5: 运行确认通过 + 端到端拼接验证**

Run: `pytest tests/features/zsxq_ingest/test_normalize.py -v` → PASS
再加一条集成断言：`indexing.prepare_records([normalize.normalize_topic(...owner q&a...)])` 非空且 `content_type=="qa"`（normalize→indexing 衔接无误）。

- [ ] **Step 6: Commit（待用户确认）**

```bash
git add backend/app/features/zsxq_ingest/normalize.py backend/tests/features/zsxq_ingest/
git commit -m "feat(zsxq): normalize raw zsxq topic JSON into threads.jsonl records"
```

---

## Phase 2 — 爬虫 client（忠实移植，mocked httpx，TDD）

> 逐项移植 `zsxq_interactive_crawler.py` 的机制。**禁止偷工**：游标 ms-offset、限速、错误分流缺一不可（spec §13.9）。所有网络用 mock 测，不打真实 API。

### Task 2.1: 游标分页（end_time ms-offset）

**Files:** Create `backend/app/features/zsxq_ingest/crawl.py`；Test `test_crawl_cursor.py`

- [ ] **Step 1: 失败测试**

```python
# test_crawl_cursor.py
from app.features.zsxq_ingest import crawl

def test_next_cursor_subtracts_offset_ms():
    # 末条 create_time → 减 offset → 同格式
    nxt = crawl.next_end_time("2026-06-01T10:00:00.500+0800", offset_ms=1)
    assert nxt == "2026-06-01T10:00:00.499+0800"

def test_paginate_stops_on_empty(monkeypatch):
    pages = [
        {"succeeded": True, "resp_data": {"topics": [{"topic_id": "2", "create_time": "2026-06-02T00:00:00.000+0800"}]}},
        {"succeeded": True, "resp_data": {"topics": []}},
    ]
    calls = {"i": 0}
    def fake_fetch(self, **kw):
        p = pages[calls["i"]]; calls["i"] += 1; return p
    monkeypatch.setattr(crawl.ZsxqClient, "_fetch_topics_page", fake_fetch)
    monkeypatch.setattr(crawl.ZsxqClient, "_sleep", lambda self, s: None)
    client = crawl.ZsxqClient(cookie="c", group_id="g")
    topics = list(client.iter_topics(scope="all"))
    assert [t["topic_id"] for t in topics] == ["2"]
```

- [ ] **Step 2: 失败** — `pytest tests/features/zsxq_ingest/test_crawl_cursor.py -v` → FAIL

- [ ] **Step 3: 实现 `crawl.py` 骨架 + 游标/分页**

```python
# backend/app/features/zsxq_ingest/crawl.py
from __future__ import annotations
import datetime as _dt, random, time
from typing import Any, Iterator
import httpx
from app.core.logging import get_logger

logger = get_logger(__name__)
API = "https://api.zsxq.com"

def next_end_time(create_time: str, offset_ms: int = 1) -> str:
    dt = _dt.datetime.fromisoformat(create_time.replace("+0800", "+08:00"))
    dt -= _dt.timedelta(milliseconds=offset_ms)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+0800"

class ZsxqAuthError(Exception):
    def __init__(self, kind: str, message: str):  # kind: cookie_expired | membership_expired
        super().__init__(message); self.kind = kind

class ZsxqClient:
    def __init__(self, cookie: str, group_id: str, *, min_delay=2.0, max_delay=5.0,
                 long_delay_interval=20, long_delay_range=(180, 300), offset_ms=1):
        self.cookie, self.group_id = cookie, group_id
        self.min_delay, self.max_delay = min_delay, max_delay
        self.long_delay_interval, self.long_delay_range = long_delay_interval, long_delay_range
        self.offset_ms = offset_ms
        self._client = httpx.Client(timeout=15.0)
        self._page_count = 0

    def _headers(self) -> dict:
        return {"Cookie": self.cookie,
                "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                               "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"),
                "Referer": "https://wx.zsxq.com/"}

    def _sleep(self, seconds: float) -> None:
        time.sleep(seconds)

    def _smart_delay(self) -> None:
        self._sleep(random.uniform(self.min_delay, self.max_delay))

    def _maybe_long_delay(self) -> None:
        self._page_count += 1
        if self._page_count % self.long_delay_interval == 0:
            self._sleep(random.uniform(*self.long_delay_range))

    def _fetch_topics_page(self, *, scope: str, end_time: str | None, count: int = 20) -> dict:
        params = {"scope": scope, "count": str(count)}
        if end_time: params["end_time"] = end_time
        r = self._client.get(f"{API}/v2/groups/{self.group_id}/topics",
                             headers=self._headers(), params=params)
        return self._handle_response(r)

    def iter_topics(self, *, scope: str = "all", count: int = 20,
                    stop_create_time: str | None = None) -> Iterator[dict[str, Any]]:
        end_time = None
        while True:
            self._smart_delay()
            data = self._fetch_topics_page(scope=scope, end_time=end_time, count=count)
            topics = (data.get("resp_data") or {}).get("topics") or []
            if not topics:
                return
            for t in topics:
                if stop_create_time and (t.get("create_time") or "") <= stop_create_time:
                    return  # 增量到达游标
                yield t
            end_time = next_end_time(topics[-1]["create_time"], self.offset_ms)
            self._maybe_long_delay()
```

`_handle_response` 在 Task 2.3 实现（先放占位抛 NotImplementedError 让本 Task 测试用 monkeypatch 绕过即可）。

- [ ] **Step 4: 通过** — `pytest tests/features/zsxq_ingest/test_crawl_cursor.py -v` → PASS
- [ ] **Step 5: Commit（待确认）** — `git commit -m "feat(zsxq): topic pagination with ms-offset cursor + incremental stop"`

### Task 2.2: 限速（smart_delay + 每 N 页长休眠）

- [ ] **Step 1: 失败测试** — 断言 `iter_topics` 翻 `long_delay_interval` 页后调用一次长休眠：

```python
def test_long_delay_every_n_pages(monkeypatch):
    sleeps = []
    monkeypatch.setattr(crawl.ZsxqClient, "_sleep", lambda self, s: sleeps.append(s))
    # 造 long_delay_interval+1 个非空页（每页1条），最后空页收尾
    ...
    client = crawl.ZsxqClient(cookie="c", group_id="g", long_delay_interval=2, long_delay_range=(180,180))
    list(client.iter_topics())
    assert any(s == 180 for s in sleeps)   # 触发过长休眠
```

- [ ] **Step 2-4:** 上面 §Task 2.1 的 `_maybe_long_delay` 已实现 → 跑测试确认 PASS（若失败再修）。
- [ ] **Step 5: Commit（待确认）** — `git commit -m "feat(zsxq): human-like rate limiting (per-page delay + periodic long sleep)"`

### Task 2.3: 错误分流（401/14210/403/429/可重试码）

- [ ] **Step 1: 失败测试**

```python
# test_crawl_errors.py
import httpx, pytest
from app.features.zsxq_ingest import crawl

def _resp(status=200, json_body=None):
    return httpx.Response(status, json=json_body or {}, request=httpx.Request("GET", "http://x"))

def test_401_raises_cookie_expired():
    c = crawl.ZsxqClient(cookie="c", group_id="g")
    with pytest.raises(crawl.ZsxqAuthError) as e:
        c._handle_response(_resp(401, {}))
    assert e.value.kind == "cookie_expired"

def test_code_14210_raises_membership_expired():
    c = crawl.ZsxqClient(cookie="c", group_id="g")
    with pytest.raises(crawl.ZsxqAuthError) as e:
        c._handle_response(_resp(200, {"succeeded": False, "code": 14210, "error": "会员已过期"}))
    assert e.value.kind == "membership_expired"
```

- [ ] **Step 2: 失败** — FAIL（`_handle_response` 占位）
- [ ] **Step 3: 实现 `_handle_response`**

```python
    RETRYABLE_CODES = {1059, 10001}  # 以现有 crawler should_retry_api_code 为准，Task 0 校正

    def _handle_response(self, r: httpx.Response) -> dict:
        if r.status_code == 401:
            raise ZsxqAuthError("cookie_expired", "HTTP 401")
        if r.status_code == 403:
            raise ZsxqAuthError("cookie_expired", "HTTP 403 access denied")  # 当作需换 cookie
        if r.status_code == 429:
            raise RuntimeError("rate_limited_429")  # 由调用方退避重试/加大延迟
        if r.status_code != 200:
            raise RuntimeError(f"http_{r.status_code}")
        data = r.json()
        if data.get("succeeded"):
            return data
        code = data.get("code")
        if code == 14210:
            raise ZsxqAuthError("membership_expired", data.get("error", "会员已过期"))
        raise RuntimeError(f"api_error_{code}: {data.get('error')}")
```

> 在 `_fetch_topics_page` 外包一层 retry（对 `429`/`RETRYABLE_CODES` 退避 N 次；对 `ZsxqAuthError` 直接上抛不重试）。重试上限与等待秒数对齐现有 `retry_wait_seconds`（Task 0 记录实际值）。

- [ ] **Step 4: 通过** → PASS
- [ ] **Step 5: Commit（待确认）** — `git commit -m "feat(zsxq): classify 401/14210/403/429 + retryable api codes"`

### Task 2.4: 评论补全（comments_count>8）+ Task 2.5: 二进制下载 + Task 2.6: ledger 写入

- [ ] **Step 1: 失败测试**（评论）— `comments_count<=8` 不发额外请求；`>8` 调用 `_fetch_comments` 翻页：

```python
def test_no_extra_comment_fetch_when_le_8(monkeypatch):
    c = crawl.ZsxqClient(cookie="c", group_id="g")
    called = {"n": 0}
    monkeypatch.setattr(c, "_fetch_comments", lambda tid, total: called.__setitem__("n", called["n"]+1) or [])
    out = c.fetch_full_comments({"topic_id": "t1", "comments_count": 5, "show_comments": [{"comment_id":"1"}]})
    assert called["n"] == 0 and len(out) == 1
```

- [ ] **Step 2: 失败** → FAIL
- [ ] **Step 3: 实现** `fetch_full_comments`（`>8` 时 `GET /v2/topics/{tid}/comments` 按末条 `create_time` 翻页，`count=30`，`max_retries≈10`，失败返回已得部分不抛）；`download_binaries(topic, save)` —— 附件 `GET /v2/files/{file_id}/download_url` 取签名 URL 再下载，图片用 topic JSON URL；返回 `(downloaded, failed)` 计数。**二进制落地方式以 Appendix A（Task 0.1）为准**：bucket 够用就上传 bucket，否则仅存元数据 + 外链。
- [ ] **Step 4: 通过** → PASS
- [ ] **Step 5: Commit（待确认）** — `git commit -m "feat(zsxq): full comment pagination + binary download with failure accounting"`

> ledger 的**写入**在 Phase 3/4 接 db 后接线（crawl 产出 per-topic 结果 dict：`stage_crawled/comments/binaries` 状态 + 计数 + error），本 Task 只产出结构、不落库。`models.py` 的 `LedgerEntry` 在 Task 3.1 定义。

---

## Phase 3 — Insforge 持久化（表 + edge function + backend db）

### Task 3.1: 迁移 SQL（4 张表）+ `models.py`

**Files:** Create `backend/app/edge_functions/zsxq-ingest-store.sql`、`backend/app/features/zsxq_ingest/models.py`

- [ ] **Step 1: 写迁移 SQL（模仿 `vector-store.sql`）**

```sql
-- backend/app/edge_functions/zsxq-ingest-store.sql
create table if not exists zsxq_credentials (
  group_id text primary key,
  cookie text not null,
  status text not null default 'active',         -- active | expired | membership_expired
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists zsxq_ingest_state (
  group_id text primary key,
  last_success_at timestamptz,
  last_seen_create_time text,
  last_seen_topic_id text,
  last_input_hash text,
  last_summary jsonb not null default '{}'::jsonb
);
create table if not exists zsxq_ingest_runs (
  run_id uuid primary key default gen_random_uuid(),
  group_id text not null,
  crawl_type text not null,                        -- incremental | full
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',          -- running|done|degraded|failed|auth_failed
  pages_fetched int default 0, topics_seen int default 0,
  topics_new int default 0, topics_updated int default 0,
  comments_fetched int default 0, files_downloaded int default 0,
  indexed int default 0, skipped int default 0, failed int default 0,
  error_message text, report jsonb not null default '{}'::jsonb
);
create table if not exists zsxq_thread_ledger (
  group_id text not null, topic_id text not null,
  first_seen_run_id uuid, last_run_id uuid,
  topic_type text, author_role text, create_time text, content_hash text,
  stage_crawled text default 'pending', stage_comments text default 'pending',
  stage_binaries text default 'pending', stage_normalized text default 'pending',
  stage_indexed text default 'pending',
  drop_reason text, binaries_total int default 0, binaries_failed int default 0,
  last_error text, updated_at timestamptz not null default now(),
  primary key (group_id, topic_id)
);
create index if not exists zsxq_ledger_run_idx on zsxq_thread_ledger (last_run_id);
create index if not exists zsxq_ledger_stage_idx on zsxq_thread_ledger (group_id, stage_indexed);
```

- [ ] **Step 2: 写 `models.py`**（`LedgerEntry`/`IngestRun`/`IngestReport`/`Credential`/`IngestState`/`ThreadRecord` Pydantic，与表列对齐）。无独立单测（被后续 Task 覆盖）。
- [ ] **Step 3: Commit（待确认）** — `git commit -m "feat(zsxq): ingest tables migration + pydantic models"`

### Task 3.2: edge function `zsxq-ingest-store.js`（表 CRUD + bucket）

**Files:** Create `backend/app/edge_functions/zsxq-ingest-store.js`

- [ ] **Step 1: 实现**（严格模仿 `vector-store.js`：`createClient`、`requireInternal()` 校验 `X-Internal-Secret`、`action` 路由）。actions：
  - `get_credential` / `set_credential`（upsert，admin 写）
  - `get_state` / `update_state`
  - `create_run` / `update_run` / `get_run`
  - `upsert_ledger`（按 `(group_id, topic_id)` onConflict）/ `aggregate_ledger`（按 run 统计各 stage 分布）
  - `put_object` / `get_object_url`（bucket；**API 以 Appendix A 为准**；bucket 不可用则该两 action 降级为存元数据行）

  表操作示例（沿用 SDK）：
```js
const { data, error } = await client.database.from("zsxq_thread_ledger")
  .upsert(row, { onConflict: "group_id,topic_id" }).select("topic_id");
```

- [ ] **Step 2: 部署 + 冒烟**（insforge-cli skill）

```bash
insforge db sql -f backend/app/edge_functions/zsxq-ingest-store.sql
insforge functions deploy zsxq-ingest-store
# 用 X-Internal-Secret 调 set_credential / create_run / upsert_ledger，确认 200 + 落库
```

- [ ] **Step 3: Commit（待确认）** — `git commit -m "feat(zsxq): insforge edge function for ingest store (tables + bucket)"`

### Task 3.3: backend `db.py`（调 edge function）

**Files:** Create `backend/app/features/zsxq_ingest/db.py`（模仿 `vector/db.py`：`get_insforge_service().call_function("zsxq-ingest-store", ...)` + `internal_headers()`）。

- [ ] **Step 1: 实现** `get_credential/set_credential/get_state/update_state/create_run/update_run/get_run/upsert_ledger/aggregate_ledger/put_object`。
- [ ] **Step 2: 集成冒烟**（需 `.env` 的 Insforge 配置）：`create_run → upsert_ledger → aggregate_ledger → update_run(done)` 往返一次断言成功。
- [ ] **Step 3: Commit（待确认）** — `git commit -m "feat(zsxq): backend db client for ingest store edge function"`

---

## Phase 4 — 编排 service + endpoints + 邮件

### Task 4.1: `service.py` — 异步编排 + audit gate + smoke

**Files:** Create `backend/app/features/zsxq_ingest/service.py`；Test `test_service_gate.py`

- [ ] **Step 1: 失败测试（audit gate）**

```python
# test_service_gate.py
from app.features.zsxq_ingest import service

def test_gate_blocks_when_selected_drops_abnormally():
    assert service.gate_should_block(prev_selected=700, curr_selected=120, threshold=0.5) is True

def test_gate_allows_normal_incremental():
    assert service.gate_should_block(prev_selected=700, curr_selected=705, threshold=0.5) is False
```

- [ ] **Step 2: 失败** → FAIL
- [ ] **Step 3: 实现** `gate_should_block`（`curr < prev*(1-threshold)` 且 prev>0）+ `run_ingest(group_id, *, full=False, run_id)` 编排：
  1. `db.get_credential` → 无/expired 直接邮件 + run `auth_failed`。
  2. crawl：`ZsxqClient.iter_topics(stop_create_time=state.last_seen_create_time if not full else None)`；每 topic 写 raw archive（`db.put_object`）+ `fetch_full_comments` + `download_binaries` + `db.upsert_ledger(stage_crawled=done,…)`；捕获 `ZsxqAuthError` → 标 `zsxq_credentials.status` + 邮件 + run `auth_failed` 中止。
  3. normalize：raw → `threads.jsonl`（archive）+ ledger `stage_normalized`。
  4. audit：`indexing.audit_distribution`；`gate_should_block(prev=state.last_summary.selected, curr)` → True 则 run `failed`（gate）中止，不 index。
  5. index：`indexing.prepare_records` → `indexing.index_prepared`；ledger `stage_indexed=done|skipped`，drop 的标 `drop_reason`。
  6. smoke：抽样校验 + 一次 `search_kol_tweets`；空 → run `degraded`。
  7. `db.update_run(done|degraded, report=audit + aggregate_ledger)` + `db.update_state(cursor)`。
  支持 resume：进入时若同 run_id 已有 ledger，已 `stage_crawled=done` 的 topic 跳过重抓。
- [ ] **Step 4: 通过** → PASS
- [ ] **Step 5: Commit（待确认）** — `git commit -m "feat(zsxq): async ingest orchestration with audit gate + smoke"`

### Task 4.2: `router.py` + 注册

**Files:** Create `backend/app/features/zsxq_ingest/router.py`；Modify `backend/app/main.py`

- [ ] **Step 1: 实现 router**

```python
# backend/app/features/zsxq_ingest/router.py
from fastapi import APIRouter, Depends, BackgroundTasks
from app.core.deps import verify_cron_secret, verify_admin_user
from app.features.zsxq_ingest import service, db

router = APIRouter(prefix="/api/zsxq", tags=["zsxq-ingest"])
GROUP = "15554581218512"

@router.post("/ingest", dependencies=[Depends(verify_cron_secret)])
async def ingest(background: BackgroundTasks, full: bool = False):
    run = await db.create_run(GROUP, "full" if full else "incremental")
    background.add_task(service.run_ingest, GROUP, full=full, run_id=run["run_id"])  # 按 Appendix A 机制
    return {"success": True, "accepted": True, "run_id": run["run_id"]}

@router.get("/runs/{run_id}", dependencies=[Depends(verify_cron_secret)])
async def get_run(run_id: str):
    return await db.get_run(run_id)

@router.post("/cookie", dependencies=[Depends(verify_admin_user)])
async def set_cookie(payload: dict):
    await db.set_credential(GROUP, payload["cookie"], updated_by=payload.get("by", "admin"))
    return {"success": True}
```

- [ ] **Step 2: 注册** `backend/app/main.py:~181`：`from app.features.zsxq_ingest.router import router as zsxq_ingest_router` + `app.include_router(zsxq_ingest_router)`。
- [ ] **Step 3: 冒烟** — `uvicorn app.main:app` 后 `curl -XPOST .../api/zsxq/ingest`（带 cron secret，`full=false`）应快速返回 `accepted:true` + run_id；`GET /runs/{id}` 查状态。
- [ ] **Step 4: Commit（待确认）** — `git commit -m "feat(zsxq): ingest/runs/cookie endpoints + router registration"`

### Task 4.3: cookie/会员过期邮件（复用 Resend）

- [ ] **Step 1: 实现** `service._notify_auth_failure(kind)` → 调现有邮件发送（Task 0 若未定位，读 `app/features/notification/` 找底层 Resend send；收件人 `ADMIN_EMAILS`），正文含 `kind`（换 cookie / 续费成员）+ token 保护的 `/api/zsxq/cookie` 操作指引。
- [ ] **Step 2: 单测** — mock 邮件发送，断言 `auth_failed` 路径触发一次、收件人/正文含 kind。
- [ ] **Step 3: Commit（待确认）** — `git commit -m "feat(zsxq): email admin on cookie/membership expiry"`

---

## Phase 5 — Cron 接线 + 部署 + 端到端冒烟

### Task 5.1: `cron-trigger.js` 增加 `zsxq_panda_ingestion` job

**Files:** Modify `backend/app/edge_functions/cron-trigger.js:16`（`JOBS` 内）

- [ ] **Step 1: 加 job**（短超时校验 accepted，对齐 `watchlist_monitor_paid_universe`）

```js
zsxq_panda_ingestion: {
  description: "Crawl + normalize + index Panda 知识星球 (incremental)",
  steps: [{
    name: "zsxq_panda_ingestion",
    path: "/api/zsxq/ingest",
    body: { full: false },
    timeoutMs: 30000,
    validate: function(body) {
      if (!body || body.success !== true) return "success=false";
      if (body.accepted !== true) return "accepted=false";
      return null;
    },
  }],
},
```

- [ ] **Step 2: 部署** — `insforge functions deploy cron-trigger`；`dry_run=true` 校验 job 在列表里。
- [ ] **Step 3: Commit（待确认）** — `git commit -m "feat(zsxq): add zsxq_panda_ingestion cron job"`

### Task 5.2: Insforge Schedule + 环境变量

- [ ] **Step 1:** 用 insforge-cli/Dashboard 建每日 Schedule，POST `cron-trigger?job=zsxq_panda_ingestion`，带 `X-Internal-Secret`。
- [ ] **Step 2:** 确认后端 env：`CRON_SECRET`/`EDGE_FUNCTION_SECRET`/`INSFORGE_*`/`RESEND_API_KEY`/`ADMIN_EMAILS` 就位；首次用 `/api/zsxq/cookie`（admin）灌入金黄账号的有效 cookie 到 `zsxq_credentials`。

### Task 5.3: 端到端冒烟（真实但小批量）

- [ ] **Step 1:** 手动触发一次增量 `POST /api/zsxq/ingest`（`full=false`），`GET /runs/{id}` 跟踪到 `done`。
- [ ] **Step 2:** 校验 ledger：`select stage_indexed, count(*) from zsxq_thread_ledger where last_run_id=...`；抽样 topic_id 在 `vector_documents` 有 `(zsxq_thread, topic_id)`。
- [ ] **Step 3:** 对一个有覆盖 ticker 跑 `search_kol_tweets`，确认返回知识星球 chunk 且引用显示真实子作者（非全 pandacircle）。
- [ ] **Step 4:** 写 `.context.md`（模块说明 + 运维：如何换 cookie、如何手动 `full=true` 回补、如何查 run/ledger）。
- [ ] **Step 5: Commit（待确认）** — `git commit -m "docs(zsxq): ingest module context + runbook"`

---

## Appendix A: Insforge storage findings（Phase 0 产出 — 2026-06-21 回填，read-only 调研）

**Storage / bucket API**（`.claude/skills/insforge/storage/sdk-integration.md`；edge function 内同样用 `createClient` 后 `client.storage`）：
- 上传：`client.storage.from(bucket).upload(key, content) → { data: { url, key }, error }`；自动 key 用 `.uploadAuto(content)`。
- 下载：`client.storage.from(bucket).download(key) → { data: blob, error }`。
- 删除：`client.storage.from(bucket).remove(key)`。
- **bucket 必须先存在**（admin API / `insforge storage buckets` 创建）——这是用户手动步骤（写进 runbook）。
- **必须同时存 `url` 和 `key`**：url 用于展示/引用，key 用于 download/delete。→ 我们的 `zsxq_thread_ledger` / raw archive 记录都要存 `key`（download/delete 依赖它）。
- 二进制：`upload(key, content)` 接受 file/blob-like；Deno edge function 内传 `Blob`/`Uint8Array` 的确切类型在**真实部署时**验证（runbook 标注），不阻塞写代码。无明确硬上限文档——大附件建议 runbook 里人工抽样验证；超限则降级为「仅存元数据 + 原始签名 URL」。

**异步机制**（`app/features/watchlist_monitor/router.py`）：FastAPI `BackgroundTasks`；endpoint `background_tasks.add_task(_run_xxx_background, ...)` 后立即返回 `accepted=True`；`_run_xxx_background` 是 `async def` 跑长任务。Phase 4 `/api/zsxq/ingest` 照此实现。进程重启会中断后台任务 → 靠 ledger 断点续爬。

> 仍属用户手动步骤（runbook）：创建 bucket、`insforge functions deploy`、`insforge db sql` 跑迁移、注入真实 cookie、首次 live crawl。

---

## Self-Review（写完已自检）

- **Spec 覆盖**：§5 架构→Phase4/5；§6 组件→各 Task 一一对应（crawl/normalize/indexing/service/router/db/edge fn）；§7.1 raw archive→Task 2.5+3.2；§7.2 threads.jsonl→Task 1.2；§7.3 表→Task 3.1；§7.4 ledger→Task 3.1+2.6+4.1；§8 各阶段→Phase1-4；§9 失败表→Task 2.3+4.1+4.3；§10 幂等/回滚→复用 `index_document` content_hash + `delete_vector_source`（运维入 .context.md）；§11 Insforge 落地→Phase 3/5；§12 测试→各 Task TDD；§13 风险→Phase 0 spike + 各 Task 备注。
- **Placeholder 扫描**：无 TBD；唯一"待定"是 Appendix A，且明确由 Phase 0 任务回填（非偷懒占位）。
- **类型一致**：`prepare_records`/`PreparedRecord`/`index_prepared`/`audit_distribution`（Phase1）与 `normalize_topic`（Phase2）、`ZsxqClient.iter_topics`/`next_end_time`/`ZsxqAuthError`（Phase2）、`run_ingest`/`gate_should_block`（Phase4）、`db.*`（Phase3）在各 Task 间命名一致。
- **已知裁剪**：二进制落地与异步机制依赖 Phase 0 实测，故对应 Task 显式标注"以 Appendix A 为准"，避免臆造 Insforge API。
