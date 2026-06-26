"""Normalize a raw zsxq v2 API topic JSON into a threads.jsonl record dict.

The output shape is consumed by ``indexing.prepare_records``.  All text
fields are cleaned through the same ``clean_text`` / ``_render_e_tag``
pipeline used by ``scripts/export_corpus.py`` in the crawler workspace.

Public API
----------
normalize_topic(t, *, group_id, group_name, owner_user_id, creator_ids) -> dict
    Map one raw zsxq topic JSON object to one threads.jsonl record dict.

Field-path notes (confirmed from real raw JSON and zsxq_database.py parser)
---------------------------------------------------------------------------
- Text lives in ``talk.text`` (type "talk"/"article") or in
  ``question.text`` / ``answer.text`` (type "q&a").
- Author lives in ``talk.owner.{user_id,name}`` (not top-level).
- Hashtags are NOT a separate ``hashtags`` list in the raw API JSON;
  they appear as ``<e type="hashtag" .../>`` inline tags inside
  ``talk.text`` (and sometimes in ``annotation``).  We extract them
  after clean_text via a regex scan on the *raw* text.
- ``show_comments`` may be present on some topic detail responses.
- Images: ``talk.images[].{thumbnail,large,original}.url`` (nested objs).
- Files: ``talk.files[].{file_id,name,size,...}``.
- Top-level: ``topic_id``, ``type``, ``title``, ``create_time``,
  ``digested``, ``likes_count``, ``group.{group_id,name}``.
"""

from __future__ import annotations

import html as _html
import re
from typing import Any, Optional
from urllib.parse import unquote

from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Text-cleaning utilities (copied verbatim from
# zsxq-crawler-workspace/repo/scripts/export_corpus.py)
# ---------------------------------------------------------------------------

_E_TAG_RE = re.compile(r'<e\b[^>]*?/?>', flags=re.IGNORECASE | re.DOTALL)
_ATTR_RE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')
_HTML_TAG_RE = re.compile(r'<[^>]+>')

# Regex to extract raw hashtag titles from text *before* clean_text
_HASHTAG_E_RE = re.compile(
    r'<e\s+type=["\']hashtag["\'][^>]*\btitle="([^"]*)"[^>]*/?>',
    flags=re.IGNORECASE,
)

# Inline <e type="web"/"web_url"> external-link tags (e.g. a post pointing to a
# 公众号 article). We keep the URL as metadata for citation but do NOT fetch the
# linked content (handbook: don't make indexing depend on external web DOM).
_WEB_E_RE = re.compile(r'<e\b[^>]*\btype=["\']web[a-z_]*["\'][^>]*/?>', flags=re.IGNORECASE)


def _extract_external_links(*raw_texts: Optional[str]) -> list[str]:
    """Return de-duplicated external URLs from inline <e type="web"> tags."""
    links: list[str] = []
    for raw in raw_texts:
        if not raw:
            continue
        for tag in _WEB_E_RE.finditer(raw):
            m = re.search(r'href="([^"]*)"', tag.group(0))
            if not m:
                continue
            url = unquote(m.group(1))
            if url and url not in links:
                links.append(url)
    return links


# A member-authored topic is kept when the OWNER *actively* participates in the
# comments — a substantive reply, NOT a 点赞/表情/trivial "好的". "Substantive" =
# at least this many meaningful chars (CJK ideographs + latin alphanumerics),
# which excludes emoji/stickers/punctuation-only and one-word agreements.
_OWNER_COMMENT_MIN_CHARS = 8
_MEANINGFUL_CHAR_RE = re.compile(r"[0-9A-Za-z一-鿿]")


def _meaningful_len(text: Optional[str]) -> int:
    return len(_MEANINGFUL_CHAR_RE.findall(text or ""))


def _owner_substantive_comments(
    comments: list[dict[str, Any]], owner_user_id: Optional[int]
) -> list[str]:
    """Cleaned texts of the owner's substantive comments (active participation)."""
    if not owner_user_id:
        return []
    out: list[str] = []
    for c in comments:
        co = c.get("owner") or {}
        if str(co.get("user_id") or "") != str(owner_user_id):
            continue
        txt = (c.get("text") or "").strip()
        if _meaningful_len(txt) >= _OWNER_COMMENT_MIN_CHARS:
            out.append(txt)
    return out


def _decode(value: Optional[str]) -> str:
    if not value:
        return ""
    try:
        return unquote(value)
    except Exception:  # noqa: BLE001
        return value


def _render_e_tag(match: "re.Match") -> str:
    attrs = dict(_ATTR_RE.findall(match.group(0)))
    etype = (attrs.get("type") or "").lower()
    title = _decode(attrs.get("title"))
    href = _decode(attrs.get("href"))
    if etype == "web_url" and href:
        return f"{title or href}（{href}）" if title else href
    if etype == "hashtag":
        return f"#{title.strip('# ')}#" if title else ""
    if etype == "mention":
        return f"@{title}" if title else ""
    if etype == "text_bold" and title:
        return f"**{title.strip()}**"
    if etype == "text_italic" and title:
        return f"*{title.strip()}*"
    return title or href or ""


def clean_text(text: Optional[str]) -> str:
    if not text:
        return ""
    s = _E_TAG_RE.sub(_render_e_tag, text)
    if "<" in s and ">" in s:
        s = _HTML_TAG_RE.sub("", s)
    s = _html.unescape(s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


# ---------------------------------------------------------------------------
# Tag extraction (from raw text *before* clean_text so we have the <e> tags)
# ---------------------------------------------------------------------------

def _extract_tags_from_raw_text(raw_text: Optional[str]) -> list[str]:
    """Extract hashtag names from inline <e type="hashtag"> tags."""
    if not raw_text:
        return []
    tags: list[str] = []
    for m in _HASHTAG_E_RE.finditer(raw_text):
        decoded = _decode(m.group(1)).strip("#").strip()
        if decoded:
            tags.append(decoded)
    return tags


# ---------------------------------------------------------------------------
# Role determination
# ---------------------------------------------------------------------------

def _role_of(uid: Optional[int], *, owner_user_id: Optional[int],
             creator_ids: set) -> str:
    if not uid:
        return "unknown"
    if owner_user_id and uid == owner_user_id:
        return "owner"
    if uid in creator_ids:
        return "creator"
    return "member"


# ---------------------------------------------------------------------------
# Comment normalisation
# ---------------------------------------------------------------------------

def _normalize_comment(c: dict[str, Any], *, owner_user_id: Optional[int],
                        creator_ids: set) -> dict[str, Any]:
    owner = c.get("owner") or {}
    uid = owner.get("user_id")
    repliee = c.get("repliee") or {}
    return {
        "comment_id": str(c.get("comment_id") or ""),
        "parent_comment_id": (str(c["parent_comment_id"])
                              if c.get("parent_comment_id") else None),
        "create_time": c.get("create_time"),
        "text": clean_text(c.get("text")),
        "likes_count": c.get("likes_count") or 0,
        "owner": {
            "user_id": str(uid) if uid else None,
            "name": owner.get("name") or "",
            "role": _role_of(uid, owner_user_id=owner_user_id,
                             creator_ids=creator_ids),
        },
        "repliee": {
            "user_id": str(repliee["user_id"]) if repliee.get("user_id") else None,
            "name": repliee.get("name") or "",
        } if repliee else None,
        "images": [
            _normalize_image(img)
            for img in (c.get("images") or [])
        ],
    }


# ---------------------------------------------------------------------------
# Image normalisation
# ---------------------------------------------------------------------------

def _normalize_image(img: dict[str, Any]) -> dict[str, Any]:
    def _url_obj(key: str) -> dict[str, Any]:
        obj = img.get(key) or {}
        return {
            "url": obj.get("url") or "",
            "width": obj.get("width"),
            "height": obj.get("height"),
        }

    result = {
        "image_id": img.get("image_id"),
        "type": img.get("type") or "",
        "thumbnail": _url_obj("thumbnail"),
        "large": _url_obj("large"),
        "original": _url_obj("original"),
    }
    orig = img.get("original") or {}
    if orig.get("size"):
        result["original"]["size"] = orig["size"]
    return result


# ---------------------------------------------------------------------------
# File normalisation
# ---------------------------------------------------------------------------

def _normalize_file(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "file_id": f.get("file_id"),
        "name": f.get("name") or "",
        "size": f.get("size"),
        "hash": f.get("hash"),
        "download_count": f.get("download_count"),
        "create_time": f.get("create_time"),
    }


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

TOPIC_URL_TMPL = "https://wx.zsxq.com/dweb2/index/topic_detail/{topic_id}"


def normalize_topic(
    t: dict[str, Any],
    *,
    group_id: int | str,
    group_name: str,
    owner_user_id: Optional[int],
    creator_ids: set,
) -> dict[str, Any]:
    """Convert one raw zsxq API topic JSON to a threads.jsonl record dict.

    The returned dict is consumable by ``indexing.prepare_records``.

    Parameters
    ----------
    t:
        Raw topic JSON object from the zsxq v2 API (as stored in the
        crawler's ``topic_details.raw_json`` column).
    group_id:
        The zsxq group ID (used to compose URLs and for logging).
    group_name:
        Human-readable group name (stored as ``group_name`` in the record).
    owner_user_id:
        The user_id of the group owner (used for role determination).
    creator_ids:
        Set of user_ids who have authored at least one topic or answer.
    """
    topic_id = t.get("topic_id")
    tid = str(topic_id) if topic_id is not None else ""
    ttype = t.get("type") or "talk"

    talk: dict[str, Any] = t.get("talk") or {}
    talk_owner: dict[str, Any] = talk.get("owner") or {}

    # ---- Author ----------------------------------------------------------
    # For "talk"/"article" types the author is talk.owner
    # For "q&a" the answerer is the primary author; fall back to questioner
    if ttype == "q&a":
        answer_owner = (t.get("answer") or {}).get("owner") or {}
        question_owner = (t.get("question") or {}).get("owner") or {}
        author_obj = answer_owner if answer_owner.get("user_id") else question_owner
    else:
        author_obj = talk_owner

    author_uid: Optional[int] = author_obj.get("user_id")
    author_name: str = author_obj.get("name") or ""
    author_role = _role_of(author_uid, owner_user_id=owner_user_id,
                           creator_ids=creator_ids)

    # ---- Raw text fields -------------------------------------------------
    raw_talk_text = talk.get("text") or ""
    raw_question_text = (t.get("question") or {}).get("text") or ""
    raw_answer_text = (t.get("answer") or {}).get("text") or ""
    # Long-form "article" posts: the crawler fetches the full body into
    # full_article_text (already plain text). talk.text is only a truncated
    # preview ending in "…", so prefer the full body when present.
    full_article_text = (talk.get("full_article_text") or "").strip()

    talk_text = clean_text(raw_talk_text)
    question_text = clean_text(raw_question_text)
    answer_text = clean_text(raw_answer_text)

    # ---- Main body -------------------------------------------------------
    if ttype == "q&a":
        body = answer_text or question_text
    else:
        body = full_article_text or talk_text

    # ---- Tags ------------------------------------------------------------
    # Tags are inline <e type="hashtag"> in raw text (not a separate field)
    all_raw_texts = [raw_talk_text, raw_question_text, raw_answer_text]
    # Also scan show_comments for hashtags in the raw JSON
    for c in (t.get("show_comments") or []):
        all_raw_texts.append(c.get("text") or "")
    tags: list[str] = []
    seen_tags: set[str] = set()
    for raw in all_raw_texts:
        for tag in _extract_tags_from_raw_text(raw):
            if tag not in seen_tags:
                seen_tags.add(tag)
                tags.append(tag)

    # ---- Images & Files --------------------------------------------------
    images = [_normalize_image(img) for img in (talk.get("images") or [])]
    files = [_normalize_file(f) for f in (talk.get("files") or [])]

    # ---- Comments --------------------------------------------------------
    comments = [
        _normalize_comment(c, owner_user_id=owner_user_id, creator_ids=creator_ids)
        for c in (t.get("show_comments") or [])
    ]

    # ---- Question / Answer sub-objects -----------------------------------
    question: Optional[dict[str, Any]] = None
    answer: Optional[dict[str, Any]] = None
    if ttype == "q&a" or t.get("question") or t.get("answer"):
        ttype = "q&a"  # normalise type even if not set explicitly
        q_owner = (t.get("question") or {}).get("owner") or {}
        a_owner = (t.get("answer") or {}).get("owner") or {}
        q_uid = q_owner.get("user_id")
        a_uid = a_owner.get("user_id")
        question = {
            "text": question_text,
            "owner": {
                "user_id": str(q_uid) if q_uid else None,
                "name": q_owner.get("name") or "",
                "role": _role_of(q_uid, owner_user_id=owner_user_id,
                                 creator_ids=creator_ids),
            },
        }
        answer = {
            "text": answer_text,
            "owner": {
                "user_id": str(a_uid) if a_uid else None,
                "name": a_owner.get("name") or "",
                "role": _role_of(a_uid, owner_user_id=owner_user_id,
                                 creator_ids=creator_ids),
            },
        }

    # ---- Owner participation rescue --------------------------------------
    # A member-authored post is normally dropped, but if the OWNER actively
    # joined the comment discussion (a substantive reply, not 点赞/表情), the
    # thread carries real Panda value: re-attribute the record to the owner and
    # surface the owner's reply as the indexed body (member post kept as context)
    # so eligibility passes and citation points to the owner.
    kept_via_owner_comment = False
    if author_role == "member" and owner_user_id:
        owner_replies = _owner_substantive_comments(comments, owner_user_id)
        if owner_replies:
            owner_name = next(
                (
                    (c.get("owner") or {}).get("name") or ""
                    for c in comments
                    if str((c.get("owner") or {}).get("user_id") or "")
                    == str(owner_user_id)
                ),
                "",
            )
            context = body
            body = "【球主评论区回复】\n" + "\n\n".join(owner_replies)
            if context:
                body += "\n\n【原帖（成员发起，作为上下文）】\n" + context
            author_uid = owner_user_id
            author_name = owner_name or author_name
            author_role = "owner"
            kept_via_owner_comment = True

    # ---- Assemble record -------------------------------------------------
    rec: dict[str, Any] = {
        "topic_id": tid,
        "group_id": str(group_id),
        "group_name": group_name,
        "type": ttype,
        "title": t.get("title") or "",
        "text": body,
        "author": {
            "user_id": str(author_uid) if author_uid else None,
            "name": author_name,
            "role": author_role,
        },
        "create_time": t.get("create_time"),
        "tags": tags,
        "digested": bool(t.get("digested")),
        "likes_count": t.get("likes_count") or 0,
        "url": TOPIC_URL_TMPL.format(topic_id=tid),
        "images": images,
        "files": files,
        "comments": comments,
    }

    if question is not None:
        rec["question"] = question
    if answer is not None:
        rec["answer"] = answer

    external_links = _extract_external_links(
        raw_talk_text, raw_question_text, raw_answer_text
    )
    if external_links:
        rec["external_links"] = external_links
    if kept_via_owner_comment:
        rec["kept_via_owner_comment"] = True

    logger.debug(
        "normalize_topic: topic_id=%s type=%s author_role=%s tags=%s",
        tid, ttype, author_role, tags,
    )
    return rec
