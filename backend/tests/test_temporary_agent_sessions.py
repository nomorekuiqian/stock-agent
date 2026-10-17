"""Exercise real ADK session storage without calling models or providers."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from google.adk.events import Event, EventActions
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part
from pydantic import BaseModel

from app.shared.agent_sessions import temporary_agent_session


class RecordedRunner:
    def __init__(self, app_name, output_key, output, mode="success"):
        self.app_name = app_name
        self.output_key = output_key
        self.output = output
        self.mode = mode
        self.session_service = InMemorySessionService()
        self.started = asyncio.Event()
        self.calls = 0

    def retained_sessions(self):
        return sum(
            len(sessions)
            for users in self.session_service.sessions.values()
            for sessions in users.values()
        )

    async def run_async(self, *, user_id, session_id, new_message):
        self.calls += 1
        session = await self.session_service.get_session(
            app_name=self.app_name, user_id=user_id, session_id=session_id
        )
        await self.session_service.append_event(
            session=session,
            event=Event(author="user", content=new_message),
        )
        self.started.set()
        if self.mode == "cancel":
            await asyncio.Event().wait()
        if self.mode == "failure" or (self.mode == "retry" and self.calls == 1):
            raise RuntimeError("model unavailable")
        event = Event(
            author="offline_model",
            content=Content(role="model", parts=[Part(text=json.dumps(self.output))]),
            actions=EventActions(state_delta={self.output_key: self.output}),
        )
        await self.session_service.append_event(session=session, event=event)
        yield event


@pytest.mark.asyncio
async def test_cleanup_preserves_unrelated_conversation_and_result():
    runner = RecordedRunner("unit", "answer", {"text": "saved result"})
    conversation = await runner.session_service.create_session(
        app_name="unit", user_id="person", state={"history": ["keep"]}
    )
    async with temporary_agent_session(runner, app_name="unit", user_id="job") as session:
        async for _ in runner.run_async(
            user_id="job", session_id=session.id,
            new_message=Content(role="user", parts=[Part(text="generate")]),
        ):
            pass
        result = await runner.session_service.get_session(
            app_name="unit", user_id="job", session_id=session.id
        )
    assert result.state["answer"] == {"text": "saved result"}
    assert runner.retained_sessions() == 1
    assert (await runner.session_service.get_session(
        app_name="unit", user_id="person", session_id=conversation.id
    )).state["history"] == ["keep"]


@pytest.mark.asyncio
@pytest.mark.parametrize("body_fails", [False, True])
async def test_cleanup_error_does_not_replace_result_or_original_error(body_fails):
    runner = RecordedRunner("unit", "answer", {})
    runner.session_service.delete_session = AsyncMock(side_effect=RuntimeError("cleanup failed"))

    async def work():
        async with temporary_agent_session(runner, app_name="unit", user_id="job"):
            if body_fails:
                raise ValueError("original failure")
            return "valid result"

    if body_fails:
        with pytest.raises(ValueError, match="original failure"):
            await work()
    else:
        assert await work() == "valid result"
    runner.session_service.delete_session.assert_awaited_once()


class CuratedResult(BaseModel):
    headline: str


def twitter_job(monkeypatch, kind, mode="success", output=None):
    from app.features.twitter_digest import enrichment, service

    if kind == "enrich":
        value = output if output is not None else {"enrichments": [{"quality": "keep"}]}
        runner = RecordedRunner(enrichment.APP_NAME, enrichment.enrich_agent.output_key, value, mode)
        monkeypatch.setattr(enrichment, "get_runner", lambda agent: runner)
        return runner, lambda: enrichment._run_enrich_batch([{"id": "sample", "text": "AAPL evidence"}])
    agent = SimpleNamespace(name="curate", output_key="report")
    runner = RecordedRunner(service.APP_NAME, "report", output or {"headline": "kept headline"}, mode)
    monkeypatch.setattr(service, "get_runner", lambda agent: runner)
    return runner, lambda: service._run_agent(agent, {"tweets": ["sample"]}, CuratedResult)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["enrich", "curate"])
async def test_twitter_repeated_jobs_leave_no_sessions(monkeypatch, kind):
    runner, call = twitter_job(monkeypatch, kind)
    for _ in range(30):
        output = await call()
        assert runner.retained_sessions() == 0
    if kind == "enrich":
        assert output[0].quality == "keep"
    else:
        assert output.headline == "kept headline"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["enrich", "curate"])
@pytest.mark.parametrize("mode", ["failure", "cancel", "invalid"])
async def test_twitter_errors_and_cancellation_release_sessions(monkeypatch, kind, mode):
    runner, call = twitter_job(monkeypatch, kind, mode, output="invalid JSON" if mode == "invalid" else None)
    task = asyncio.create_task(call())
    await runner.started.wait()
    if mode == "cancel":
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        with pytest.raises(RuntimeError):
            await task
    assert runner.retained_sessions() == 0


def report_job(monkeypatch, kind, mode="success"):
    import importlib

    module = importlib.import_module("app.features.%s.agent" % kind)
    for name in ["get_batch_quotes", "get_combined_market_news", "get_economic_calendar",
                 "get_earnings_calendar", "get_all_market_data", "get_premarket_data"]:
        if hasattr(module, name):
            monkeypatch.setattr(module, name, Mock(return_value={}))
    if kind == "brew":
        runner = RecordedRunner("personal_digest", "digest", {"greeting": "kept", "news": {}, "events": []}, mode)
        monkeypatch.setattr(module, "get_profiles_cached", AsyncMock(return_value={}))
        instance = module.PersonalDigest()
        monkeypatch.setattr(instance, "_resolve_runner_for_user", AsyncMock(return_value=(runner, "free", "unchanged-model")))
        return runner, lambda: instance.generate(["AAPL"])
    if kind == "daily_report":
        runner = RecordedRunner("stock_agent", "report", {"title": "kept", "news": {"headlines": [], "briefs": []}}, mode)
        monkeypatch.setattr(module.market_db, "list_reports", AsyncMock(return_value=[]))
        monkeypatch.setattr(module.asyncio, "sleep", AsyncMock())
        instance = module.MarketAgent()
        monkeypatch.setattr(instance, "runner", runner)
        return runner, instance.analyze
    if kind == "morning_report":
        runner = RecordedRunner("morning_report", "morning_report", {"title": "kept"}, mode)
        monkeypatch.setattr(module.morning_db, "list_morning_reports", AsyncMock(return_value={"data": []}))
        instance = module.MorningReportAgent()
        monkeypatch.setattr(instance, "runner", runner)
        return runner, instance.analyze
    runner = RecordedRunner("weekly_report", "report", {"title": "kept"}, mode)
    monkeypatch.setattr(module, "_prepare_data_for_agent", lambda raw: {})
    instance = module.WeeklyReportAgent()
    monkeypatch.setattr(instance, "runner", runner)
    return runner, lambda: instance.generate(None)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["brew", "daily_report", "morning_report", "macro.weekly"])
@pytest.mark.parametrize("mode", ["success", "failure", "cancel"])
async def test_report_lifecycle_keeps_results_and_releases_sessions(monkeypatch, kind, mode):
    runner, call = report_job(monkeypatch, kind, mode)
    task = asyncio.create_task(call())
    await asyncio.wait_for(runner.started.wait(), timeout=5)
    if mode == "cancel":
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    elif mode == "failure" and kind == "macro.weekly":
        with pytest.raises(RuntimeError, match="model unavailable"):
            await task
    else:
        result = await task
        if mode == "success":
            assert result.get("greeting", result.get("title")) == "kept"
        elif kind == "brew":
            assert result["success"] is False
        else:
            assert result is None
    assert runner.retained_sessions() == 0


@pytest.mark.asyncio
async def test_daily_retry_cleans_each_attempt(monkeypatch):
    runner, call = report_job(monkeypatch, "daily_report", "retry")
    result = await call()
    assert result["title"] == "kept"
    assert runner.calls == 2
    assert runner.retained_sessions() == 0
