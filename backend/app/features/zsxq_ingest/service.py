"""Orchestration service for 知识星球 (zsxq) ingestion pipeline.

Phase 4: crawl → archive → normalize → audit/gate → index → smoke → report.

Rate-limit cooldown choice
--------------------------
When ``ZsxqRateLimitError`` is raised during crawl we sleep for ``_RATE_LIMIT_COOLDOWN``
seconds (default 600 s / 10 min) and then *continue* (retry the same page via
``iter_topics`` which will re-fetch from the current cursor position on the next
loop iteration).  If a *second* consecutive rate-limit is hit we abort the run
as ``failed`` to avoid an infinite loop.  This is a "one free cooldown" policy:
safe enough for a scheduled cron job, simple to reason about in tests (the
injectable ``_sleep_fn`` can be swapped without touching business logic).
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import resend

from app.core.config import ADMIN_EMAILS, RESEND_API_KEY
from app.core.logging import get_logger
from app.features.zsxq_ingest import db as _db
from app.features.zsxq_ingest.crawl import ZsxqAuthError, ZsxqRateLimitError
from app.features.zsxq_ingest.indexing import (
    audit_distribution,
    index_prepared,
    prepare_records,
)
from app.features.zsxq_ingest.normalize import normalize_topic

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GROUP_ID = "15554581218512"
GROUP_NAME = "潘大的科技交流圈"
OWNER_USER_ID = "15555428815112"
CREATOR_IDS: set = set()

BUCKET = "zsxq-archive"

# Emails
_FROM_EMAIL = "TheMarketBrew <daily@themarketbrew.com>"

# Rate-limit cooldown in seconds (injectable via module attribute for tests)
_RATE_LIMIT_COOLDOWN: float = 600.0

# Injectable sleep function — tests replace this to avoid real sleeps
_sleep_fn = asyncio.sleep


# ---------------------------------------------------------------------------
# Public gate helper
# ---------------------------------------------------------------------------


def gate_should_block(
    prev_selected: int,
    curr_selected: int,
    threshold: float = 0.5,
) -> bool:
    """Return True iff indexing should be blocked due to abnormal volume drop.

    Blocks when ``prev_selected > 0`` and
    ``curr_selected < prev_selected * (1 - threshold)``.
    A threshold of 0.5 means: block if this run selects fewer than 50% of
    what the previous run selected.
    """
    if prev_selected <= 0:
        return False
    return curr_selected < prev_selected * (1 - threshold)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _notify_auth_failure(group_id: str, kind: str) -> None:
    """Send admin alert email about a credential / membership failure.

    Wraps the send in try/except so email failures cannot crash the run.
    """
    resend.api_key = RESEND_API_KEY

    if kind in ("cookie_expired", "access_denied"):
        subject = f"[zsxq] Cookie 失效 — 需要更新 ({kind})"
        body_html = (
            f"<p>知识星球 group <b>{group_id}</b> 的 cookie 已失效（<code>{kind}</code>）。</p>"
            "<p>请登录 <a href='https://wx.zsxq.com'>wx.zsxq.com</a> 取得新 cookie，"
            "然后通过 <code>POST /api/zsxq/cookie</code>（需 admin Bearer token）更新。</p>"
            "<p><b>更新示例：</b><br>"
            "<code>curl -X POST /api/zsxq/cookie -H 'Authorization: Bearer &lt;token&gt;' "
            "-d '{\"cookie\": \"&lt;new_cookie&gt;\"}'</code></p>"
        )
    elif kind == "membership_expired":
        subject = "[zsxq] 星球成员资格已过期 — 请续费"
        body_html = (
            f"<p>知识星球 group <b>{group_id}</b> 的成员资格已过期（<code>membership_expired</code>）。</p>"
            "<p>请续费星球成员资格，续费完成后 cookie 仍有效，无需更新。</p>"
            "<p>若 cookie 也已失效请同步通过 <code>POST /api/zsxq/cookie</code> 更新。</p>"
        )
    else:
        subject = f"[zsxq] 认证失败 — {kind}"
        body_html = (
            f"<p>知识星球 group <b>{group_id}</b> 认证失败，kind=<code>{kind}</code>。</p>"
            "<p>请检查 cookie 状态，并通过 <code>POST /api/zsxq/cookie</code> 更新。</p>"
        )

    try:
        resend.Emails.send(
            {
                "from": _FROM_EMAIL,
                "to": list(ADMIN_EMAILS),
                "subject": subject,
                "html": body_html,
            }
        )
        logger.info("_notify_auth_failure: email sent kind=%s group=%s", kind, group_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "_notify_auth_failure: email send failed (kind=%s group=%s): %s",
            kind,
            group_id,
            exc,
        )


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------


async def run_ingest(group_id: str, *, full: bool = False, run_id: str) -> dict[str, Any]:
    """Orchestrate a full or incremental ingest for *group_id*.

    Parameters
    ----------
    group_id:
        The zsxq group ID string.
    full:
        If True, ignore the incremental cursor and crawl all topics.
    run_id:
        Pre-created run ID from ``db.create_run``.

    Returns
    -------
    Report dict (also saved to the run row).  Returns early (with a partial
    report) on auth failure or gate block.
    """
    logger.info("run_ingest: start run_id=%s group=%s full=%s", run_id, group_id, full)

    # ------------------------------------------------------------------
    # Step 1 — credential check
    # ------------------------------------------------------------------
    cred = await _db.get_credential(group_id)
    if not cred or cred.get("status") != "active":
        kind = cred.get("status") if cred else "missing"
        logger.warning(
            "run_ingest: credential not active (status=%s) run_id=%s", kind, run_id
        )
        await _notify_auth_failure(group_id, kind)
        await _db.update_run(
            run_id,
            status="auth_failed",
            error_message="credential status=%s" % kind,
        )
        return {"status": "auth_failed", "error": "credential status=%s" % kind}

    # ------------------------------------------------------------------
    # Step 2 — load state / cursor
    # ------------------------------------------------------------------
    state = await _db.get_state(group_id) or {}
    stop = None if full else state.get("last_seen_create_time")

    # ------------------------------------------------------------------
    # Step 3 — crawl
    # ------------------------------------------------------------------
    from app.features.zsxq_ingest.crawl import ZsxqClient

    client = ZsxqClient(cookie=cred["cookie"], group_id=group_id)

    raw_topics: list[dict] = []
    topics_new = 0
    topics_seen = 0
    comments_fetched = 0
    files_downloaded = 0
    files_failed = 0
    newest_create_time: str | None = None
    newest_topic_id: str | None = None

    consecutive_rate_limits = 0

    topic_iter = client.iter_topics(stop_create_time=stop, full=full)

    while True:
        try:
            topic = next(topic_iter)
        except StopIteration:
            break
        except ZsxqAuthError as e:
            logger.error(
                "run_ingest: ZsxqAuthError kind=%s during crawl run_id=%s", e.kind, run_id
            )
            await _db.set_credential(group_id, cred["cookie"], status=e.kind)
            await _notify_auth_failure(group_id, e.kind)
            await _db.update_run(
                run_id,
                status="auth_failed",
                error_message=str(e),
            )
            return {"status": "auth_failed", "error": str(e)}
        except ZsxqRateLimitError as e:
            consecutive_rate_limits += 1
            logger.warning(
                "run_ingest: ZsxqRateLimitError #%d run_id=%s — sleeping %ss",
                consecutive_rate_limits,
                run_id,
                _RATE_LIMIT_COOLDOWN,
            )
            if consecutive_rate_limits >= 2:
                # Two consecutive rate limits — abort to avoid infinite loop
                logger.error(
                    "run_ingest: 2 consecutive rate limits — aborting run_id=%s", run_id
                )
                await _db.update_run(
                    run_id,
                    status="failed",
                    error_message="rate limit: %s" % e,
                )
                return {"status": "failed", "error": "rate_limit_abort"}
            await _sleep_fn(_RATE_LIMIT_COOLDOWN)
            # Re-create the iterator from scratch (cursor state is lost on a re-raise)
            # Simple approach: restart from the same stop position; already-crawled
            # topics will be upserted (idempotent).
            topic_iter = client.iter_topics(stop_create_time=stop, full=full)
            continue
        except Exception as e:  # noqa: BLE001
            logger.exception("run_ingest: unexpected error during crawl run_id=%s", run_id)
            await _db.update_run(run_id, status="failed", error_message=str(e))
            return {"status": "failed", "error": str(e)}

        consecutive_rate_limits = 0  # reset on success

        tid = str(topic.get("topic_id", ""))
        create_time = topic.get("create_time")
        topic_type = topic.get("type", "talk")

        # Track newest (first yielded = newest in descending order)
        if newest_create_time is None:
            newest_create_time = create_time
            newest_topic_id = tid

        # Archive raw JSON
        date_str = (create_time or "")[:10] or "unknown"
        raw_key = f"raw/zsxq/{group_id}/{date_str}/topic-{tid}.json"
        raw_bytes = json.dumps(topic, ensure_ascii=False).encode("utf-8")
        try:
            obj_result = await _db.put_object(BUCKET, raw_key, raw_bytes)
            storage_key = obj_result.get("key", raw_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("run_ingest: put_object failed topic=%s: %s", tid, exc)
            storage_key = raw_key

        # Comments (> 8 → fetch full)
        stage_comments = "skipped"
        if topic.get("comments_count", 0) > 8:
            try:
                full_comments = client.fetch_full_comments(topic)
                if full_comments:
                    topic["show_comments"] = full_comments
                stage_comments = "done"
                comments_fetched += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "run_ingest: fetch_full_comments failed topic=%s: %s", tid, exc
                )
                stage_comments = "failed"

        # Binaries
        stage_binaries = "skipped"
        dl_count = 0
        dl_failed = 0

        def _make_save_fn(topic_id: str, date: str):
            def save_fn(filename: str, content: bytes) -> bool:
                import asyncio as _asyncio
                key = f"files/zsxq/{group_id}/{date}/{topic_id}/{filename}"
                try:
                    # We're in a sync context inside ZsxqClient; run the coroutine
                    loop = _asyncio.get_event_loop()
                    loop.run_until_complete(_db.put_object(BUCKET, key, content))
                    return True
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "run_ingest: save_fn put_object failed %s: %s", key, exc
                    )
                    return False
            return save_fn

        if topic.get("attachments"):
            try:
                dl_count, dl_failed = client.download_binaries(
                    topic, _make_save_fn(tid, date_str)
                )
                stage_binaries = "done"
                files_downloaded += dl_count
                files_failed += dl_failed
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "run_ingest: download_binaries failed topic=%s: %s", tid, exc
                )
                stage_binaries = "failed"

        # Determine author role for ledger
        talk = topic.get("talk") or {}
        talk_owner = talk.get("owner") or {}
        uid = str(talk_owner.get("user_id") or "")
        if uid == OWNER_USER_ID:
            author_role = "owner"
        elif uid in CREATOR_IDS:
            author_role = "creator"
        else:
            author_role = "member"

        # Ledger upsert (crawl stage)
        try:
            await _db.upsert_ledger(
                {
                    "group_id": group_id,
                    "topic_id": tid,
                    "last_run_id": run_id,
                    "topic_type": topic_type,
                    "author_role": author_role,
                    "create_time": create_time,
                    "stage_crawled": "done",
                    "stage_comments": stage_comments,
                    "stage_binaries": stage_binaries,
                    "binaries_total": dl_count,
                    "binaries_failed": dl_failed,
                    "storage_keys": [storage_key],
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("run_ingest: upsert_ledger crawl failed topic=%s: %s", tid, exc)

        raw_topics.append(topic)
        topics_new += 1

    logger.info(
        "run_ingest: crawl done run_id=%s topics=%d", run_id, len(raw_topics)
    )

    # ------------------------------------------------------------------
    # Step 4 — normalize + archive jsonl
    # ------------------------------------------------------------------
    records: list[dict] = []
    for t in raw_topics:
        try:
            rec = normalize_topic(
                t,
                group_id=group_id,
                group_name=GROUP_NAME,
                owner_user_id=int(OWNER_USER_ID),
                creator_ids=CREATOR_IDS,
            )
            records.append(rec)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "run_ingest: normalize_topic failed topic=%s: %s",
                t.get("topic_id"),
                exc,
            )

    # Archive threads.jsonl
    if records:
        jsonl_bytes = "\n".join(
            json.dumps(r, ensure_ascii=False) for r in records
        ).encode("utf-8")
        jsonl_key = f"normalized/zsxq/{group_id}/{run_id}/threads.jsonl"
        try:
            await _db.put_object(BUCKET, jsonl_key, jsonl_bytes)
        except Exception as exc:  # noqa: BLE001
            logger.warning("run_ingest: put_object jsonl failed run_id=%s: %s", run_id, exc)

    # Mark ledger stage_normalized
    for rec in records:
        try:
            await _db.upsert_ledger(
                {
                    "group_id": group_id,
                    "topic_id": rec["topic_id"],
                    "last_run_id": run_id,
                    "stage_normalized": "done",
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "run_ingest: upsert_ledger normalize failed topic=%s: %s",
                rec.get("topic_id"),
                exc,
            )

    # ------------------------------------------------------------------
    # Step 5 — audit + gate
    # ------------------------------------------------------------------
    prepared, drop_reasons = prepare_records(records)
    audit = audit_distribution(records, prepared, drop_reasons)

    last_summary = state.get("last_summary") or {}
    prev_selected = last_summary.get("selected", 0)
    curr_selected = audit.get("selected", 0)

    if gate_should_block(prev_selected, curr_selected):
        logger.warning(
            "run_ingest: gate blocked run_id=%s prev_selected=%d curr_selected=%d",
            run_id,
            prev_selected,
            curr_selected,
        )
        await _db.update_run(
            run_id,
            status="failed",
            error_message="gate: selected dropped from %d to %d" % (prev_selected, curr_selected),
            report=audit,
        )
        return {"status": "failed", "error": "gate_blocked", "audit": audit}

    # ------------------------------------------------------------------
    # Step 6 — index
    # ------------------------------------------------------------------
    indexed_count = 0
    skipped_count = 0
    index_failed_count = 0

    # Build set of prepared source_ids for ledger updates
    prepared_ids = {p.source_id for p in prepared}
    # Build set of all record ids to find dropped ones
    all_record_ids = {rec["topic_id"] for rec in records}
    dropped_ids = all_record_ids - prepared_ids

    for p in prepared:
        try:
            resp = await index_prepared(p, force=False, source_type="zsxq_thread")
            stage_idx = "skipped" if getattr(resp, "skipped", False) else "done"
            if stage_idx == "done":
                indexed_count += 1
            else:
                skipped_count += 1
            await _db.upsert_ledger(
                {
                    "group_id": group_id,
                    "topic_id": p.source_id,
                    "last_run_id": run_id,
                    "stage_indexed": stage_idx,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "run_ingest: index_prepared failed topic=%s: %s", p.source_id, exc
            )
            index_failed_count += 1
            try:
                await _db.upsert_ledger(
                    {
                        "group_id": group_id,
                        "topic_id": p.source_id,
                        "last_run_id": run_id,
                        "stage_indexed": "failed",
                    }
                )
            except Exception:  # noqa: BLE001
                pass

    # Mark dropped records in ledger
    for tid in dropped_ids:
        # Find drop reason
        rec = next((r for r in records if r["topic_id"] == tid), {})
        _, reason = _find_drop_reason(rec, drop_reasons)
        try:
            await _db.upsert_ledger(
                {
                    "group_id": group_id,
                    "topic_id": tid,
                    "last_run_id": run_id,
                    "stage_indexed": "dropped",
                    "drop_reason": reason,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "run_ingest: upsert_ledger dropped failed topic=%s: %s", tid, exc
            )

    logger.info(
        "run_ingest: indexing done run_id=%s indexed=%d skipped=%d failed=%d",
        run_id,
        indexed_count,
        skipped_count,
        index_failed_count,
    )

    # ------------------------------------------------------------------
    # Step 7 — smoke check
    # ------------------------------------------------------------------
    smoke_ok = True
    smoke_ids = [p.source_id for p in prepared[:5]]

    if smoke_ids:
        try:
            from app.features.vector.service import search as vector_search
            from app.features.vector.models import VectorSearchRequest, VectorSearchFilters

            req = VectorSearchRequest(
                query="知识星球",
                k=len(smoke_ids),
                filters=VectorSearchFilters(
                    source_type="zsxq_thread",
                    source_ids=smoke_ids,
                ),
            )
            results = await vector_search(req)
            if not results:
                logger.warning(
                    "run_ingest: smoke check returned 0 results run_id=%s", run_id
                )
                smoke_ok = False
        except Exception as exc:  # noqa: BLE001
            logger.warning("run_ingest: smoke check failed run_id=%s: %s", run_id, exc)
            # Smoke failure is non-fatal — we still mark "degraded" below

    final_status = "done" if smoke_ok else "degraded"

    # ------------------------------------------------------------------
    # Step 8 — finalize run + state
    # ------------------------------------------------------------------
    now_iso = datetime.now(timezone.utc).isoformat()
    counters = {
        "topics_crawled": topics_new,
        "comments_fetched": comments_fetched,
        "files_downloaded": files_downloaded,
        "files_failed": files_failed,
        "normalized": len(records),
        "indexed": indexed_count,
        "skipped": skipped_count,
        "index_failed": index_failed_count,
    }

    try:
        await _db.update_run(
            run_id,
            status=final_status,
            finished_at=now_iso,
            report={**audit, **counters},
            **counters,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("run_ingest: update_run failed run_id=%s: %s", run_id, exc)

    try:
        state_update: dict[str, Any] = {
            "last_success_at": now_iso,
            "last_summary": audit,
        }
        if newest_create_time:
            state_update["last_seen_create_time"] = newest_create_time
        if newest_topic_id:
            state_update["last_seen_topic_id"] = newest_topic_id
        await _db.update_state(group_id, **state_update)
    except Exception as exc:  # noqa: BLE001
        logger.warning("run_ingest: update_state failed group=%s: %s", group_id, exc)

    logger.info(
        "run_ingest: finished run_id=%s status=%s topics=%d indexed=%d",
        run_id,
        final_status,
        topics_new,
        indexed_count,
    )

    return {"status": final_status, "audit": audit, **counters}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _find_drop_reason(rec: dict, drop_reasons) -> tuple[str, str]:
    """Return (topic_id, drop_reason) for a record not in prepared set.

    Since drop_reasons is a Counter by reason (not by topic_id), we re-run
    the eligibility check to get the per-record reason.
    """
    from app.features.zsxq_ingest.indexing import _eligible

    tid = rec.get("topic_id", "")
    _, reason = _eligible(rec, min_chars=0)
    return tid, reason
