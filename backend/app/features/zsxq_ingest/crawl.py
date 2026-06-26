"""
知识星球 cookie-based web-app API crawler client.

Ports the battle-tested anti-ban mechanics from zsxq_interactive_crawler.py
and zsxq_retry.py (in the zsxq-crawler-workspace reference repo) faithfully:

Key mechanics:
- Cursor pagination: last topic's create_time - offset_ms → next end_time
- Incremental stop: stop_create_time halts mid-stream (ignored when full=True)
- Rate limiting: random per-page delay (min_delay..max_delay) + periodic
  long sleep every long_delay_interval pages (random in long_delay_range)
- Error split: 401 → cookie_expired, 403 → access_denied, 14210 → membership_expired,
  429 → ZsxqRateLimitError, code=1059 → ZsxqRetryableError (retried with backoff)
- Retryable codes: {1059} — from zsxq_retry.GLOBAL_API_RETRY_CODES
- Retry wait schedule (from zsxq_retry.retry_wait_seconds):
    retries 0-2 → 2s, retries 3-5 → 5s, retries 6+ → 10s
- Max retries: 10 (from zsxq_retry.GLOBAL_API_MAX_RETRIES)
- Comments: timeline embeds ≤8; only fetch full list when comments_count > 8
  paginated by last comment create_time, count=30; failure returns partial
- Binaries: download_url per attachment, then fetch bytes; injected save_fn;
  failures counted but do not abort
"""
from __future__ import annotations

import html
import random
import re
import time
from datetime import datetime, timedelta
from typing import Any, Callable, Generator, List, Optional, Tuple

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Article HTML → plain text
# ---------------------------------------------------------------------------

_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.S | re.I)
_BLOCK_CLOSE_RE = re.compile(r"</(p|div|h[1-6]|li|tr|section|article|blockquote)\s*>", re.I)
_BR_RE = re.compile(r"<br\s*/?>", re.I)
_ANY_TAG_RE = re.compile(r"<[^>]+>")

# Trailing page chrome on zsxq article pages (join-group CTA etc.) — not content.
_ARTICLE_CHROME_LINES = {"知识星球", "扫码加入星球", "查看更多优质内容", "查看更多精彩内容"}


def _extract_article_text(html_str: str) -> str:
    """Extract readable plain text from a zsxq article HTML page.

    zsxq long-form posts ("articles") keep their full body in a separate HTML
    document (``talk.article.article_url``); the topic feed only carries a
    truncated ``talk.text`` preview. Strips scripts/styles/tags and preserves
    paragraph breaks so the full body can be indexed.
    """
    if not html_str:
        return ""
    s = _SCRIPT_STYLE_RE.sub("", html_str)
    s = _BLOCK_CLOSE_RE.sub("\n", s)
    s = _BR_RE.sub("\n", s)
    s = _ANY_TAG_RE.sub("", s)
    s = html.unescape(s)
    out: list[str] = []
    prev_blank = False
    for raw_line in s.split("\n"):
        line = raw_line.strip()
        if not line:
            if out and not prev_blank:
                out.append("")
            prev_blank = True
        else:
            out.append(line)
            prev_blank = False
    # zsxq article pages repeat the title line; drop the leading duplicate(s).
    while len(out) >= 2 and out[0] and out[0] == out[1]:
        out.pop(0)
    # Cut the trailing join-group CTA (a "…/join_group.html…" link) and any
    # adjacent page-chrome lines so only article body is indexed.
    for i, line in enumerate(out):
        if "join_group" in line and "zsxq.com" in line:
            out = out[:i]
            break
    while out and (out[-1] == "" or out[-1] in _ARTICLE_CHROME_LINES):
        out.pop()
    return "\n".join(out).strip()

# ---------------------------------------------------------------------------
# Retry constants — ported from zsxq_retry.py
# ---------------------------------------------------------------------------

_ANTI_CRAWL_CODE = 1059
_GLOBAL_RETRY_CODES = {_ANTI_CRAWL_CODE}
_GLOBAL_MAX_RETRIES = 10  # zsxq_retry.GLOBAL_API_MAX_RETRIES


def _retry_wait(retry_index: int) -> int:
    """Stepped backoff — from zsxq_retry.retry_wait_seconds."""
    if retry_index < 3:
        return 2
    if retry_index < 6:
        return 5
    return 10


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ZsxqAuthError(Exception):
    """Authentication / membership error — do NOT retry."""

    def __init__(self, kind: str, message: str = "") -> None:
        # kind in {"cookie_expired", "access_denied", "membership_expired"}
        self.kind = kind
        self.message = message
        super().__init__(f"ZsxqAuthError(kind={kind!r}): {message}")


class ZsxqRateLimitError(Exception):
    """HTTP 429 — caller should back off before retrying."""


class ZsxqRetryableError(Exception):
    """API returned a retryable error code (e.g. 1059 anti-crawl)."""

    def __init__(self, code: int, message: str = "") -> None:
        self.code = code
        self.message = message
        super().__init__(f"ZsxqRetryableError(code={code}): {message}")


class ZsxqApiError(Exception):
    """Non-retryable API error."""

    def __init__(self, code: int, message: str = "") -> None:
        self.code = code
        self.message = message
        super().__init__(f"ZsxqApiError(code={code}): {message}")


# ---------------------------------------------------------------------------
# Timestamp helper
# ---------------------------------------------------------------------------

def next_end_time(create_time: str, *, offset_ms: int = 1) -> str:
    """
    Return create_time - offset_ms formatted as YYYY-MM-DDTHH:MM:SS.fff+0800.

    Ported from zsxq_interactive_crawler.crawl_historical (lines 788-795):

        dt = datetime.fromisoformat(original_time.replace('+0800', '+08:00'))
        dt = dt - timedelta(milliseconds=self.timestamp_offset_ms)
        end_time = dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + '+0800'

    The real crawler always uses '+0800' (not '+08:00') in the output.
    """
    dt = datetime.fromisoformat(create_time.replace("+0800", "+08:00"))
    dt = dt - timedelta(milliseconds=offset_ms)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+0800"


# ---------------------------------------------------------------------------
# Main client
# ---------------------------------------------------------------------------

class ZsxqClient:
    """
    Cookie-based client for the zsxq internal web-app API.

    Parameters
    ----------
    cookie:
        Full cookie string (verbatim from browser DevTools).
    group_id:
        Target group ID (string).
    min_delay, max_delay:
        Per-page delay range in seconds (default 2.0–5.0 from real crawler).
    long_delay_interval:
        Number of successfully processed pages between long sleeps (default 15).
    long_delay_range:
        (min_seconds, max_seconds) for the long sleep (default 180–300s = 3–5 min).
    offset_ms:
        Milliseconds subtracted from last topic's create_time for cursor (default 1).
    """

    BASE_URL = "https://api.zsxq.com/v2"

    # From zsxq_interactive_crawler.get_stealth_headers — real UA pool
    _USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ]

    def __init__(
        self,
        cookie: str,
        group_id: str,
        *,
        min_delay: float = 2.0,
        max_delay: float = 5.0,
        long_delay_interval: int = 15,
        long_delay_range: Tuple[float, float] = (180.0, 300.0),
        offset_ms: int = 1,
    ) -> None:
        self.cookie = cookie
        self.group_id = group_id
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.long_delay_interval = long_delay_interval
        self.long_delay_range = long_delay_range
        self.offset_ms = offset_ms

        # httpx sync client (no live calls in tests — _http.get is monkeypatched)
        self._http = httpx.Client(timeout=30.0)
        self._page_count = 0  # tracks successfully yielded pages for long-sleep trigger

        logger.info("ZsxqClient initialised for group %s", group_id)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _headers(self) -> dict:
        """Return stealth headers matching what the real crawler sends.

        Ported from ZSXQInteractiveCrawler.get_stealth_headers().
        """
        return {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7",
            "Cache-Control": "no-cache",
            "Cookie": self.cookie,
            "Origin": "https://wx.zsxq.com",
            "Pragma": "no-cache",
            "Priority": "u=1, i",
            "Referer": "https://wx.zsxq.com/",
            "Sec-Ch-Ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": random.choice(self._USER_AGENTS),
            "X-Aduid": "a3be07cd6-dd67-3912-0093-862d844e7fe",
            "X-Request-Id": f"dcc5cb6ab-1bc3-8273-cc26-{random.randint(100000000000, 999999999999)}",
            "X-Signature": "733fd672ddf6d4e367730d9622cdd1e28a4b6203",
            "X-Timestamp": str(int(time.time())),
            "X-Version": "2.77.0",
        }

    def _sleep(self, seconds: float) -> None:
        """Sleep for `seconds`. Replaced in tests via monkeypatching."""
        time.sleep(seconds)

    def _smart_delay(self) -> None:
        """Random per-page delay (min_delay..max_delay).

        Ported from ZSXQInteractiveCrawler.smart_delay().
        """
        delay = random.uniform(self.min_delay, self.max_delay)
        logger.debug("smart_delay %.2fs", delay)
        self._sleep(delay)

    def _maybe_long_delay(self) -> None:
        """Increment page count and trigger a long sleep every long_delay_interval pages.

        Owns the _page_count increment so iter_topics doesn't need to manage it.

        Ported from ZSXQInteractiveCrawler.check_page_long_delay():
            - Default long sleep range: 180–300s (3–5 minutes)
            - Triggered on page_count % long_delay_interval == 0
        """
        self._page_count += 1
        if self._page_count % self.long_delay_interval == 0:
            lo, hi = self.long_delay_range
            delay = random.uniform(lo, hi)
            logger.info(
                "long sleep %.1fs after %d pages (interval=%d)",
                delay,
                self._page_count,
                self.long_delay_interval,
            )
            self._sleep(delay)

    # ------------------------------------------------------------------
    # Shared fetch-with-retry helper
    # ------------------------------------------------------------------

    def _fetch_with_retry(self, url: str, params: dict) -> dict:
        """
        GET `url` with `params`, run _handle_response, and retry on
        ZsxqRetryableError (code 1059) up to _GLOBAL_MAX_RETRIES times
        using the stepped _retry_wait backoff.

        Behaviour:
        - ZsxqAuthError  → propagates immediately (no retry)
        - ZsxqRateLimitError (429) → one backoff sleep then re-raises
        - ZsxqRetryableError (1059) → retried up to _GLOBAL_MAX_RETRIES
        - ZsxqApiError   → propagates immediately (no retry)

        Returns the resp_data dict on success.
        """
        last_exc: Optional[Exception] = None
        for attempt in range(_GLOBAL_MAX_RETRIES):
            try:
                logger.debug("_fetch_with_retry attempt=%d url=%s", attempt, url)
                resp = self._http.get(url, headers=self._headers(), params=params, timeout=10)
                return self._handle_response(resp)

            except ZsxqAuthError:
                raise

            except ZsxqRateLimitError:
                wait = _retry_wait(attempt)
                logger.warning("429 rate-limit on attempt %d, sleeping %ds", attempt, wait)
                self._sleep(wait)
                raise

            except ZsxqRetryableError as exc:
                wait = _retry_wait(attempt)
                logger.warning(
                    "retryable code=%d attempt=%d/%d, sleeping %ds",
                    exc.code,
                    attempt + 1,
                    _GLOBAL_MAX_RETRIES,
                    wait,
                )
                if attempt < _GLOBAL_MAX_RETRIES - 1:
                    self._sleep(wait)
                    last_exc = exc
                    continue
                raise

            except ZsxqApiError:
                raise

        if last_exc:
            raise last_exc
        raise ZsxqApiError(-1, "Max retries exhausted")

    # ------------------------------------------------------------------
    # Response handling (the error split)
    # ------------------------------------------------------------------

    def _handle_response(self, response: httpx.Response) -> dict:
        """
        Parse an httpx.Response and return resp_data on success.

        Error split (ported from fetch_topics_safe lines 591-628):
        - HTTP 401 → ZsxqAuthError(kind="cookie_expired")
        - HTTP 403 → ZsxqAuthError(kind="access_denied")
        - HTTP 429 → ZsxqRateLimitError
        - JSON code 14210 → ZsxqAuthError(kind="membership_expired")
        - JSON code in GLOBAL_RETRY_CODES (1059) → ZsxqRetryableError
        - succeeded=True → returns resp_data dict
        - other non-success codes → ZsxqApiError (non-retryable)

        Raises
        ------
        ZsxqAuthError, ZsxqRateLimitError, ZsxqRetryableError, ZsxqApiError
        """
        status = response.status_code

        if status == 401:
            raise ZsxqAuthError("cookie_expired", "HTTP 401 — cookie expired or invalid")
        if status == 403:
            raise ZsxqAuthError("access_denied", "HTTP 403 — access denied")
        if status == 429:
            raise ZsxqRateLimitError("HTTP 429 — rate limited")

        if status != 200:
            raise ZsxqApiError(status, f"Unexpected HTTP {status}")

        try:
            data = response.json()
        except Exception as exc:
            raise ZsxqApiError(-1, f"JSON parse error: {exc}") from exc

        if data.get("succeeded"):
            return data.get("resp_data", {})

        code = data.get("code")
        error_msg = data.get("error") or data.get("message") or "unknown error"

        # Membership expired (special-cased in real crawler line 595-599)
        if code == 14210:
            raise ZsxqAuthError("membership_expired", error_msg)

        # Global retryable codes from zsxq_retry.py: {1059}
        if code in _GLOBAL_RETRY_CODES:
            raise ZsxqRetryableError(code, error_msg)

        # All other API failures are non-retryable
        raise ZsxqApiError(code or -1, error_msg)

    # ------------------------------------------------------------------
    # Topic page fetch (with retry/backoff)
    # ------------------------------------------------------------------

    def _fetch_topics_page(
        self,
        *,
        scope: str = "all",
        end_time: Optional[str] = None,
        count: int = 20,
    ) -> dict:
        """
        Fetch one page of topics via the shared _fetch_with_retry helper.

        Returns the resp_data dict (contains "topics" list).
        """
        url = f"{self.BASE_URL}/groups/{self.group_id}/topics"
        params: dict = {"scope": scope, "count": str(count)}
        if end_time is not None:
            params["end_time"] = end_time
        logger.debug("_fetch_topics_page scope=%s end_time=%s", scope, end_time)
        return self._fetch_with_retry(url, params)

    def fetch_creator_ids(self) -> set[int]:
        """Return the group's OFFICIAL content-author roles from ``/groups/{id}``.

        zsxq lets ordinary members post topics too, so "authored a topic =
        creator" over-includes member chatter (questions, thank-yous). The real
        creators are the group ``owner`` + ``admin_ids`` (管理员) + ``guest_ids``
        (嘉宾) + ``partner_ids`` (合伙人); everyone else is a plain member whose
        posts must NOT enter the persona corpus. Returns the set of creator
        user_ids (incl. the owner). Raises like any other fetch on failure — the
        caller decides the fallback.
        """
        data = self._fetch_with_retry(f"{self.BASE_URL}/groups/{self.group_id}", {})
        grp = (data or {}).get("group") or {}
        ids: set[int] = set()
        owner_uid = (grp.get("owner") or {}).get("user_id")
        if owner_uid:
            ids.add(int(owner_uid))
        for key in ("admin_ids", "guest_ids", "partner_ids"):
            for uid in (grp.get(key) or []):
                try:
                    ids.add(int(uid))
                except (TypeError, ValueError):
                    continue
        logger.info(
            "fetch_creator_ids: %d official creators (owner+admins+guests+partners) group=%s",
            len(ids), self.group_id,
        )
        return ids

    # ------------------------------------------------------------------
    # Topic iteration (cursor pagination + incremental stop)
    # ------------------------------------------------------------------

    def iter_topics(
        self,
        *,
        scope: str = "all",
        count: int = 20,
        stop_create_time: Optional[str] = None,
        full: bool = False,
    ) -> Generator[dict, None, None]:
        """
        Generator that yields topic dicts across pages, advancing the cursor.

        Cursor mechanics (ported from crawl_historical / crawl_incremental):
        - First page: no end_time parameter
        - Subsequent pages: end_time = next_end_time(last_topic.create_time)
        - Empty topics list → stop

        Incremental stop:
        - If stop_create_time is set and full=False, stop yielding (and stop
          fetching) when a topic's create_time <= stop_create_time

        Rate limiting:
        - After each successful page: _smart_delay()
        - After every long_delay_interval pages: _maybe_long_delay()
        """
        end_time: Optional[str] = None
        self._page_count = 0

        while True:
            resp_data = self._fetch_topics_page(scope=scope, end_time=end_time, count=count)
            topics: List[dict] = resp_data.get("topics", [])

            if not topics:
                logger.info("iter_topics: empty page — done")
                break

            # Incremental stop check + yield
            page_done = False
            for topic in topics:
                if not full and stop_create_time is not None:
                    if topic.get("create_time", "") <= stop_create_time:
                        logger.info(
                            "iter_topics: reached stop_create_time %s — stopping",
                            stop_create_time,
                        )
                        page_done = True
                        break
                yield topic

            if page_done:
                break

            # Advance cursor to next_end_time of the last topic
            last_create_time = topics[-1].get("create_time")
            if last_create_time:
                end_time = next_end_time(last_create_time, offset_ms=self.offset_ms)
                logger.debug("iter_topics: next end_time=%s", end_time)
            else:
                logger.warning("iter_topics: last topic has no create_time — stopping")
                break

            # Per-page delay
            self._smart_delay()

            # Increment page count and possibly trigger long sleep
            self._maybe_long_delay()

    # ------------------------------------------------------------------
    # Comments (full list when > 8)
    # ------------------------------------------------------------------

    def fetch_full_comments(self, topic: dict) -> List[dict]:
        """
        Fetch the full comment list for a topic when comments_count > 8.

        Ported from fetch_all_comments() + fetch_comments_safe():
        - timeline embeds include ≤8 comments (show_comments field)
        - only fetch paginated full list when comments_count > 8
        - pagination: last comment's create_time + 1ms (using _increment_time)
        - page size: 30 (real crawler default)
        - max retries per page: 10
        - failure on any page returns partial result without raising

        Returns
        -------
        List of comment dicts (empty if comments_count <= 8 or total failure).
        """
        comments_count = topic.get("comments_count", 0)
        topic_id = topic.get("topic_id")

        if comments_count <= 8:
            logger.debug(
                "fetch_full_comments: topic %s has %d comments, skip (<=8)",
                topic_id,
                comments_count,
            )
            return []

        logger.info(
            "fetch_full_comments: topic %s has %d comments, fetching full list",
            topic_id,
            comments_count,
        )

        url = f"{self.BASE_URL}/topics/{topic_id}/comments"
        all_comments: List[dict] = []
        begin_time: Optional[str] = None
        page = 0

        while True:
            page += 1
            params: dict = {"sort": "asc", "count": "30", "with_sticky": "true"}
            if begin_time:
                params["begin_time"] = begin_time

            try:
                resp_data = self._fetch_with_retry(url, params)
                comments: List[dict] = resp_data.get("comments", [])
                if not comments:
                    logger.debug(
                        "fetch_full_comments: topic %s page %d empty — done", topic_id, page
                    )
                    break

                all_comments.extend(comments)
                logger.debug(
                    "fetch_full_comments: topic %s page %d got %d comments (total %d)",
                    topic_id,
                    page,
                    len(comments),
                    len(all_comments),
                )

                # Last page when we got fewer than 30
                if len(comments) < 30:
                    break

                # Cursor: last comment's create_time + 1ms (increment, not decrement)
                last_time = comments[-1].get("create_time")
                if last_time:
                    begin_time = self._increment_time(last_time)
                else:
                    logger.warning(
                        "fetch_full_comments: topic %s page %d — no create_time on last comment",
                        topic_id,
                        page,
                    )
                    break

            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "fetch_full_comments: topic %s page %d exception %s — returning partial",
                    topic_id,
                    page,
                    exc,
                )
                break

        return all_comments

    # ------------------------------------------------------------------
    # Article body (long-form posts)
    # ------------------------------------------------------------------

    def _article_headers(self) -> dict:
        """Headers for fetching an article HTML page (articles.zsxq.com)."""
        return {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cookie": self.cookie,
            "Referer": "https://wx.zsxq.com/",
            "User-Agent": random.choice(self._USER_AGENTS),
        }

    def fetch_article_text(self, topic: dict) -> Optional[str]:
        """Fetch the full body of an "article" (long-form) topic.

        zsxq stores long posts as a separate article: the topic feed's
        ``talk.text`` is only a truncated preview ending in "…", and the full
        body lives at ``talk.article.{inline_article_url,article_url}``. When an
        article is present, GET it (cookie-authed) and return the extracted
        plain-text body.

        Returns ``None`` when there is no article, on non-200, on empty
        extraction, or on any exception — the caller then keeps the preview.
        """
        article = (topic.get("talk") or {}).get("article") or {}
        url = article.get("inline_article_url") or article.get("article_url")
        if not url:
            return None

        topic_id = topic.get("topic_id")
        try:
            resp = self._http.get(url, headers=self._article_headers(), timeout=20)
            if resp.status_code != 200:
                logger.warning(
                    "fetch_article_text: topic %s HTTP %d", topic_id, resp.status_code
                )
                return None
            text = _extract_article_text(resp.text)
            # An extra cross-host request — pace it like a page fetch (anti-ban).
            self._smart_delay()
            if not text:
                logger.warning("fetch_article_text: topic %s empty extraction", topic_id)
                return None
            logger.info(
                "fetch_article_text: topic %s fetched full body (%d chars)",
                topic_id,
                len(text),
            )
            return text
        except Exception as exc:  # noqa: BLE001
            logger.warning("fetch_article_text: topic %s failed: %s", topic_id, exc)
            return None

    def fetch_topic_by_id(self, topic_id: str) -> Optional[dict]:
        """Fetch a single topic's detail via ``GET /topics/{id}``.

        Used by the by-ids article backfill to reach topics that were indexed
        from a local export and never archived to the bucket. Returns the topic
        dict (carries ``talk.article`` for long-form posts) or ``None`` when the
        topic is unavailable (deleted) or any error occurs — the caller counts
        it as a skip and moves on.
        """
        url = f"{self.BASE_URL}/topics/{topic_id}"
        try:
            data = self._fetch_with_retry(url, {})
            return (data or {}).get("topic")
        except Exception as exc:  # noqa: BLE001 — a single bad/deleted topic must not abort the batch
            logger.warning("fetch_topic_by_id: topic %s failed: %s", topic_id, exc)
            return None

    # ------------------------------------------------------------------
    # Binary downloads
    # ------------------------------------------------------------------

    def download_binaries(
        self,
        topic: dict,
        save_fn: Callable[[str, bytes], bool],
    ) -> Tuple[int, int]:
        """
        Download attachments for a topic and persist via injected save_fn.

        Ported from ZSXQFileDownloader mechanics:
        1. For file attachments: GET /v2/files/{file_id}/download_url → signed URL
        2. Fetch signed URL bytes
        3. Call save_fn(filename, content_bytes) — where bytes land is decided elsewhere

        Parameters
        ----------
        topic:
            Raw topic dict from the API.
        save_fn:
            Callable(name: str, content: bytes) -> bool.
            Called for each successfully downloaded file.
            Return value is ignored; any exception is caught and counted as failure.

        Returns
        -------
        (downloaded_count, failed_count)
        """
        # Real zsxq payloads have NO top-level "attachments" field — files live
        # at talk.files and images at talk.images (matches normalize.py). Adapt
        # them into the internal attachment shape this loop already consumes.
        talk = topic.get("talk") or {}
        files = talk.get("files") or topic.get("files") or []
        images = talk.get("images") or topic.get("images") or []
        attachments: List[dict] = [{"type": "file", "file": f} for f in files]
        attachments += [
            {"type": "image", "original": (img.get("original") or img.get("large") or img.get("thumbnail") or {})}
            for img in images
        ]
        if not attachments:
            return 0, 0

        downloaded = 0
        failed = 0

        for attachment in attachments:
            atype = attachment.get("type")
            try:
                if atype == "file":
                    file_info = attachment.get("file", {})
                    file_id = file_info.get("file_id")
                    filename = file_info.get("name", f"file_{file_id}")

                    # Step 1: get signed download URL
                    url_resp = self._http.get(
                        f"{self.BASE_URL}/files/{file_id}/download_url",
                        headers=self._headers(),
                        timeout=10,
                    )
                    if url_resp.status_code != 200:
                        logger.warning(
                            "download_binaries: file_id=%s get download_url HTTP %d",
                            file_id,
                            url_resp.status_code,
                        )
                        failed += 1
                        continue

                    url_data = url_resp.json()
                    if not url_data.get("succeeded"):
                        logger.warning(
                            "download_binaries: file_id=%s download_url API error code=%s",
                            file_id,
                            url_data.get("code"),
                        )
                        failed += 1
                        continue

                    signed_url: str = url_data.get("resp_data", {}).get("download_url", "")
                    if not signed_url:
                        logger.warning("download_binaries: file_id=%s no signed URL", file_id)
                        failed += 1
                        continue

                    # Step 2: fetch binary
                    bin_resp = self._http.get(signed_url, headers=self._headers(), timeout=60)
                    if bin_resp.status_code != 200:
                        logger.warning(
                            "download_binaries: file_id=%s binary fetch HTTP %d",
                            file_id,
                            bin_resp.status_code,
                        )
                        failed += 1
                        continue

                    # Step 3: persist via injected save_fn
                    save_fn(filename, bin_resp.content)
                    downloaded += 1
                    logger.debug(
                        "download_binaries: saved file %s (%d bytes)", filename, len(bin_resp.content)
                    )

                elif atype == "image":
                    # Images: URL is directly on the topic's images list (not via /download_url)
                    # attachment may have {"images": [...]} or direct url field
                    image_url = attachment.get("original", {}).get("url") or attachment.get("url")
                    if not image_url:
                        logger.debug("download_binaries: image attachment with no URL, skip")
                        continue
                    img_resp = self._http.get(image_url, headers=self._headers(), timeout=30)
                    if img_resp.status_code != 200:
                        logger.warning(
                            "download_binaries: image URL %s HTTP %d",
                            image_url,
                            img_resp.status_code,
                        )
                        failed += 1
                        continue

                    ext = image_url.split("?")[0].rsplit(".", 1)[-1] if "." in image_url else "jpg"
                    filename = f"image_{topic.get('topic_id')}_{downloaded}.{ext}"
                    save_fn(filename, img_resp.content)
                    downloaded += 1

                else:
                    logger.debug("download_binaries: unknown attachment type %s, skip", atype)

            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "download_binaries: attachment type=%s exception=%s — counted as failure",
                    atype,
                    exc,
                )
                failed += 1

        logger.info(
            "download_binaries: topic %s downloaded=%d failed=%d",
            topic.get("topic_id"),
            downloaded,
            failed,
        )
        return downloaded, failed

    # ------------------------------------------------------------------
    # Internal time helper (comment cursor)
    # ------------------------------------------------------------------

    @staticmethod
    def _increment_time(time_str: str) -> str:
        """
        Add 1ms to a zsxq timestamp string for comment pagination cursor.

        Ported from ZSXQInteractiveCrawler._increment_time().
        Note: for topic cursor we *subtract* (next_end_time); for comment cursor
        we *add* 1ms to advance past the last fetched comment.
        """
        match = re.match(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})(\+\d{4})", time_str)
        if match:
            base = match.group(1)
            ms = int(match.group(2)) + 1
            tz = match.group(3)
            if ms >= 1000:
                dt = datetime.strptime(base, "%Y-%m-%dT%H:%M:%S") + timedelta(seconds=1)
                base = dt.strftime("%Y-%m-%dT%H:%M:%S")
                ms = 0
            return f"{base}.{ms:03d}{tz}"
        return time_str

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._http.close()

    def __enter__(self) -> "ZsxqClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()
