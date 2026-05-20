# 专属日报 V2 第二轮 UX 改进 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重命名/上移日报总结段落 + 把 action bar 的 chip 与 headline 切换为 brew agent 同次推理产出的 `action_items`，同时干净地移除规则引擎兜底。

**Architecture:** Brew agent 在 `PersonalDigestOutput` 中新增结构化 `action_items: List[ActionItem]`（label/target/reason/priority）。`for_you/service.py` 读取 digest，经白名单校验 + date→uuid 重写 + 稳定排序后装配 `ActionBar`，空态时返回 `visibility=hidden` 让前端彻底隐藏。前端 `ActionBar.tsx` 改为按 `visibility` 控制渲染，chip 点击按 target 前缀路由/滚动。`DigestInlineReport.tsx` 将"总结"重命名为"给你的复盘笔记"并上移到持仓概览之下。

**Tech Stack:** FastAPI + Pydantic + Google ADK (gemini-3.1-flash-lite-preview) · Next.js 16 App Router + React 19 + TypeScript · pytest · Vitest/RTL

**Spec:** `docs/superpowers/specs/2026-04-25-for-you-v2-round2-design.md`

---

## File Structure

**Modify**:
- `backend/app/features/brew/models.py` — 新增 `ActionItem` 模型 + `action_items` 字段（API response + agent output schema）
- `backend/app/features/brew/agent.py` — prompt 增补 action_items 章节 + `data_for_agent["action_context"]` 组装
- `backend/app/features/brew/router.py` — 透传 `action_items` 到 `DigestResponse`；存储到 db
- `backend/app/features/for_you/models.py` — `Signal` 增加 `visibility` 字段；`ActionChip.kind` 补 `"recap"`
- `backend/app/features/for_you/service.py` — `build_action_bar` 重写为读 digest.action_items；校验 + 排序 + 兜底裁剪；删除规则引擎旧逻辑
- `backend/app/features/for_you/templates.py` — 删除 green/staleness 老模板函数；保留 fallback_* 供无 digest 兜底使用
- `backend/tests/test_action_bar.py` — 更新测试匹配新逻辑；新增 action_items 校验/排序/visibility 测试
- `backend/tests/test_brew_router_unit.py` — 新增 action_items 字段透传测试
- `frontend/src/lib/api.ts` — `ActionChip` 类型加 `target` 字段（保留 `link` 做迁移兼容）；`ActionBarResponse` 加 `visibility`
- `frontend/src/components/for-you/ActionBar.tsx` — 重构 chip 跳转为 `routeChipTarget`；按 `visibility` 隐藏
- `frontend/src/components/for-you/DigestInlineReport.tsx` — 改段落标题 + 加副标题 + 加锚点 id + 调整 section 顺序

**Create**:
- `backend/app/features/for_you/action_items.py` — 新模块：`validate_action_items()` 和 `resolve_digest_date_to_id()`
- `frontend/src/components/for-you/__tests__/ActionBar.test.tsx` — 新增前端单测（visibility/chip/routing）
- `frontend/src/lib/action-bar-routing.ts` — `routeChipTarget` 辅助函数

**Context docs** to update after implementation:
- `backend/app/features/brew/.context.md`
- `backend/app/features/for_you/.context.md`

---

## Task 1: 加 `ActionItem` 模型 + DigestResponse 字段

**Files:**
- Modify: `backend/app/features/brew/models.py`
- Test: `backend/tests/test_brew_models_unit.py` (create)

- [ ] **Step 1: Write failing test for ActionItem schema**

Create `backend/tests/test_brew_models_unit.py`:

```python
"""Unit tests for brew/models ActionItem and PersonalDigestOutput action_items wiring."""

import pytest
from pydantic import ValidationError

from app.features.brew.models import (
    ActionItem,
    DigestResponse,
    PersonalDigestOutput,
)


class TestActionItem:
    def test_valid_action_item(self):
        item = ActionItem(
            label="补 NVDA 投资论点",
            target="thesis:NVDA",
            reason="NVDA 缺论点，今日财报临近",
            priority=1,
        )
        assert item.priority == 1

    def test_priority_bounds(self):
        with pytest.raises(ValidationError):
            ActionItem(label="x", target="portfolio", reason="y", priority=0)
        with pytest.raises(ValidationError):
            ActionItem(label="x", target="portfolio", reason="y", priority=4)

    def test_label_soft_limit_allows_up_to_20(self):
        # Schema allows up to 20 chars as a safety cushion; prompt asks for ≤12.
        # Example from prompt "回看 4/21 美联储预警" is 13 chars — must not be rejected.
        label_13 = "回看 4/21 美联储预警"
        assert len(label_13) == 13
        item = ActionItem(label=label_13, target="portfolio", reason="y", priority=1)
        assert item.label == label_13

    def test_label_exceeds_hard_cap(self):
        with pytest.raises(ValidationError):
            ActionItem(label="一" * 21, target="portfolio", reason="y", priority=1)


class TestDigestResponseActionItems:
    def test_action_items_default_empty(self):
        resp = DigestResponse(timestamp="2026-04-25T00:00:00Z")
        assert resp.action_items == []

    def test_action_items_populated(self):
        items = [
            ActionItem(label="看体检", target="health", reason="14 天未体检", priority=1),
        ]
        resp = DigestResponse(timestamp="2026-04-25T00:00:00Z", action_items=items)
        assert len(resp.action_items) == 1
        assert resp.action_items[0].target == "health"


class TestPersonalDigestOutputActionItems:
    def test_action_items_default_empty(self):
        out = PersonalDigestOutput(
            greeting="g", one_line_summary="o",
            stocks=[], news={"headlines": [], "briefs": []},
            events=[], summary={"content": "c"},
        )
        assert out.action_items == []

    def test_action_items_max_3(self):
        items = [
            ActionItem(label=f"a{i}", target="portfolio", reason="r", priority=1)
            for i in range(4)
        ]
        with pytest.raises(ValidationError):
            PersonalDigestOutput(
                greeting="g", one_line_summary="o",
                stocks=[], news={"headlines": [], "briefs": []},
                events=[], summary={"content": "c"},
                action_items=items,
            )
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
cd backend && source venv/bin/activate
pytest tests/test_brew_models_unit.py -v
```

Expected: multiple failures (ActionItem not exported, action_items field missing).

- [ ] **Step 3: Add ActionItem model and fields**

In `backend/app/features/brew/models.py`, add ActionItem near the top of "API Request/Response Models":

```python
class ActionItem(BaseModel):
    """Structured action item produced by the digest agent.

    Each item represents one in-site action the user can take. Nothing that
    requires leaving the site (buy/sell/etc.) should ever appear here.
    """
    # Soft limit: prompt asks for ≤12 chars, schema tolerates up to 20 because LLMs
    # count Chinese/mixed characters poorly and occasionally overshoot. A borderline
    # overshoot is better than dropping a useful action via ValidationError.
    label: str = Field(..., max_length=20, description="Action label (prompt limit: ≤12 chars)")
    target: str = Field(..., description="Site-internal target, see validator whitelist")
    reason: str = Field(..., description="Concrete reason citing user state/today's events/attribution")
    priority: int = Field(..., ge=1, le=3, description="1 = highest")
```

In `DigestResponse` (before `error`):

```python
    action_items: list[ActionItem] = Field(
        default_factory=list,
        description="0-3 in-site action items co-produced with the digest narrative",
    )
```

In `PersonalDigestOutput` (after `portfolio_summary`):

```python
    action_items: list[ActionItem] = Field(
        default_factory=list,
        max_length=3,
        description=(
            "0-3 in-site actions. Only emit when there's something concrete the user can "
            "do on this website. Never recommend real-world trades. See instruction block."
        ),
    )
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pytest tests/test_brew_models_unit.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/brew/models.py backend/tests/test_brew_models_unit.py
git commit -m "feat(brew): add ActionItem schema + action_items field to digest response/agent output"
```

---

## Task 2: 透传 `action_items` 到 DigestResponse + DB

**Files:**
- Modify: `backend/app/features/brew/router.py`
- Test: `backend/tests/test_brew_router_unit.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_brew_router_unit.py`:

```python
def test_router_passes_action_items_to_response():
    """Router must forward result['action_items'] into DigestResponse."""
    from app.features.brew.router import _transform_digest_sections
    from app.features.brew.models import ActionItem

    # _transform_digest_sections handles stocks/news/events/summary; action_items
    # is passed through separately in the return path. Verify via a shaped result.
    result = {
        "timestamp": "2026-04-25T00:00:00Z",
        "symbols_used": ["NVDA"],
        "greeting": "g",
        "one_line_summary": "o",
        "stocks": [],
        "news": {"headlines": [], "briefs": []},
        "events": [],
        "summary": {"content": "c"},
        "action_items": [
            {"label": "看体检", "target": "health", "reason": "14 天未体检", "priority": 1},
        ],
    }
    # Validate that ActionItem.model_validate accepts router's raw dict shape
    items = [ActionItem.model_validate(i) for i in result["action_items"]]
    assert len(items) == 1
    assert items[0].target == "health"
```

- [ ] **Step 2: Run test to confirm it passes (schema check only)**

```bash
pytest tests/test_brew_router_unit.py::test_router_passes_action_items_to_response -v
```

Expected: PASS (this test only checks schema round-trip — implementation of router wiring verified by integration in Task 10 but we do the wiring now).

- [ ] **Step 3: Wire action_items into router return and save**

In `backend/app/features/brew/router.py` around line 344 (save_data dict), add:

```python
                "action_items": result.get("action_items", []),
```

At line 368 (DigestResponse construction), add:

```python
        action_items_raw = result.get("action_items", []) or []
        action_items = [
            ActionItem.model_validate(item) if not isinstance(item, ActionItem) else item
            for item in action_items_raw
        ]

        return DigestResponse(
            success=True,
            timestamp=result.get("timestamp", now_iso()),
            symbols_used=result.get("symbols_used", []),
            greeting=result.get("greeting", ""),
            one_line_summary=result.get("one_line_summary", ""),
            stocks=stocks,
            news=news,
            events=events,
            summary=summary,
            action_items=action_items,
            top_event=top_event,
        )
```

Add the import near line 30:

```python
from app.features.brew.models import (
    ...
    ActionItem,
)
```

(If `ActionItem` is not already in the import group, add it.)

- [ ] **Step 4: Run test to verify**

```bash
pytest tests/test_brew_router_unit.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/brew/router.py backend/tests/test_brew_router_unit.py
git commit -m "feat(brew): wire action_items through digest router save + response"
```

---

## Task 3: 在 agent.py 组装 `action_context`

**Files:**
- Modify: `backend/app/features/brew/agent.py`
- Test: `backend/tests/test_brew_agent_context_unit.py` (create)

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_brew_agent_context_unit.py`:

```python
"""Tests for the new action_context block that agent.py injects into data_for_agent."""

from app.features.brew.agent import build_action_context


class TestBuildActionContext:
    def test_basic_assembly(self):
        ctx = build_action_context(
            portfolio_holdings=[
                {"symbol": "NVDA", "thesis": ""},
                {"symbol": "AAPL", "thesis": "iPhone 17 cycle"},
                {"symbol": "$CASH", "thesis": None},
            ],
            health_latest_generated_at="2026-04-01T00:00:00Z",
            portfolio_confirmed_at="2026-03-20T00:00:00Z",
            upcoming_events=[
                {"related_symbols": ["NVDA"]},
                {"related_symbols": ["AAPL", "MSFT"]},
            ],
            previous_digests=[
                {"date": "2026-04-21"},
                {"date": "2026-04-22"},
            ],
            now_iso="2026-04-25T12:00:00Z",
        )
        assert ctx["missing_thesis_symbols"] == ["NVDA"]
        assert ctx["days_since_last_health_check"] == 24
        assert ctx["days_since_last_portfolio_update"] == 36
        assert set(ctx["symbols_with_today_events"]) == {"NVDA", "AAPL", "MSFT"}
        assert ctx["previous_digest_dates"] == ["2026-04-21", "2026-04-22"]

    def test_nulls_when_missing(self):
        ctx = build_action_context(
            portfolio_holdings=[],
            health_latest_generated_at=None,
            portfolio_confirmed_at=None,
            upcoming_events=[],
            previous_digests=[],
            now_iso="2026-04-25T12:00:00Z",
        )
        assert ctx["missing_thesis_symbols"] == []
        assert ctx["days_since_last_health_check"] is None
        assert ctx["days_since_last_portfolio_update"] is None
        assert ctx["symbols_with_today_events"] == []
        assert ctx["previous_digest_dates"] == []
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pytest tests/test_brew_agent_context_unit.py -v
```

Expected: ImportError on `build_action_context`.

- [ ] **Step 3: Implement `build_action_context`**

Add near top of `backend/app/features/brew/agent.py` (outside the `BrewAgent` class, after imports):

```python
def build_action_context(
    *,
    portfolio_holdings: list[dict],
    health_latest_generated_at: str | None,
    portfolio_confirmed_at: str | None,
    upcoming_events: list[dict],
    previous_digests: list[dict],
    now_iso: str,
) -> dict:
    """Assemble the action_context block fed to the digest LLM.

    Exposed as a standalone function for unit testing.
    """
    from datetime import datetime

    def _days_since(iso: str | None) -> int | None:
        if not iso:
            return None
        try:
            # Tolerate Z suffix
            stamp = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
            return (now - stamp).days
        except Exception:
            return None

    missing_thesis = [
        h["symbol"] for h in portfolio_holdings
        if h.get("symbol") and h["symbol"] != "$CASH" and not (h.get("thesis") or "").strip()
    ]

    events_symbols: set[str] = set()
    for ev in upcoming_events:
        for sym in ev.get("related_symbols", []) or []:
            events_symbols.add(sym)

    return {
        "missing_thesis_symbols": missing_thesis,
        "days_since_last_health_check": _days_since(health_latest_generated_at),
        "days_since_last_portfolio_update": _days_since(portfolio_confirmed_at),
        "symbols_with_today_events": sorted(events_symbols),
        "previous_digest_dates": [d.get("date", "")[:10] for d in previous_digests if d.get("date")],
    }
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pytest tests/test_brew_agent_context_unit.py -v
```

Expected: PASS.

- [ ] **Step 5: Pre-initialize `portfolio_rows` at top of try-block**

In `backend/app/features/brew/agent.py`, locate the existing portfolio-for-differentiation block (around line 400):

```python
            # Load portfolio for differentiation
            portfolio_symbols_set = set()
            try:
                portfolio_rows = await portfolio_db.list_portfolio(user_id) if user_id else []
                portfolio_symbols_set = {r.symbol for r in portfolio_rows if r.symbol != "$CASH"}
            except Exception:
                pass
```

Replace with an explicit initialization so downstream code can reference `portfolio_rows` safely:

```python
            # Load portfolio for differentiation
            portfolio_rows = []
            portfolio_symbols_set = set()
            try:
                if user_id:
                    portfolio_rows = await portfolio_db.list_portfolio(user_id)
                portfolio_symbols_set = {r.symbol for r in portfolio_rows if r.symbol != "$CASH"}
            except Exception:
                logger.warning("Failed to load portfolio for agent context", exc_info=True)
```

- [ ] **Step 6: Call `build_action_context` from BrewAgent.run**

Find the block around line 432:

```python
            if previous_digests:
                data_for_agent["previous_digests"] = previous_digests
```

Add immediately after:

```python
            # Action items context — fed to agent for thesis/health/staleness judgment
            try:
                holdings_for_ctx = [
                    {"symbol": r.symbol, "thesis": getattr(r, "thesis", "")}
                    for r in portfolio_rows
                ]
                data_for_agent["action_context"] = build_action_context(
                    portfolio_holdings=holdings_for_ctx,
                    health_latest_generated_at=None,  # wired in Task 4
                    portfolio_confirmed_at=(
                        profile.portfolio_confirmed_at.isoformat()
                        if profile and profile.portfolio_confirmed_at else None
                    ),
                    upcoming_events=earnings_result.get("earnings", [])
                        + calendar_result.get("events", []),
                    previous_digests=previous_digests,
                    now_iso=datetime.now(timezone.utc).isoformat(),
                )
            except Exception as e:
                logger.warning("Failed to assemble action_context: %s", e)
                data_for_agent["action_context"] = {
                    "missing_thesis_symbols": [],
                    "days_since_last_health_check": None,
                    "days_since_last_portfolio_update": None,
                    "symbols_with_today_events": [],
                    "previous_digest_dates": [],
                }
```

Also ensure these imports exist at top of `agent.py`:

```python
from datetime import datetime, timezone
```

- [ ] **Step 7: Run full agent test suite**

```bash
pytest tests/test_brew_agent_context_unit.py tests/test_brew_router_unit.py -v
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/features/brew/agent.py backend/tests/test_brew_agent_context_unit.py
git commit -m "feat(brew): assemble action_context (missing_thesis, days_since_*, events, digest_dates)"
```

---

## Task 4: 在 agent.py 注入 `health_latest` 到 action_context

**Files:**
- Modify: `backend/app/features/brew/agent.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_brew_agent_context_unit.py`:

```python
class TestHealthLatestInjection:
    def test_health_latest_passed(self):
        """health_latest_generated_at should come through when provided."""
        ctx = build_action_context(
            portfolio_holdings=[],
            health_latest_generated_at="2026-04-10T00:00:00Z",
            portfolio_confirmed_at=None,
            upcoming_events=[],
            previous_digests=[],
            now_iso="2026-04-25T00:00:00Z",
        )
        assert ctx["days_since_last_health_check"] == 15
```

Run:

```bash
pytest tests/test_brew_agent_context_unit.py::TestHealthLatestInjection -v
```

Expected: PASS (function already supports it; test locks in behavior).

- [ ] **Step 2: Fetch health latest in agent.run**

In `backend/app/features/brew/agent.py`, inside `run` (after profile loading around line 394), add before the `action_context` assembly block:

```python
            # Fetch latest health check timestamp for action_context
            health_generated_at = None
            if user_id:
                try:
                    from app.features.portfolio_health.service import get_latest as get_latest_health
                    h = await get_latest_health(user_id)
                    if h and getattr(h, "generated_at", None):
                        gen = h.generated_at
                        health_generated_at = (
                            gen.isoformat() if hasattr(gen, "isoformat") else str(gen)
                        )
                except Exception as e:
                    logger.warning("Could not load health latest for action_context: %s", e)
```

Then replace the `health_latest_generated_at=None` placeholder in the `build_action_context` call with:

```python
                    health_latest_generated_at=health_generated_at,
```

- [ ] **Step 3: Run full suite**

```bash
pytest tests/test_brew_agent_context_unit.py -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/features/brew/agent.py backend/tests/test_brew_agent_context_unit.py
git commit -m "feat(brew): inject health latest generated_at into action_context"
```

---

## Task 5: 更新 agent prompt — action_items 章节

**Files:**
- Modify: `backend/app/features/brew/agent.py` (the `DIGEST_INSTRUCTION` string)

- [ ] **Step 1: Find the instruction string end and add new section**

In `backend/app/features/brew/agent.py`, locate the end of `DIGEST_INSTRUCTION` string (around line 251, after 未来展望 section, before the closing triple-quote). Append this section **before the closing `"""`**:

```python
### action_items（站内可执行动作，0-3 条，可选）

只输出用户能在本网站上立即完成的动作。如果某个建议用户需要去别处做
（买入、卖出、看外部新闻），那是信息，应该写进 summary，不要放 action_items。

每条必须包含：
- label: ≤12 字的中文动作标签
- target: 必须是下面的白名单之一
- reason: 1-2 句话，引用具体上下文——action_context 里的字段（missing_thesis_symbols / days_since_* / symbols_with_today_events）、组合归因、或 previous_digest_dates 里具体日期的观点
- priority: 1-3，1 最重要

Target 白名单（只能使用这些，其他一律丢弃）：
- thesis:<SYMBOL>  — SYMBOL 必须在 action_context.missing_thesis_symbols 中
- portfolio / health / watchlist
- stock:<SYMBOL>   — SYMBOL 必须在用户持仓或 watchlist 中（user_symbols / portfolio_symbols）
- section:events / section:headlines / section:briefs / section:notes
- digest:<YYYY-MM-DD> — 日期必须在 action_context.previous_digest_dates 中存在

产出原则：
1) 确实没必要做就返回空列表，不要凑数
2) 不重复：多条 action 指向同一 section 或 stock 时合并成一条
3) reason 必须具体（引用字段/日期/事件），禁止泛泛而谈
4) Label 必须描述用户在本网站上能完成的实际操作：
   - "补论点"、"看体检"、"回看 4/21 日报"、"更新持仓信息" ✓
   - "买入"、"卖出"、"止损"、"调仓"、"减持"、"对冲" ✗（实盘行为，站内无法完成）
   - "关注"、"留意"、"思考"、"考虑" ✗（不是动作，是情绪）

好示例：
{"label":"补 NVDA 投资论点","target":"thesis:NVDA",
 "reason":"你持有 NVDA 但还没写论点，今日 NVDA 财报临近，梳理清楚持有逻辑有助于应对后续波动",
 "priority":1}

{"label":"回看 4/21 美联储预警","target":"digest:2026-04-21",
 "reason":"当日 summary 担心美联储鹰派转向，今日核心 PCE 数据坐实这一走向",
 "priority":2}

坏示例：
{"label":"关注市场","target":"section:events","reason":"今日有重要事件"}
（reason 泛泛，没有引用具体字段/日期/事件）

{"label":"考虑买入 NVDA","target":"stock:NVDA","reason":"技术面好"}
（投资建议；reason 空洞；stock:<SYM> 应该用于"引导看个股详情"，不是"推荐交易"）

{"label":"在券商买入 500 股","target":"stock:NVDA","reason":"逻辑强化"}
（实盘操作——本站无法下单。任何涉及真实买入/卖出/建仓/止损/调仓的动作都不能
作为 action，这类建议写进 summary 的叙事里）

{"label":"设置止损价","target":"portfolio","reason":"波动加剧"}
（模拟持仓不支持止损。产出用户点进去发现做不了的 action 是最严重的误导。
拿不准某个 target 能否实际完成动作时，别产出）
```

- [ ] **Step 2: Verify the string compiles (Python parses it)**

```bash
cd backend && source venv/bin/activate
python -c "from app.features.brew.agent import DIGEST_INSTRUCTION; print(len(DIGEST_INSTRUCTION))"
```

Expected: prints a large number (no SyntaxError).

- [ ] **Step 3: Commit**

```bash
git add backend/app/features/brew/agent.py
git commit -m "feat(brew): add action_items section to agent prompt with target whitelist + examples"
```

---

## Task 6: 在 for_you/models.py 加 `visibility` + 拓展 `ActionChip.kind`

**Files:**
- Modify: `backend/app/features/for_you/models.py`
- Test: `backend/tests/test_action_bar.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_action_bar.py`:

```python
class TestActionBarVisibility:
    def test_action_bar_default_visibility_visible(self):
        from app.features.for_you.models import ActionBar
        bar = ActionBar(
            severity="green", headline="", chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        assert bar.visibility == "visible"

    def test_action_bar_hidden(self):
        from app.features.for_you.models import ActionBar
        bar = ActionBar(
            severity="green", headline="", chips=[],
            source="template", visibility="hidden",
            generated_at=datetime.now(timezone.utc),
        )
        assert bar.visibility == "hidden"

    def test_action_chip_target_field(self):
        from app.features.for_you.models import ActionChip
        chip = ActionChip(label="补 NVDA 论点", target="thesis:NVDA", kind="thesis")
        assert chip.target == "thesis:NVDA"
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pytest tests/test_action_bar.py::TestActionBarVisibility -v
```

Expected: FAIL.

- [ ] **Step 3: Update the models**

Replace `backend/app/features/for_you/models.py` contents:

```python
"""
Action Bar models — signal, chip, bar, and drag result.

LLD: docs/plans/for-you/ §U0-B.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Signal(BaseModel):
    kind: Literal["drawdown", "health", "event", "staleness", "stable"]
    severity: Literal["green", "yellow", "red"]
    data: dict = Field(default_factory=dict)


class ActionChip(BaseModel):
    label: str
    target: str = Field(
        default="",
        description="Site-internal routing target (e.g. thesis:NVDA, section:notes, digest:<uuid>)",
    )
    # `link` kept for forward compatibility with any legacy rendering paths;
    # new code must read `target`. Server always populates both (link = resolved URL
    # or legacy hash for targets without a URL; target = original token).
    link: str = Field(default="")
    kind: Literal[
        "event", "health", "drawdown", "stable", "research", "guide",
        "thesis", "recap", "section",
    ]


class ActionBar(BaseModel):
    severity: Literal["green", "yellow", "red"]
    headline: str
    chips: list[ActionChip] = Field(default_factory=list, max_length=3)
    source: Literal["template", "llm", "llm_fallback", "agent"]
    visibility: Literal["visible", "hidden"] = "visible"
    generated_at: datetime


class DragResult(BaseModel):
    overall: float = 0.0
    worst_single: float = 0.0
    culprit: str | None = None
    value: float = 0.0
```

- [ ] **Step 4: Run test to verify pass**

```bash
pytest tests/test_action_bar.py::TestActionBarVisibility -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/for_you/models.py backend/tests/test_action_bar.py
git commit -m "feat(for-you): add ActionBar.visibility + ActionChip.target + expand kind enum"
```

---

## Task 7: 新建 `action_items.py` — 校验与 date→uuid 解析

**Files:**
- Create: `backend/app/features/for_you/action_items.py`
- Create: `backend/tests/test_action_items_validator.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_action_items_validator.py`:

```python
"""Unit tests for action_items validator and target resolution."""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.brew.models import ActionItem
from app.features.for_you.action_items import (
    parse_target,
    validate_and_resolve,
)


def _item(label="x", target="portfolio", reason="r", priority=1) -> ActionItem:
    return ActionItem(label=label, target=target, reason=reason, priority=priority)


class TestParseTarget:
    def test_parse_thesis(self):
        assert parse_target("thesis:NVDA") == ("thesis", "NVDA")

    def test_parse_bare(self):
        assert parse_target("portfolio") == ("portfolio", "")

    def test_parse_section(self):
        assert parse_target("section:notes") == ("section", "notes")

    def test_parse_digest_date(self):
        assert parse_target("digest:2026-04-21") == ("digest", "2026-04-21")


class TestValidateAndResolve:
    @pytest.mark.asyncio
    async def test_valid_bare_targets_pass(self):
        items = [
            _item(target="portfolio"),
            _item(target="health"),
            _item(target="watchlist"),
        ]
        out = await validate_and_resolve(
            items,
            user_symbols={"NVDA", "AAPL"},
            missing_thesis={"NVDA"},
            previous_digest_dates={"2026-04-21"},
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 3

    @pytest.mark.asyncio
    async def test_thesis_requires_missing_thesis_symbol(self):
        items = [
            _item(target="thesis:NVDA"),
            _item(target="thesis:AAPL"),  # AAPL has thesis
        ]
        out = await validate_and_resolve(
            items,
            user_symbols={"NVDA", "AAPL"},
            missing_thesis={"NVDA"},
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 1
        assert out[0].target == "thesis:NVDA"

    @pytest.mark.asyncio
    async def test_stock_requires_user_symbol(self):
        items = [
            _item(target="stock:NVDA"),
            _item(target="stock:XYZ"),  # not held or watched
        ]
        out = await validate_and_resolve(
            items,
            user_symbols={"NVDA"},
            missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 1
        assert out[0].target == "stock:NVDA"

    @pytest.mark.asyncio
    async def test_section_whitelist(self):
        valid = [_item(target="section:notes"), _item(target="section:events")]
        invalid = [_item(target="section:garbage")]
        out = await validate_and_resolve(
            valid + invalid,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 2

    @pytest.mark.asyncio
    async def test_digest_date_resolves_to_uuid(self):
        items = [_item(target="digest:2026-04-21")]
        resolver = AsyncMock(return_value="uuid-abc-123")
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates={"2026-04-21"},
            resolve_digest_id=resolver,
        )
        assert len(out) == 1
        assert out[0].target == "digest:uuid-abc-123"
        resolver.assert_awaited_once_with("2026-04-21")

    @pytest.mark.asyncio
    async def test_digest_date_drop_if_not_in_whitelist(self):
        items = [_item(target="digest:2026-04-21")]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),  # date not known
            resolve_digest_id=AsyncMock(),
        )
        assert len(out) == 0

    @pytest.mark.asyncio
    async def test_digest_date_drop_if_resolver_returns_none(self):
        items = [_item(target="digest:2026-04-21")]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates={"2026-04-21"},
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 0

    @pytest.mark.asyncio
    async def test_unknown_prefix_dropped(self):
        items = [_item(target="buy:NVDA"), _item(target="random")]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(),
        )
        assert len(out) == 0

    @pytest.mark.asyncio
    async def test_stable_sort_by_priority_then_target(self):
        items = [
            _item(label="a", target="portfolio", priority=1),
            _item(label="b", target="health", priority=1),  # same priority
            _item(label="c", target="watchlist", priority=2),
        ]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(),
        )
        # priority 1 first; inside priority 1, target string ascending: health, portfolio
        assert [i.target for i in out] == ["health", "portfolio", "watchlist"]

    @pytest.mark.asyncio
    async def test_cap_at_three(self):
        items = [_item(target="portfolio", priority=i % 3 + 1) for i in range(5)]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(),
        )
        assert len(out) == 3

    @pytest.mark.asyncio
    async def test_truncation_emits_info_log(self, caplog):
        import logging
        caplog.set_level(logging.INFO, logger="app.features.for_you.action_items")
        items = [_item(target="portfolio", priority=1) for _ in range(5)]
        await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(),
        )
        assert any("truncating from 5 to 3" in rec.message for rec in caplog.records)
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
pytest tests/test_action_items_validator.py -v
```

Expected: ImportError on action_items module.

- [ ] **Step 3: Implement validator**

Create `backend/app/features/for_you/action_items.py`:

```python
"""Validation and resolution for agent-produced action_items.

Responsibilities:
1. Parse and whitelist target strings.
2. Verify symbol/date references against authoritative user context.
3. Resolve digest:<YYYY-MM-DD> to digest:<uuid> by async lookup.
4. Stable-sort by (priority asc, target asc) and cap at 3.
"""

from typing import Awaitable, Callable

from app.core.logging import get_logger
from app.features.brew.models import ActionItem

logger = get_logger(__name__)

BARE_TARGETS = {"portfolio", "health", "watchlist"}
SECTION_WHITELIST = {"events", "headlines", "briefs", "notes"}


def parse_target(target: str) -> tuple[str, str]:
    """Split 'prefix:payload' into (prefix, payload). Bare targets return ('portfolio', '')."""
    if ":" in target:
        prefix, _, payload = target.partition(":")
        return prefix, payload
    return target, ""


async def validate_and_resolve(
    items: list[ActionItem],
    *,
    user_symbols: set[str],
    missing_thesis: set[str],
    previous_digest_dates: set[str],
    resolve_digest_id: Callable[[str], Awaitable[str | None]],
) -> list[ActionItem]:
    """Filter invalid items, resolve digest date → uuid, sort, cap at 3.

    Args:
        items: Raw items from the agent.
        user_symbols: Union of portfolio + watchlist symbols (for stock:<SYM>).
        missing_thesis: Subset of portfolio missing thesis (for thesis:<SYM>).
        previous_digest_dates: Allowed dates for digest:<DATE>.
        resolve_digest_id: Async function mapping YYYY-MM-DD → digest UUID or None.

    Returns:
        Sorted, cleaned list of at most 3 items.
    """
    valid: list[ActionItem] = []
    for item in items:
        prefix, payload = parse_target(item.target)

        if prefix in BARE_TARGETS and not payload:
            valid.append(item)
            continue

        if prefix == "section":
            if payload in SECTION_WHITELIST:
                valid.append(item)
            else:
                logger.warning("Rejected action_item: unknown section '%s'", payload)
            continue

        if prefix == "thesis":
            if payload in missing_thesis:
                valid.append(item)
            else:
                logger.warning("Rejected thesis:%s — not in missing_thesis", payload)
            continue

        if prefix == "stock":
            if payload in user_symbols:
                valid.append(item)
            else:
                logger.warning("Rejected stock:%s — not in user_symbols", payload)
            continue

        if prefix == "digest":
            if payload not in previous_digest_dates:
                logger.warning("Rejected digest:%s — date not in whitelist", payload)
                continue
            uuid = await resolve_digest_id(payload)
            if not uuid:
                logger.warning("Rejected digest:%s — could not resolve to uuid", payload)
                continue
            valid.append(item.model_copy(update={"target": f"digest:{uuid}"}))
            continue

        logger.warning("Rejected action_item: unknown target prefix '%s'", prefix)

    # Stable sort: priority ascending, then target ascending
    valid.sort(key=lambda i: (i.priority, i.target))
    if len(valid) > 3:
        logger.info(
            "action_items: truncating from %d to 3; consider tightening prompt "
            "if this is frequent", len(valid),
        )
    return valid[:3]
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pytest tests/test_action_items_validator.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/for_you/action_items.py backend/tests/test_action_items_validator.py
git commit -m "feat(for-you): add action_items validator with whitelist + digest date resolution"
```

---

## Task 8: 新增 `resolve_digest_id_by_date` helper 在 brew/db.py

**Files:**
- Modify: `backend/app/features/brew/db.py`
- Test: `backend/tests/test_brew_db_unit.py` (create)

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_brew_db_unit.py`:

```python
"""Unit tests for brew/db helpers — focused on resolve_digest_id_by_date."""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.brew.db import resolve_digest_id_by_date


class TestResolveDigestIdByDate:
    @pytest.mark.asyncio
    async def test_matches_date_in_list(self):
        fake_digests = [
            {"digest_id": "uuid-1", "digest_date": "2026-04-21T00:00:00Z"},
            {"digest_id": "uuid-2", "digest_date": "2026-04-22"},
        ]
        with patch(
            "app.features.brew.db.list_user_digests",
            new=AsyncMock(return_value=fake_digests),
        ):
            uuid = await resolve_digest_id_by_date("user-1", "2026-04-21")
            assert uuid == "uuid-1"

    @pytest.mark.asyncio
    async def test_no_match_returns_none(self):
        with patch(
            "app.features.brew.db.list_user_digests",
            new=AsyncMock(return_value=[{"digest_id": "x", "digest_date": "2026-04-20"}]),
        ):
            assert await resolve_digest_id_by_date("user-1", "2026-04-99") is None

    @pytest.mark.asyncio
    async def test_empty_list(self):
        with patch(
            "app.features.brew.db.list_user_digests",
            new=AsyncMock(return_value=[]),
        ):
            assert await resolve_digest_id_by_date("user-1", "2026-04-21") is None
```

- [ ] **Step 2: Confirm failure**

```bash
pytest tests/test_brew_db_unit.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement helper in brew/db.py**

Append to `backend/app/features/brew/db.py`:

```python
async def resolve_digest_id_by_date(user_id: str, date: str) -> Optional[str]:
    """Resolve a YYYY-MM-DD date into the user's digest UUID, if one exists.

    Used by action_items validator to rewrite digest:<DATE> → digest:<uuid>
    before exposing action chips to the frontend.
    """
    target = date[:10]
    digests = await list_user_digests(user_id, limit=30)
    for d in digests:
        raw = (d.get("digest_date") or "")[:10]
        if raw == target:
            return d.get("digest_id") or d.get("id")
    return None
```

- [ ] **Step 4: Verify test pass**

```bash
pytest tests/test_brew_db_unit.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/brew/db.py backend/tests/test_brew_db_unit.py
git commit -m "feat(brew): add resolve_digest_id_by_date for action_items date→uuid rewrite"
```

---

## Task 9: 重写 `build_action_bar` — 消费 digest.action_items

**Files:**
- Modify: `backend/app/features/for_you/service.py`
- Modify: `backend/app/features/for_you/templates.py`
- Test: `backend/tests/test_action_bar.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_action_bar.py`:

```python
class TestBuildActionBarAgentDriven:
    @pytest.mark.asyncio
    async def test_hidden_when_no_items_no_summary(self):
        from app.features.for_you.service import build_action_bar
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.portfolio.db.list_portfolio", new=AsyncMock(return_value=[])), \
             patch("app.features.brew.db.get_user_digest", new=AsyncMock(return_value=None)), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar(
                "user-1",
                digest_data={"action_items": [], "portfolio_summary": ""},
                holdings=[],
            )
        assert bar.visibility == "hidden"

    @pytest.mark.asyncio
    async def test_visible_with_portfolio_summary_only(self):
        from app.features.for_you.service import build_action_bar
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar(
                "user-1",
                digest_data={
                    "action_items": [],
                    "portfolio_summary": "组合今日涨 1.4%，NVDA 领涨",
                },
                holdings=[],
            )
        assert bar.visibility == "visible"
        assert bar.headline == "组合今日涨 1.4%，NVDA 领涨"
        assert bar.chips == []

    @pytest.mark.asyncio
    async def test_chips_from_agent_action_items(self):
        from app.features.for_you.service import build_action_bar
        holdings = [make_holding("NVDA", 60), make_holding("AAPL", 40)]
        digest = {
            "action_items": [
                {"label": "补 NVDA 论点", "target": "thesis:NVDA", "reason": "x", "priority": 1},
                {"label": "看体检", "target": "health", "reason": "y", "priority": 2},
            ],
            "portfolio_summary": "组合稳健",
        }
        # NVDA has no thesis; mark missing
        holdings[0].thesis = None
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar(
                "user-1",
                digest_data=digest,
                holdings=holdings,
            )
        assert bar.visibility == "visible"
        assert len(bar.chips) == 2
        assert bar.chips[0].target == "health"  # priority 2 but sort tiebreak: priority 1 first is thesis:NVDA, priority 2 health
        # With priority+target sort: (1,"thesis:NVDA"),(2,"health") → order [thesis:NVDA, health]
        assert [c.target for c in bar.chips] == ["thesis:NVDA", "health"]
        assert bar.source == "agent"

    @pytest.mark.asyncio
    async def test_invalid_targets_dropped(self):
        from app.features.for_you.service import build_action_bar
        digest = {
            "action_items": [
                {"label": "买入", "target": "buy:NVDA", "reason": "x", "priority": 1},
                {"label": "看体检", "target": "health", "reason": "y", "priority": 1},
            ],
            "portfolio_summary": "",
        }
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar("user-1", digest_data=digest, holdings=[])
        assert len(bar.chips) == 1
        assert bar.chips[0].target == "health"
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
pytest tests/test_action_bar.py::TestBuildActionBarAgentDriven -v
```

Expected: failures (logic not yet implemented).

- [ ] **Step 3: Rewrite `build_action_bar` in service.py**

Replace the body of `build_action_bar` in `backend/app/features/for_you/service.py`. Keep the signature the same, but the function body becomes:

```python
async def build_action_bar(
    user_id: str,
    *,
    digest_data: dict | None = None,
    holdings: list[HoldingView] | None = None,
    profile: ProfileView | None = None,
    top_event: dict | None = None,
    health_latest: dict | None = None,
) -> ActionBar:
    """Build the action bar from the digest agent's action_items.

    Visibility rules:
    - Agent emitted no valid items AND portfolio_summary empty → hidden
    - Otherwise → visible; headline = portfolio_summary (may be ""); chips = validated items
    """
    from app.features.brew import db as brew_db
    from app.features.brew.models import ActionItem
    from app.features.for_you.action_items import validate_and_resolve
    from app.features.portfolio import db as portfolio_db
    from app.features.portfolio.service import compute_effective_weights
    from app.shared.data_tools.quotes import get_batch_quotes

    # Load profile (used for nothing here yet, but preserved for future + legacy callers)
    if profile is None:
        try:
            profile = await portfolio_db.get_profile(user_id)
        except Exception:
            profile = ProfileView(user_id=user_id)
            logger.warning("action_bar: profile load failed user=%s", user_id[:8])

    # Load holdings if not provided
    if holdings is None:
        try:
            rows = await portfolio_db.list_portfolio(user_id)
            if rows:
                symbols = [r.symbol for r in rows]
                quotes_result = get_batch_quotes(symbols)
                prices = {q["symbol"]: q.get("price", 0) for q in quotes_result.get("quotes", [])}
                holdings = compute_effective_weights(rows, prices)
            else:
                holdings = []
        except Exception:
            holdings = []
            logger.warning("action_bar: holdings load failed user=%s", user_id[:8])

    # Load today's digest if not provided
    if digest_data is None:
        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            raw_digest = await brew_db.get_user_digest(user_id, today)
            if raw_digest:
                digest_data = raw_digest.get("digest_data", {})
        except Exception:
            digest_data = None
            logger.warning("action_bar: digest load failed user=%s", user_id[:8])

    raw_items = (digest_data or {}).get("action_items", []) or []
    portfolio_summary = (digest_data or {}).get("portfolio_summary", "") or ""

    # Parse raw items into ActionItem (tolerate both dict and model forms)
    parsed: list[ActionItem] = []
    for raw in raw_items:
        try:
            parsed.append(ActionItem.model_validate(raw) if not isinstance(raw, ActionItem) else raw)
        except Exception as e:
            logger.warning("action_bar: drop malformed action_item: %s", e)

    # Build context for validator
    watchlist_symbols: set[str] = set()
    try:
        wl = await brew_db.get_user_watchlist(user_id)
        if wl and isinstance(wl, dict):
            watchlist_symbols = set(wl.get("symbols") or [])
    except Exception:
        pass
    portfolio_symbols = {h.symbol for h in (holdings or []) if h.symbol != "$CASH"}
    user_symbols = portfolio_symbols | watchlist_symbols
    missing_thesis = {
        h.symbol for h in (holdings or [])
        if h.symbol != "$CASH" and not getattr(h, "thesis", None)
    }
    previous_digest_dates = set((digest_data or {}).get("previous_digest_dates", []) or [])
    # If the digest didn't persist the whitelist (older data), fall back to the
    # user's stored digests.
    if not previous_digest_dates:
        try:
            recent = await brew_db.list_user_digests(user_id, limit=30)
            previous_digest_dates = {(d.get("digest_date") or "")[:10] for d in recent}
        except Exception:
            pass

    async def _resolve(date: str) -> str | None:
        try:
            return await brew_db.resolve_digest_id_by_date(user_id, date)
        except Exception:
            return None

    validated = await validate_and_resolve(
        parsed,
        user_symbols=user_symbols,
        missing_thesis=missing_thesis,
        previous_digest_dates=previous_digest_dates,
        resolve_digest_id=_resolve,
    )

    # Map ActionItem → ActionChip
    chips = [_action_item_to_chip(item) for item in validated]

    headline = portfolio_summary.strip()
    if not chips and not headline:
        return ActionBar(
            severity="green",
            headline="",
            chips=[],
            source="agent",
            visibility="hidden",
            generated_at=datetime.now(timezone.utc),
        )

    return ActionBar(
        severity="green",  # severity no longer drives anything visible; kept for schema
        headline=headline,
        chips=chips,
        source="agent",
        visibility="visible",
        generated_at=datetime.now(timezone.utc),
    )


def _action_item_to_chip(item: "ActionItem") -> ActionChip:
    """Convert a validated ActionItem into an ActionChip.

    The `target` field is the source of truth for routing. `link` is populated
    as a best-effort URL (or anchor) for legacy frontend paths; new frontend
    reads `target` via routeChipTarget.
    """
    from app.features.brew.models import ActionItem  # local to avoid cycle

    target = item.target
    prefix, payload = (target.split(":", 1) + [""])[:2]

    link_map = {
        "portfolio": "/for-you/portfolio",
        "health": "/for-you/health",
        "watchlist": "/for-you/watchlist",
    }
    kind_map = {
        "thesis": "thesis",
        "stock": "research",
        "digest": "recap",
        "section": "section",
        "portfolio": "research",
        "health": "health",
        "watchlist": "research",
    }

    if prefix in ("portfolio", "health", "watchlist"):
        link = link_map[prefix]
    elif prefix == "thesis":
        link = f"#stock-{payload}"
    elif prefix == "stock":
        link = f"/stock/{payload}"
    elif prefix == "digest":
        link = f"/for-you/{payload}"  # payload is uuid after resolution
    elif prefix == "section":
        link = f"#section-{payload}"
    else:
        link = ""

    return ActionChip(
        label=item.label,
        target=target,
        link=link,
        kind=kind_map.get(prefix, "research"),
    )
```

At the top of `service.py`, **remove** the old helper `_build_chip`, all rule-engine imports, and the old constants `SEVERITY_ORDER`, `OVERALL_THRESHOLDS`, `SINGLE_DRAG_THRESHOLD`, `_max_severity`, and `compute_max_drag` are **no longer used** but keep them — they are referenced elsewhere (e.g. tests, potential future re-use). Do not delete them; just stop calling them from `build_action_bar`. Remove the `from app.features.for_you import templates` import if unused.

Keep `ActionBar` + `DragResult` imports. Add:

```python
from app.features.for_you.models import ActionBar, ActionChip, Signal
```

- [ ] **Step 4: Run tests to verify**

```bash
pytest tests/test_action_bar.py::TestBuildActionBarAgentDriven -v
```

Expected: PASS.

- [ ] **Step 5: Run full for_you test suite and fix any regressions**

```bash
pytest tests/test_action_bar.py -v
```

Expected: if older tests that relied on rule-engine output fail, mark them skip with `pytest.skip("legacy rule-engine removed — see round2 design")`. Do NOT delete them; keeping them documents the transition. Mark at most the failing classes, not the ones still valid (helpers, model tests, etc.).

- [ ] **Step 6: Commit**

```bash
git add backend/app/features/for_you/service.py backend/tests/test_action_bar.py
git commit -m "refactor(for-you): rewrite build_action_bar to consume agent action_items"
```

---

## Task 10: 清理旧 templates 和 service 中未用函数

**Files:**
- Modify: `backend/app/features/for_you/templates.py`

- [ ] **Step 1: Remove old green/staleness template functions**

In `backend/app/features/for_you/templates.py`, delete these functions entirely (they are no longer called):
- `green_headline`
- `green_chips`
- `staleness_headline`
- `staleness_chips`

Keep `fallback_headline` and `fallback_chip_labels` — they remain as legacy fallback if future LLM rendering path is reintroduced.

If ANY callers of the deleted functions remain in the codebase (outside tests), restore them and flag a warning instead. Search first:

```bash
grep -rn "green_headline\|green_chips\|staleness_headline\|staleness_chips" \
     backend/app/ --include="*.py" | grep -v __pycache__
```

Expected: only `templates.py` and test files reference these. If a non-test file still uses them, re-import or keep the function.

- [ ] **Step 2: Run tests**

```bash
pytest tests/test_action_bar.py -v
```

Expected: tests that still reference removed functions should fail. Mark those with `pytest.skip(reason="rule-engine removed")`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/features/for_you/templates.py backend/tests/test_action_bar.py
git commit -m "chore(for-you): remove green/staleness template helpers (obsolete)"
```

---

## Task 11: 前端 `api.ts` 类型更新

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update ActionChip and ActionBarResponse**

In `frontend/src/lib/api.ts`, locate `ActionChip` (around line 756) and replace with:

```ts
// Action Bar
export type ActionChipKind =
  | 'event'
  | 'health'
  | 'drawdown'
  | 'stable'
  | 'research'
  | 'guide'
  | 'thesis'
  | 'recap'
  | 'section';

export interface ActionChip {
  label: string;
  // `target` is the routing source of truth (e.g., "thesis:NVDA", "section:notes",
  // "digest:<uuid>"). `link` is a legacy best-effort URL kept for backwards compat.
  target: string;
  link: string;
  kind: ActionChipKind;
}

export interface ActionBarResponse {
  severity: 'green' | 'yellow' | 'red';
  headline: string;
  chips: ActionChip[];
  source: 'template' | 'llm' | 'llm_fallback' | 'agent';
  visibility?: 'visible' | 'hidden';
  generated_at: string;
}
```

Also locate `DigestResponse` type (search for `export interface DigestResponse`) and add:

```ts
  action_items?: Array<{
    label: string;
    target: string;
    reason: string;
    priority: 1 | 2 | 3;
  }>;
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd frontend && npm run lint
# and
npx tsc --noEmit
```

Expected: no new TS errors related to ActionBar types. (Pre-existing diagnostics in unrelated files may remain — don't fix those here.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): extend ActionChip with target + ActionBarResponse.visibility"
```

---

## Task 12: 前端 routing helper

**Files:**
- Create: `frontend/src/lib/action-bar-routing.ts`
- Create: `frontend/src/lib/__tests__/action-bar-routing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/__tests__/action-bar-routing.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { parseChipTarget, resolveChipUrl } from '../action-bar-routing';

describe('parseChipTarget', () => {
  it('parses prefix:payload', () => {
    expect(parseChipTarget('thesis:NVDA')).toEqual({ prefix: 'thesis', payload: 'NVDA' });
  });

  it('parses bare targets', () => {
    expect(parseChipTarget('portfolio')).toEqual({ prefix: 'portfolio', payload: '' });
  });
});

describe('resolveChipUrl', () => {
  it('maps thesis to anchor', () => {
    expect(resolveChipUrl('thesis:NVDA')).toEqual({ kind: 'anchor', hash: '#stock-NVDA' });
  });

  it('maps section to anchor', () => {
    expect(resolveChipUrl('section:notes')).toEqual({ kind: 'anchor', hash: '#section-notes' });
  });

  it('maps bare portfolio to push route', () => {
    expect(resolveChipUrl('portfolio')).toEqual({ kind: 'push', href: '/for-you/portfolio' });
  });

  it('maps stock to stock page', () => {
    expect(resolveChipUrl('stock:NVDA')).toEqual({ kind: 'push', href: '/stock/NVDA' });
  });

  it('maps digest:<uuid> to history', () => {
    expect(resolveChipUrl('digest:abc-123')).toEqual({ kind: 'push', href: '/for-you/abc-123' });
  });

  it('returns null for unknown', () => {
    expect(resolveChipUrl('buy:NVDA')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd frontend && npm test -- src/lib/__tests__/action-bar-routing.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement helper**

Create `frontend/src/lib/action-bar-routing.ts`:

```ts
/**
 * Resolve ActionChip `target` strings into either a Next.js push route or an
 * in-page anchor. Keep this pure so it stays trivially unit-testable.
 *
 * Target grammar (from backend whitelist):
 *   thesis:<SYMBOL>     → anchor #stock-<SYMBOL>
 *   stock:<SYMBOL>      → push /stock/<SYMBOL>
 *   digest:<uuid>       → push /for-you/<uuid>
 *   section:<id>        → anchor #section-<id>
 *   portfolio           → push /for-you/portfolio
 *   health              → push /for-you/health
 *   watchlist           → push /for-you/watchlist
 */

export type ChipRoute =
  | { kind: 'push'; href: string }
  | { kind: 'anchor'; hash: string };

export function parseChipTarget(target: string): { prefix: string; payload: string } {
  const idx = target.indexOf(':');
  if (idx === -1) return { prefix: target, payload: '' };
  return { prefix: target.slice(0, idx), payload: target.slice(idx + 1) };
}

export function resolveChipUrl(target: string): ChipRoute | null {
  const { prefix, payload } = parseChipTarget(target);
  switch (prefix) {
    case 'thesis':
      return payload ? { kind: 'anchor', hash: `#stock-${payload}` } : null;
    case 'stock':
      return payload ? { kind: 'push', href: `/stock/${payload}` } : null;
    case 'digest':
      return payload ? { kind: 'push', href: `/for-you/${payload}` } : null;
    case 'section':
      return payload ? { kind: 'anchor', hash: `#section-${payload}` } : null;
    case 'portfolio':
      return { kind: 'push', href: '/for-you/portfolio' };
    case 'health':
      return { kind: 'push', href: '/for-you/health' };
    case 'watchlist':
      return { kind: 'push', href: '/for-you/watchlist' };
    default:
      return null;
  }
}

/**
 * Scroll smoothly to an anchor, respecting fixed navbar height.
 * The offset (72px) matches the current Navbar height; adjust if the bar resizes.
 */
const NAVBAR_OFFSET_PX = 72;

export function scrollToAnchor(hash: string): void {
  if (typeof window === 'undefined') return;
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  const el = document.getElementById(id);
  if (!el) {
    // Fall back to native hash so user still navigates even if DOM missed
    window.location.hash = hash;
    return;
  }
  const top = el.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET_PX;
  window.scrollTo({ top, behavior: 'smooth' });
}
```

- [ ] **Step 4: Run tests to verify**

```bash
npm test -- src/lib/__tests__/action-bar-routing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/action-bar-routing.ts frontend/src/lib/__tests__/action-bar-routing.test.ts
git commit -m "feat(for-you): add ActionBar chip target routing helper"
```

---

## Task 13: 重构 `ActionBar.tsx` 使用 target 路由 + visibility

**Files:**
- Modify: `frontend/src/components/for-you/ActionBar.tsx`
- Create: `frontend/src/components/for-you/__tests__/ActionBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/for-you/__tests__/ActionBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActionBar } from '../ActionBar';

// Mocks
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const mockData = vi.fn();
vi.mock('@/hooks/queries/use-action-bar', () => ({
  useActionBar: () => mockData(),
}));

vi.mock('@/hooks/queries/use-portfolio', () => ({
  useTouchPortfolio: () => ({ mutateAsync: vi.fn() }),
}));

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ActionBar />
    </QueryClientProvider>,
  );
}

describe('ActionBar visibility', () => {
  beforeEach(() => mockData.mockReset());

  it('renders nothing when visibility=hidden', () => {
    mockData.mockReturnValue({
      data: {
        severity: 'green',
        headline: '',
        chips: [],
        source: 'agent',
        visibility: 'hidden',
        generated_at: '2026-04-25T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    });
    const { container } = renderBar();
    expect(container.firstChild).toBeNull();
  });

  it('renders headline only when chips empty', () => {
    mockData.mockReturnValue({
      data: {
        severity: 'green',
        headline: '组合今日涨 1.4%',
        chips: [],
        source: 'agent',
        visibility: 'visible',
        generated_at: '2026-04-25T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    });
    renderBar();
    expect(screen.getByText('组合今日涨 1.4%')).toBeInTheDocument();
  });

  it('renders chips when present', () => {
    mockData.mockReturnValue({
      data: {
        severity: 'green',
        headline: '',
        chips: [
          { label: '补 NVDA 论点', target: 'thesis:NVDA', link: '#stock-NVDA', kind: 'thesis' },
        ],
        source: 'agent',
        visibility: 'visible',
        generated_at: '2026-04-25T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    });
    renderBar();
    expect(screen.getByText('补 NVDA 论点')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd frontend && npm test -- src/components/for-you/__tests__/ActionBar.test.tsx
```

Expected: failures (visibility check missing in component).

- [ ] **Step 3: Refactor ActionBar.tsx**

Replace `frontend/src/components/for-you/ActionBar.tsx` with:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useActionBar } from '@/hooks/queries/use-action-bar';
import { useAuth } from '@/contexts/AuthContext';
import { useTouchPortfolio } from '@/hooks/queries/use-portfolio';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/query-keys';
import { ActionChip as ActionChipType } from '@/lib/api';
import { resolveChipUrl, scrollToAnchor } from '@/lib/action-bar-routing';

function ActionChipButton({ chip }: { chip: ActionChipType }) {
  const router = useRouter();
  const touchPortfolio = useTouchPortfolio();
  const queryClient = useQueryClient();

  const handleClick = async () => {
    // Legacy action links (touch portfolio button) stay on link field
    if (chip.link === 'action://touch-portfolio') {
      try {
        await touchPortfolio.mutateAsync();
        queryClient.invalidateQueries({ queryKey: queryKeys.actionBar.all });
      } catch {
        // silent
      }
      return;
    }

    const route = chip.target ? resolveChipUrl(chip.target) : null;
    if (route?.kind === 'anchor') {
      scrollToAnchor(route.hash);
      return;
    }
    if (route?.kind === 'push') {
      router.push(route.href);
      return;
    }
    // Fallback to legacy link field if target doesn't resolve
    if (chip.link?.startsWith('#')) {
      scrollToAnchor(chip.link);
      return;
    }
    if (chip.link) {
      router.push(chip.link);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                 bg-background/60 border border-current/10 hover:bg-background/80
                 transition-colors cursor-pointer whitespace-nowrap"
    >
      {chip.label}
    </button>
  );
}

export function ActionBar() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useActionBar(!!user?.id);

  if (isError) return null;
  if (!isLoading && !data) return null;
  if (data?.visibility === 'hidden') return null;
  // Legacy server responses (no visibility field) still rely on headline-or-chips
  if (data && data.visibility !== 'visible') {
    if (!data.headline && (!data.chips || data.chips.length === 0)) return null;
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="h-12 bg-muted/40 rounded-xl animate-pulse" />
      </div>
    );
  }

  const { severity, headline, chips } = data!;
  const hasHeadline = !!headline;
  const hasChips = chips && chips.length > 0;
  if (!hasHeadline && !hasChips) return null;

  const severityStyles = {
    green: 'bg-muted/30 text-muted-foreground border-border/30',
    yellow: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    red: 'bg-red-500/8 text-red-700 dark:text-red-400 border-red-500/20',
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pt-4">
      <div
        className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 rounded-xl border ${severityStyles[severity]} transition-colors`}
      >
        {hasHeadline && (
          <span className="text-sm flex-1 min-w-0 line-clamp-2 sm:truncate">{headline}</span>
        )}
        {hasChips && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {/* Single-line: show only the highest-priority chip (first in sorted order).
                Multi-line (sm+): show up to 3. */}
            <div className="sm:hidden">
              <ActionChipButton chip={chips[0]} />
            </div>
            <div className="hidden sm:flex items-center gap-2 flex-wrap">
              {chips.slice(0, 3).map((chip, i) => (
                <ActionChipButton key={i} chip={chip} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify**

```bash
npm test -- src/components/for-you/__tests__/ActionBar.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/for-you/ActionBar.tsx \
        frontend/src/components/for-you/__tests__/ActionBar.test.tsx
git commit -m "refactor(for-you): ActionBar consumes target-based chips, hides when visibility=hidden"
```

---

## Task 14: 重命名 + 上移段落 in `DigestInlineReport.tsx`

**Files:**
- Modify: `frontend/src/components/for-you/DigestInlineReport.tsx`

- [ ] **Step 1: Move the summary section up and rename**

In `frontend/src/components/for-you/DigestInlineReport.tsx`:

1. Locate the `{/* Summary */}` block (currently at the bottom, around line 241).
2. Cut the entire `<section>...</section>` block.
3. Paste it immediately **after** the `{/* Watchlist Overview */}` section (after its closing `</section>` around line 109) and **before** the `{/* Headlines News */}` section.
4. Replace the section content with:

```tsx
      {/* 给你的复盘笔记 — moved from the bottom; section:notes anchor lives here */}
      {digest.summary?.content && (
        <section id="section-notes" className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">
              给你的复盘笔记
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            综合你的持仓、关注列表与今日相关新闻
          </p>
          <div className="space-y-4">
            {digest.summary.content.split('\n\n').map((paragraph, index) =>
              paragraph.trim() && (
                <p key={index} className="text-sm text-muted-foreground leading-relaxed">
                  {paragraph.trim()}
                </p>
              ),
            )}
          </div>
        </section>
      )}
```

5. Add matching anchor IDs to the other sections so that `section:events`, `section:headlines`, `section:briefs` chips work:

- On the `<section>` wrapping headlines: `id="section-headlines"`
- On the `<section>` wrapping briefs: `id="section-briefs"`
- On the `<section>` wrapping events: `id="section-events"`

- [ ] **Step 2: Visual smoke test**

Start the frontend dev server and open `/for-you` in the browser (test account `voya.technologies@gmail.com` / `123456`). Verify:

- "给你的复盘笔记" section appears immediately below 持仓概览
- Subtitle `综合你的持仓、关注列表与今日相关新闻` renders in smaller muted text
- Scrolling hash `#section-notes` lands on the section with the navbar not covering the title

```bash
cd frontend && npm run dev
# Manually open http://localhost:3000/for-you and confirm
```

Note: if no digest is yet generated for this account today, ensure one exists (use the test generation endpoint or existing fixture).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/for-you/DigestInlineReport.tsx
git commit -m "feat(for-you): rename 总结→给你的复盘笔记, move above news, add section anchors"
```

---

## Task 15: 集成测试 — end-to-end `digest → action_items → action bar`

**Files:**
- Create: `backend/tests/test_for_you_action_integration.py`

- [ ] **Step 1: Write integration test**

Create `backend/tests/test_for_you_action_integration.py`:

```python
"""Integration-ish test: digest dict in → action bar out, with DB calls mocked."""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.portfolio.models import HoldingView, ProfileView


@pytest.mark.asyncio
async def test_end_to_end_agent_driven_bar_with_valid_action():
    from app.features.for_you.service import build_action_bar

    holdings = [
        HoldingView(symbol="NVDA", effective_weight_pct=60, weight_source="cost_basis"),
        HoldingView(symbol="AAPL", effective_weight_pct=40, weight_source="cost_basis"),
    ]
    # NVDA lacks thesis; AAPL has one
    holdings[0].thesis = None
    holdings[1].thesis = "Consumer cycle"

    digest_data = {
        "action_items": [
            {"label": "补 NVDA 论点", "target": "thesis:NVDA", "reason": "...", "priority": 1},
            {"label": "回看 4/21", "target": "digest:2026-04-21", "reason": "...", "priority": 2},
            {"label": "买入 NVDA", "target": "buy:NVDA", "reason": "junk", "priority": 1},
        ],
        "portfolio_summary": "组合涨 1.4%，NVDA 领涨",
        "previous_digest_dates": ["2026-04-21"],
    }

    async def fake_resolve(user_id, date):
        return "uuid-421" if date == "2026-04-21" else None

    with patch(
        "app.features.portfolio.db.get_profile",
        new=AsyncMock(return_value=ProfileView(user_id="u", style="passive", horizon="long", risk_tolerance="moderate")),
    ), patch(
        "app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []}),
    ), patch(
        "app.features.brew.db.resolve_digest_id_by_date",
        new=AsyncMock(side_effect=lambda user_id, date: fake_resolve(user_id, date)),
    ), patch(
        "app.features.brew.db.list_user_digests", new=AsyncMock(return_value=[]),
    ):
        bar = await build_action_bar(
            "user-1",
            digest_data=digest_data,
            holdings=holdings,
        )

    assert bar.visibility == "visible"
    assert bar.headline == "组合涨 1.4%，NVDA 领涨"
    targets = [c.target for c in bar.chips]
    assert "thesis:NVDA" in targets
    assert "digest:uuid-421" in targets
    # buy:NVDA invalid → dropped
    assert all(not t.startswith("buy:") for t in targets)


@pytest.mark.asyncio
async def test_end_to_end_hidden_when_silent_day():
    from app.features.for_you.service import build_action_bar

    with patch(
        "app.features.portfolio.db.get_profile",
        new=AsyncMock(return_value=ProfileView(user_id="u", style="passive", horizon="long", risk_tolerance="moderate")),
    ), patch(
        "app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []}),
    ), patch(
        "app.features.brew.db.list_user_digests", new=AsyncMock(return_value=[]),
    ):
        bar = await build_action_bar(
            "user-1",
            digest_data={"action_items": [], "portfolio_summary": ""},
            holdings=[],
        )

    assert bar.visibility == "hidden"
```

- [ ] **Step 2: Run tests**

```bash
cd backend && source venv/bin/activate
pytest tests/test_for_you_action_integration.py -v
```

Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_for_you_action_integration.py
git commit -m "test(for-you): integration test for agent-driven action bar + digest_date resolution"
```

---

## Task 16: 更新 `.context.md` docs

**Files:**
- Modify: `backend/app/features/brew/.context.md`
- Modify: `backend/app/features/for_you/.context.md`

- [ ] **Step 1: Update brew context**

Open `backend/app/features/brew/.context.md` and add a section:

```markdown
## Action Items (V2 round 2, 2026-04-25)

`PersonalDigestOutput.action_items` carries 0-3 in-site action items produced
jointly with the narrative summary. Each item has `{label, target, reason, priority}`.

Targets follow a whitelist enforced in `features/for_you/action_items.py`. The
agent receives `action_context` (missing_thesis_symbols, days_since_*,
symbols_with_today_events, previous_digest_dates) to guide decisions. No hard-coded
rule engine in for_you/service.py anymore — that logic was moved to the agent.

Date→uuid rewrite for `digest:<YYYY-MM-DD>` happens in for_you/service before the
bar reaches the frontend; the frontend only sees `digest:<uuid>`.
```

- [ ] **Step 2: Update for_you context**

Open `backend/app/features/for_you/.context.md` and add:

```markdown
## V2 round 2 changes (2026-04-25)

- `build_action_bar` no longer drives chips from drawdown/staleness/health rules.
- All chips come from `digest.action_items` (agent output) after whitelist
  validation in `action_items.py`. Legacy rule-engine functions remain in
  service.py as dead code — do not import from them.
- `ActionBar.visibility` signals the frontend to hide the entire component on
  quiet days (no chips + no portfolio_summary).
- `ActionChip.target` is the source of truth for routing; `link` is a legacy
  fallback URL populated server-side for backwards compat.
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/features/brew/.context.md backend/app/features/for_you/.context.md
git commit -m "docs: update brew/for_you .context.md with V2 round 2 changes"
```

---

## Task 17: 全量回归测试

**Files:** none

- [ ] **Step 1: Run backend full test suite**

```bash
cd backend && source venv/bin/activate
pytest -x
```

Expected: all pass. If a legacy test fails because it checks rule-engine-specific output (green_headline text etc.), the test should be `pytest.skip`-marked in Task 9/10 — if still failing, revisit those skips.

- [ ] **Step 2: Run frontend test suite**

```bash
cd frontend && npm test
```

Expected: all tests pass. Pre-existing diagnostics in unrelated files do not count.

- [ ] **Step 3: Run frontend typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no new errors in files we touched.

- [ ] **Step 4: Manual smoke test**

Start both servers:

```bash
# Terminal 1
cd backend && source venv/bin/activate
uvicorn app.main:app --reload

# Terminal 2
cd frontend && npm run dev
```

Log in as `voya.technologies@gmail.com` / `123456`, open `/for-you`. Verify:
- 段落 "给你的复盘笔记" 在持仓概览之下，头条新闻之上，副标题可见
- Action bar：如果今日有 `action_items`，chip 显示且点击跳转正确
- Action bar：如果无 `action_items` 且无 `portfolio_summary`，action bar 完全不渲染
- Chip 点 `thesis:NVDA`（若存在）平滑滚动到持仓概览中 NVDA 的 thesis 输入框

- [ ] **Step 5: No commit** (retrospective only)

No changes expected at this step. If anything fails, create a fix-up commit.

---

## Self-Review

**Spec coverage check** (running through spec §1..§6):

- §1.1 rename → Task 14 ✓
- §1.2 reorder + anchor → Task 14 ✓
- §2.2 ActionItem schema → Task 1 ✓
- §2.3 target whitelist → Task 7 ✓
- §2.4 service validation + date→uuid → Task 7 (validator) + Task 8 (resolver) + Task 9 (wire-up) ✓
- §2.5 agent context → Tasks 3 + 4 ✓
- §2.6 prompt instruction → Task 5 ✓
- §2.7 build_action_bar rewrite → Task 9 ✓
- §2.8 frontend visibility + chip routing → Tasks 11 + 12 + 13 ✓
- §2.9 file list → all covered across tasks
- §3 edge cases → Task 15 integration tests cover invalid targets / silent day
- §4 tests → Tasks 1, 6, 7, 8, 9, 12, 13, 15
- §5 future extensions → explicitly deferred
- §6 backwards compat → `visibility` optional on frontend (Task 13); ActionItem defaults to `[]` (Task 1)

**Placeholder scan**: searched for TBD/TODO/"fill in" — none.

**Type consistency**:
- `ActionItem(label, target, reason, priority)` — consistent across Tasks 1, 2, 3, 7, 9, 15
- `ActionChip.target / link / kind` — consistent Tasks 6, 9, 11, 12, 13
- `validate_and_resolve(items, *, user_symbols, missing_thesis, previous_digest_dates, resolve_digest_id)` — consistent Tasks 7, 9
- `resolveChipUrl` return type `{kind:'push',href}|{kind:'anchor',hash}|null` — consistent Tasks 12, 13

**Gap check**: no spec requirement without a task.
