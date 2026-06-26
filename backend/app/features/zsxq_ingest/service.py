"""Orchestration service for 知识星球 (zsxq) ingestion pipeline.

Phase 4: crawl → archive → normalize → audit/gate → index → smoke → report.

Rate-limit cooldown choice
--------------------------
When ``ZsxqRateLimitError`` is raised during crawl we sleep for ``_RATE_LIMIT_COOLDOWN``
seconds (default 600 s / 10 min) and then restart the crawl iterator.  A per-run
*total* budget (``_MAX_RATE_LIMIT_RETRIES``) bounds how many times we do this; once
exhausted the run aborts as ``failed``.  The counter is NOT reset on intervening
successful topics, so a page that keeps rate-limiting cannot loop forever.  A mid-run
restart may re-process already-archived topics — idempotent via ledger upsert + index
content_hash dedup.  The injectable ``_sleep_fn`` lets tests avoid real sleeps.
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
from datetime import datetime, timezone
from typing import Any

import resend

from app.core.config import ADMIN_EMAILS, RESEND_API_KEY
from app.core.logging import get_logger
from app.features.zsxq_ingest import db as _db
from app.features.zsxq_ingest.crawl import ZsxqAuthError, ZsxqRateLimitError
from app.features.zsxq_ingest.indexing import (
    DEFAULT_PERSONA_KEY,
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

BUCKET = "zsxq-archive"

# The Insforge storage gateway (nginx) rejects request bodies larger than ~20MB
# with HTTP 413. Attachments above this are skipped deterministically (logged +
# counted) rather than streamed only to be rejected; the thread *text* is still
# indexed for RAG. ~64KB headroom covers the multipart framing overhead so a file
# at the boundary doesn't 413. Raise this if the platform cap is ever lifted.
MAX_BINARY_UPLOAD_BYTES = 20 * 1024 * 1024 - 64 * 1024

# Emails
_FROM_EMAIL = "TheMarketBrew <daily@themarketbrew.com>"

# Rate-limit cooldown in seconds (injectable via module attribute for tests)
_RATE_LIMIT_COOLDOWN: float = 600.0

# Max TOTAL rate-limit retries per run. NOT reset on success → guarantees the
# crawl loop terminates even if a page is persistently throttled.
_MAX_RATE_LIMIT_RETRIES: int = 2

# Safety cap for a FIRST incremental run (no cursor yet) when no explicit limit
# is given. Prevents an accidental unbounded bulk crawl (anti-ban) the very
# first time the cron fires before the cursor is seeded. Explicit full=true or
# limit=N override this; once a cursor exists, incremental is naturally bounded.
_FIRST_RUN_SAFETY_LIMIT: int = 50

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


async def run_ingest(
    group_id: str, *, full: bool = False, run_id: str, limit: int | None = None
) -> dict[str, Any]:
    """Orchestrate a full or incremental ingest for *group_id*.

    Parameters
    ----------
    group_id:
        The zsxq group ID string.
    full:
        If True, ignore the incremental cursor and crawl all topics.
    run_id:
        Pre-created run ID from ``db.create_run``.
    limit:
        If set, stop crawling after this many topics. Used for a small,
        controlled first run (avoids a bulk crawl during validation).

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
        # Do NOT email here. A non-active status was set — and the admin already
        # alerted — at the crawl-time transition below (the active→failed flip).
        # Re-alerting on every blocked tick would spam the admin ~6×/day at the
        # 4h schedule cadence; the monitoring view surfaces the persistent state.
        logger.warning(
            "run_ingest: credential not active (status=%s) run_id=%s — skipping "
            "crawl, no re-alert (already notified at expiry)",
            kind,
            run_id,
        )
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

    # Safety: a first incremental run (no cursor) with no explicit limit would
    # crawl everything → bulk. Cap it unless the caller explicitly asked for
    # full=true or a limit. (Once the cursor is seeded, stop bounds the crawl.)
    effective_limit = limit
    if not full and stop is None and limit is None:
        effective_limit = _FIRST_RUN_SAFETY_LIMIT
        logger.warning(
            "run_ingest: incremental run with no cursor and no limit — applying "
            "first-run safety cap of %d (run_id=%s). Use full=true or a higher "
            "limit to override.",
            _FIRST_RUN_SAFETY_LIMIT,
            run_id,
        )

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

    rate_limit_retries = 0
    limit_hit = False  # True if the crawl stopped early due to limit/safety cap

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
            rate_limit_retries += 1
            logger.warning(
                "run_ingest: ZsxqRateLimitError #%d/%d run_id=%s — sleeping %ss",
                rate_limit_retries,
                _MAX_RATE_LIMIT_RETRIES,
                run_id,
                _RATE_LIMIT_COOLDOWN,
            )
            if rate_limit_retries > _MAX_RATE_LIMIT_RETRIES:
                # Total per-run budget exhausted — abort. The counter is never
                # reset, so a persistently throttled page cannot loop forever.
                logger.error(
                    "run_ingest: rate-limit budget (%d) exhausted — aborting run_id=%s",
                    _MAX_RATE_LIMIT_RETRIES,
                    run_id,
                )
                await _db.update_run(
                    run_id,
                    status="failed",
                    error_message="rate limit budget exhausted: %s" % e,
                )
                return {"status": "failed", "error": "rate_limit_abort"}
            await _sleep_fn(_RATE_LIMIT_COOLDOWN)
            # Restart the iterator (generator cursor is lost on re-raise). Already-
            # crawled topics may be re-processed — idempotent via ledger upsert +
            # index content_hash dedup. Bounded by the budget above.
            topic_iter = client.iter_topics(stop_create_time=stop, full=full)
            continue
        except Exception as e:  # noqa: BLE001
            logger.exception("run_ingest: unexpected error during crawl run_id=%s", run_id)
            await _db.update_run(run_id, status="failed", error_message=str(e))
            return {"status": "failed", "error": str(e)}

        # NOTE: rate_limit_retries is intentionally NOT reset here — it is a
        # total per-run budget so a persistently throttled crawl always ends.

        tid = str(topic.get("topic_id", ""))
        create_time = topic.get("create_time")
        topic_type = topic.get("type", "talk")

        # Track newest (first yielded = newest in descending order)
        if newest_create_time is None:
            newest_create_time = create_time
            newest_topic_id = tid

        # Archive raw JSON
        date_str = (create_time or "")[:10] or "unknown"
        # Bucket scheme — top-level prefix = data category (avoids a data swamp):
        #   topics/      = crawled raw topic JSON (the scrape)
        #   attachments/ = downloaded files (user-uploaded binaries)
        #   normalized/  = derived exports
        raw_key = f"topics/zsxq/{group_id}/{date_str}/topic-{tid}.json"
        raw_bytes = json.dumps(topic, ensure_ascii=False).encode("utf-8")
        try:
            obj_result = await _db.upload_binary(
                BUCKET, raw_key, raw_bytes, content_type="application/json"
            )
            storage_key = obj_result.get("key", raw_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("run_ingest: raw archive upload failed topic=%s: %s", tid, exc)
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
        binary_storage_keys: list[str] = []

        _bin_talk = topic.get("talk") or {}
        if _bin_talk.get("files") or _bin_talk.get("images"):
            # Collect bytes synchronously (no event loop inside save_fn)
            _collected_binaries: list[tuple[str, bytes]] = []

            def _sync_save_fn(filename: str, content: bytes) -> bool:
                _collected_binaries.append((filename, content))
                return True

            _download_failed = False
            try:
                dl_count, dl_failed = client.download_binaries(topic, _sync_save_fn)
                files_downloaded += dl_count
                files_failed += dl_failed
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "run_ingest: download_binaries failed topic=%s: %s", tid, exc
                )
                _download_failed = True

            # Now upload each collected binary in the async context. Binaries go
            # via the DIRECT storage REST path (db.upload_binary) — NOT the
            # base64-in-JSON edge function — so large attachments (PDFs etc.) work.
            # Files above the gateway cap are skipped deterministically: streaming
            # them only earns an HTTP 413 and noisy logs (see MAX_BINARY_UPLOAD_BYTES).
            _upload_failed = 0
            _skipped_oversize = 0
            for _bin_name, _bin_content in _collected_binaries:
                _safe_name = _bin_name.replace("/", "_")
                _bin_key = f"attachments/zsxq/{group_id}/{tid}/{_safe_name}"
                if len(_bin_content) > MAX_BINARY_UPLOAD_BYTES:
                    _skipped_oversize += 1
                    logger.warning(
                        "run_ingest: skipping oversize binary %s (%d bytes > %d cap)",
                        _bin_key, len(_bin_content), MAX_BINARY_UPLOAD_BYTES,
                    )
                    continue
                _ctype = mimetypes.guess_type(_safe_name)[0] or "application/octet-stream"
                try:
                    await _db.upload_binary(BUCKET, _bin_key, _bin_content, content_type=_ctype)
                    binary_storage_keys.append(_bin_key)
                except Exception as exc:  # noqa: BLE001
                    _upload_failed += 1
                    logger.warning(
                        "run_ingest: upload_binary failed %s: %s", _bin_key, exc
                    )

            # stage_binaries reflects what actually reached the bucket:
            #   failed  → the download itself failed (nothing collected)
            #   partial → something couldn't be archived (oversize or upload error)
            #   done    → every collected binary was stored
            # The not-archived count is surfaced via binaries_failed in the ledger.
            _not_archived = _upload_failed + _skipped_oversize
            if _download_failed:
                stage_binaries = "failed"
            elif _not_archived:
                stage_binaries = "partial"
                dl_failed += _not_archived
            else:
                stage_binaries = "done"

        # Determine author role for ledger (creator_ids not yet built; use owner check only)
        talk = topic.get("talk") or {}
        talk_owner = talk.get("owner") or {}
        uid = str(talk_owner.get("user_id") or "")
        if uid == OWNER_USER_ID:
            author_role = "owner"
        else:
            author_role = "member"  # refined below after creator_ids is built

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
                    "storage_keys": [storage_key] + binary_storage_keys,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("run_ingest: upsert_ledger crawl failed topic=%s: %s", tid, exc)

        raw_topics.append(topic)
        topics_new += 1
        topics_seen += 1

        if effective_limit and len(raw_topics) >= effective_limit:
            logger.info(
                "run_ingest: hit limit=%d — stopping crawl run_id=%s",
                effective_limit, run_id,
            )
            limit_hit = True
            break

    logger.info(
        "run_ingest: crawl done run_id=%s topics=%d", run_id, len(raw_topics)
    )

    # ------------------------------------------------------------------
    # Step 3b — creator eligibility from the group's OFFICIAL roles.
    # zsxq lets ordinary members post topics too, so "authored a topic =
    # creator" over-includes member chatter. Fetch the real roles (owner +
    # admins + guests + partners) from /groups/{id}; members get role=member
    # and are dropped by indexing._eligible. On fetch failure, fall back to
    # owner-only — never silently index member content (handbook: no role →
    # don't ingest).
    # ------------------------------------------------------------------
    try:
        creator_ids = client.fetch_creator_ids()
        logger.info(
            "run_ingest: fetched %d official creator ids run_id=%s",
            len(creator_ids), run_id,
        )
    except Exception as exc:  # noqa: BLE001
        creator_ids = {int(OWNER_USER_ID)}
        logger.warning(
            "run_ingest: fetch_creator_ids failed (%s) — falling back to owner-only "
            "(skips all member + creator topics this run to avoid pollution) run_id=%s",
            exc, run_id,
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
                creator_ids=creator_ids,
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
            await _db.upload_binary(
                BUCKET, jsonl_key, jsonl_bytes, content_type="application/x-ndjson"
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("run_ingest: jsonl archive upload failed run_id=%s: %s", run_id, exc)

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
    _PREPARE_MIN_CHARS = 0  # keep in sync with _find_drop_reason below
    prepared, drop_reasons = prepare_records(records, min_chars=_PREPARE_MIN_CHARS)
    audit = audit_distribution(records, prepared, drop_reasons)

    last_summary = state.get("last_summary") or {}
    prev_selected = last_summary.get("selected", 0)
    curr_selected = audit.get("selected", 0)

    # The audit gate guards a broken FULL crawl from indexing far fewer records
    # than the last full run. It does NOT apply to incremental or limited runs,
    # where a small `selected` is expected by design (only new topics, or capped
    # by `limit`) — otherwise every incremental run would false-positive.
    gate_active = full and limit is None
    if gate_active and gate_should_block(prev_selected, curr_selected):
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
        # Find drop reason using the same min_chars as prepare_records above
        rec = next((r for r in records if r["topic_id"] == tid), {})
        _, reason = _find_drop_reason(rec, drop_reasons, min_chars=_PREPARE_MIN_CHARS)
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

            # Use a real indexed doc's text as the query so it should self-retrieve,
            # filtered to the zsxq_thread corpus with a low threshold. Then verify
            # the sampled ids actually come back — searching all data (the previous
            # bug) could pass on unrelated chunks.
            probe = next((p for p in prepared if p.source_id in smoke_ids), None)
            query_text = (probe.title or probe.content[:200]) if probe else "知识星球"
            req = VectorSearchRequest(
                query=query_text,
                top_k=50,
                threshold=0.0,
                filters=VectorSearchFilters(source_types=["zsxq_thread"]),
            )
            resp = await vector_search(req)
            results = resp.results or []
            returned_ids = {r.source_id for r in results}
            found = returned_ids & set(smoke_ids)
            # The Panda persona retrieves via metadata.author_username=pandacircle
            # (the retrieval pin). Generic vector search can find a doc even if that
            # pin is missing, but the PERSONA then can't — so assert the sampled
            # chunks carry the pin, otherwise the crawl didn't actually feed the
            # persona corpus.
            found_chunks = [r for r in results if r.source_id in found]
            pin_ok = bool(found_chunks) and all(
                (getattr(r, "metadata", None) or {}).get("author_username")
                == DEFAULT_PERSONA_KEY
                for r in found_chunks
            )
            if not found:
                logger.warning(
                    "run_ingest: smoke found none of %d sampled ids "
                    "(%d zsxq_thread results) run_id=%s",
                    len(smoke_ids), len(returned_ids), run_id,
                )
                smoke_ok = False
            elif not pin_ok:
                logger.warning(
                    "run_ingest: smoke — retrieved chunks missing "
                    "author_username=%s persona pin (Panda persona cannot retrieve "
                    "this content) run_id=%s",
                    DEFAULT_PERSONA_KEY, run_id,
                )
                smoke_ok = False
            else:
                logger.info(
                    "run_ingest: smoke ok — %d/%d sampled ids retrievable + "
                    "persona-pinned (author_username=%s) run_id=%s",
                    len(found), len(smoke_ids), DEFAULT_PERSONA_KEY, run_id,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("run_ingest: smoke check failed run_id=%s: %s", run_id, exc)
            smoke_ok = False  # treat smoke errors as degraded, not success

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
            # Bridge two report/counters keys to their differently-named run-row
            # columns (the edge-function update_run allowlist drops anything else):
            #   topics_seen  ← topics_crawled (== topics_new) — the 抓取 metric
            #   failed       ← index_failed                   — the 失败 metric
            # Without these the columns keep their 0 default and the job-monitor
            # shows a contradictory "抓取 0 · 入库 N" / masks real index failures.
            topics_seen=topics_seen,
            failed=index_failed_count,
            **counters,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("run_ingest: update_run failed run_id=%s: %s", run_id, exc)

    try:
        state_update: dict[str, Any] = {"last_success_at": now_iso}
        # Only a FULL unlimited run resets the gate baseline (last_summary).
        # Incremental/limited runs select few records by design; overwriting the
        # baseline with that small number would defeat the full-run gate.
        if full and limit is None:
            state_update["last_summary"] = audit
        # Only advance the cursor when the crawl ended naturally (reached the old
        # cursor or ran out of topics). If it stopped early on a limit/safety cap,
        # newer un-crawled topics may remain below `newest_create_time`, so
        # advancing would skip them — leave the cursor where it was.
        if newest_create_time and not limit_hit:
            state_update["last_seen_create_time"] = newest_create_time
        if newest_topic_id and not limit_hit:
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


def _find_drop_reason(rec: dict, drop_reasons, *, min_chars: int = 0) -> tuple[str, str]:
    """Return (topic_id, drop_reason) for a record not in prepared set.

    Since drop_reasons is a Counter by reason (not by topic_id), we re-run
    the eligibility check to get the per-record reason.  ``min_chars`` must
    match the value passed to ``prepare_records`` so the eligibility verdict
    is consistent.
    """
    from app.features.zsxq_ingest.indexing import _eligible

    tid = rec.get("topic_id", "")
    _, reason = _eligible(rec, min_chars=min_chars)
    return tid, reason
