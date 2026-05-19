"""holdings_sync CSV broker registry + generic column mapping (design §3.6).

**Deterministic. Never calls the LLM.** CSV is the no-cost path — users get
unlimited imports, the resolver does the symbol work.

Three steps for `parse_csv`:

  1. Decode raw bytes (utf-8 / utf-8-sig / latin-1) + strip BOM, sniff
     delimiter with `csv.Sniffer`.
  2. Match the header against the broker registry (Robinhood / Fidelity /
     Schwab / E*TRADE — extend by registering more `BrokerParser`s).
  3. If no broker matches, fall back to a generic column mapper that
     scores columns by header tokens AND value shape (≥60% of cells look
     ticker-shaped → that's the symbol column).

Locale-ambiguous numbers (single separator on an integer-ish value, no
unit hint) are flagged on the row's `notices` rather than silently
guessed 1000× (design §7bis.5). `%` suffix → `weight_pct`, never shares.
A header step (`status="needs_mapping"` + `columns`) is returned when the
heuristic can't even find symbol+quantity, so the FE can show the user a
column-mapping picker and resubmit with explicit `mapping`.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from app.core.logging import get_logger

from .models import RawExtractedHolding

logger = get_logger(__name__)

# Hard product cap (design §8) — applied at the end (matches agent.MAX_HOLDINGS).
MAX_HOLDINGS = 60

# A symbol-shaped value (used for value-pattern column detection).
_SYMBOL_VALUE_RE = re.compile(r"^[\$A-Z][A-Z0-9.\-]{0,15}$")

# Cash variants the parser fast-paths to `$CASH` BEFORE the symbol regex
# (which would reject "Cash & Equivalents" etc.).
_CASH_VARIANTS = {
    "$CASH", "CASH", "CASH & EQUIVALENTS", "CASH AND EQUIVALENTS",
    "CASH & EQUIV", "CASH EQUIV", "TOTAL CASH", "MONEY MARKET",
    "BUYING POWER", "USD CASH", "现金", "USD现金", "美元现金",
}

# Header tokens we accept for generic column inference (lower-cased,
# whitespace-stripped substring match; order matters — longest first).
_HEADER_HINTS: Dict[str, List[str]] = {
    "symbol":     ["symbol", "ticker", "代码", "证券代码", "stock symbol"],
    "shares":     ["quantity", "qty", "shares", "持仓数量", "数量", "股数",
                   "units", "amount"],
    "cost_basis": ["cost basis", "cost", "total cost", "投入成本", "成本",
                   "purchase cost"],
    "entry_price": ["avg cost", "average cost", "avg price", "average price",
                    "purchase price", "买入均价", "成本价", "cost per share"],
    "weight_pct": ["weight", "% of account", "% allocation", "allocation",
                   "权重", "占比"],
    "name":       ["name", "description", "security", "security description",
                   "公司名", "证券名称", "证券简称"],
}


# --------------------------------------------------------------------------- #
# decoding + sniffing
# --------------------------------------------------------------------------- #


def _decode(raw: bytes) -> str:
    """Try utf-8 / utf-8-sig / latin-1 in that order; strip BOM."""
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(enc).lstrip("﻿")
        except UnicodeDecodeError:
            continue
    # last-resort lossy decode so we never raise here — bad rows will be
    # noticed in dedupe_and_validate / resolver.
    return raw.decode("utf-8", errors="replace")


def _sniff(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample[:2048], delimiters=",;\t|")
    except csv.Error:
        # Default to comma — common case, and the reader copes with stray
        # rogue separators reasonably.
        class _Default(csv.Dialect):
            delimiter = ","
            quotechar = '"'
            doublequote = True
            skipinitialspace = True
            lineterminator = "\n"
            quoting = csv.QUOTE_MINIMAL
        return _Default()


def _skip_leading_garbage(rows: List[List[str]]) -> int:
    """Brokerage exports often include a few title/summary lines before the
    real header. Return the index of the most likely header row by looking
    for one with `symbol`/`ticker` and another known token."""
    for i, row in enumerate(rows[:20]):
        joined = " | ".join(c.strip().lower() for c in row)
        sym = any(h in joined for h in ("symbol", "ticker", "代码"))
        qty = any(h in joined for h in ("quantity", "qty", "shares", "数量", "股数"))
        if sym and (qty or "cost" in joined or "weight" in joined or "value" in joined):
            return i
    return 0


# --------------------------------------------------------------------------- #
# locale-aware number parsing
# --------------------------------------------------------------------------- #


_PCT_RE = re.compile(r"^\s*[-+]?\d[\d,. ]*\s*%\s*$")
_NEG_PAREN_RE = re.compile(r"^\s*\(\s*([\d,. ]+)\s*\)\s*$")  # (123) → -123
_CN_WAN_RE = re.compile(r"^([\d,.]+)\s*万$")    # 2.5万 → 25000
_CN_YI_RE = re.compile(r"^([\d,.]+)\s*亿$")     # 1.2亿 → 120 000 000


@dataclass
class _NumberOut:
    value: Optional[float] = None
    ambiguous: bool = False                  # locale-ambiguous → row notice
    is_percent: bool = False                 # trailing %


def _parse_number(s: str) -> _NumberOut:
    """Locale-tolerant numeric parse. Returns `_NumberOut(None)` for
    non-numeric. Ambiguous integer-ish single-separator values
    (e.g. `1,234`) are returned as-is (treating the separator as
    thousands) BUT with `ambiguous=True` so the row gets a notice
    (design §7bis.5: never silently 1000× guess)."""
    if s is None:
        return _NumberOut()
    s0 = s.strip()
    if not s0:
        return _NumberOut()

    # CJK 万 / 亿 multipliers
    m = _CN_WAN_RE.match(s0)
    if m:
        n = _parse_number(m.group(1)).value
        return _NumberOut(value=(n or 0.0) * 10000.0)
    m = _CN_YI_RE.match(s0)
    if m:
        n = _parse_number(m.group(1)).value
        return _NumberOut(value=(n or 0.0) * 100_000_000.0)

    pct = False
    if _PCT_RE.match(s0):
        pct = True
        s0 = s0.rstrip(" %")

    neg = False
    m = _NEG_PAREN_RE.match(s0)
    if m:
        neg = True
        s0 = m.group(1)

    # Strip currency / spaces (keep digits, separators, sign)
    s0 = re.sub(r"[^\d,.\-+]", "", s0)
    if not s0 or s0 in {"-", "+", "."}:
        return _NumberOut()
    if s0.startswith("-"):
        neg = not neg
        s0 = s0[1:]
    elif s0.startswith("+"):
        s0 = s0[1:]

    has_comma = "," in s0
    has_dot = "." in s0

    if not has_comma and not has_dot:
        try:
            v = float(s0)
            return _NumberOut(value=-v if neg else v, is_percent=pct)
        except ValueError:
            return _NumberOut()

    if has_comma and has_dot:
        # Mixed → the RIGHTMOST is the decimal separator (works for both
        # `1,234.56` US and `1.234,56` EU forms).
        last_comma = s0.rfind(",")
        last_dot = s0.rfind(".")
        if last_dot > last_comma:
            s0 = s0.replace(",", "")          # US: thousands=`,`, decimal=`.`
        else:
            s0 = s0.replace(".", "").replace(",", ".")  # EU
        try:
            v = float(s0)
            return _NumberOut(value=-v if neg else v, is_percent=pct)
        except ValueError:
            return _NumberOut()

    # Single separator only — ambiguous between thousands and decimal.
    sep = "," if has_comma else "."
    parts = s0.split(sep)
    if len(parts) == 2 and len(parts[1]) == 3:
        # `1,234` looks like thousands grouping → treat as 1234, BUT flag
        # the row as locale-ambiguous (§7bis.5 — never silently 1000×).
        try:
            v = float(parts[0] + parts[1])
            return _NumberOut(value=-v if neg else v, ambiguous=True, is_percent=pct)
        except ValueError:
            return _NumberOut()
    # Otherwise treat the separator as decimal — `123,45` or `12.5` etc.
    try:
        v = float(s0.replace(",", "."))
        return _NumberOut(value=-v if neg else v, is_percent=pct)
    except ValueError:
        return _NumberOut()


# --------------------------------------------------------------------------- #
# broker registry
# --------------------------------------------------------------------------- #


@dataclass
class BrokerParser:
    slug: str
    detect_tokens: Tuple[str, ...]                     # all must appear in header
    column_map: Dict[str, str]                         # header (lower) → field
    # optional override: full callable parsing — useful when broker format is
    # unusual enough that the column_map alone can't cope.
    custom: Optional[Callable[["csv.DictReader"], List[RawExtractedHolding]]] = None


def _row_from_mapping(
    row: Dict[str, str],
    col_map: Dict[str, str],
    notices: List[str],
) -> Optional[RawExtractedHolding]:
    """Apply a {header-lowercase: field} mapping to a single CSV row. Returns
    None for non-data rows (totals / cash sweep with no symbol)."""
    lower = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
    sym_raw = lower.get(col_map.get("symbol", ""), "").strip()
    name_raw = lower.get(col_map.get("name", ""), "").strip()
    if not sym_raw and not name_raw:
        return None
    # Cash short-circuit — done by the resolver too, but cleaner output here.
    if sym_raw.upper() in _CASH_VARIANTS or name_raw.upper() in _CASH_VARIANTS:
        sym_raw = "$CASH"

    shares = _parse_number(lower.get(col_map.get("shares", ""), ""))
    cost = _parse_number(lower.get(col_map.get("cost_basis", ""), ""))
    entry = _parse_number(lower.get(col_map.get("entry_price", ""), ""))
    weight = _parse_number(lower.get(col_map.get("weight_pct", ""), ""))

    # `%` suffix on the shares column = the user mis-mapped weight as
    # shares → re-route automatically rather than persist a 0.05-share
    # ghost row (design §7bis.5).
    if shares.is_percent:
        weight = shares
        shares = _NumberOut()

    # Footer rows ("Total", "Subtotal", "Net Account Value", ...) → drop
    # unconditionally; they're never holdings even though "TOTAL" happens
    # to match the symbol regex.
    _FOOTER = {"TOTAL", "SUBTOTAL", "NET ACCOUNT VALUE",
               "ACCOUNT TOTAL", "TOTAL HOLDINGS", "GRAND TOTAL"}
    if not sym_raw or sym_raw.upper() in _FOOTER:
        return None

    if shares.ambiguous and shares.value is not None:
        notices.append(f"{sym_raw}: 数量含千位分隔符歧义，请在 Review 复核")
    if cost.ambiguous and cost.value is not None:
        notices.append(f"{sym_raw}: 成本含千位分隔符歧义，请在 Review 复核")

    return RawExtractedHolding(
        symbol_or_name=sym_raw or name_raw,
        shares=shares.value,
        cost_basis=cost.value,
        entry_price=entry.value,
        weight_pct=weight.value if weight.is_percent or weight.value is None
                                   else weight.value,
    )


# Concrete brokers — header tokens stable across recent (2024+) exports.
_ROBINHOOD = BrokerParser(
    slug="robinhood",
    # "average cost" is Robinhood-specific (Fidelity uses "cost basis",
    # Schwab uses "cost basis", E*TRADE uses "purchase price/cost").
    # Adding it here prevents Robinhood from shadowing Schwab CSVs (whose
    # "Qty (Quantity)" header contains the substring "quantity").
    detect_tokens=("symbol", "quantity", "average cost"),
    column_map={"symbol": "symbol", "shares": "quantity",
                "cost_basis": "average cost", "entry_price": "average cost"},
)
_FIDELITY = BrokerParser(
    slug="fidelity",
    # "cost basis per share" is Fidelity-specific: Schwab gives only the
    # total "Cost Basis" column, so we need this distinct token to avoid
    # Fidelity-detection shadowing Schwab exports (whose "qty (quantity)"
    # contains the substring "quantity").
    detect_tokens=("symbol", "quantity", "cost basis per share"),
    column_map={"symbol": "symbol", "shares": "quantity",
                "cost_basis": "cost basis", "entry_price": "cost basis per share"},
)
_SCHWAB = BrokerParser(
    slug="schwab",
    # "qty (quantity)" is Schwab's signature: nobody else uses that parenthetical
    detect_tokens=("symbol", "qty (quantity)"),
    column_map={"symbol": "symbol", "shares": "qty (quantity)",
                "cost_basis": "cost basis", "name": "description"},
)
_ETRADE = BrokerParser(
    slug="etrade",
    # "purchase price" / "purchase cost" are E*TRADE-specific; Robinhood
    # uses "average cost", Fidelity uses "cost basis (per share)".
    detect_tokens=("symbol", "quantity", "purchase"),
    column_map={"symbol": "symbol", "shares": "quantity",
                "cost_basis": "purchase cost", "entry_price": "purchase price"},
)


# Note: each BrokerParser declares its expected header keys but the matcher
# tolerates extra / reordered columns. We don't want a Schwab export with one
# renamed column to silently fall back to the generic mapper.
_REGISTRY: Tuple[BrokerParser, ...] = (_ROBINHOOD, _FIDELITY, _SCHWAB, _ETRADE)


def _match_broker(headers: List[str]) -> Optional[BrokerParser]:
    """Pick the MOST-SPECIFIC broker whose detect tokens all appear in the
    header set. Otherwise an exporter that overlaps a less-specific
    broker's tokens (e.g. Fidelity's symbol+quantity+cost-basis vs
    Robinhood's symbol+quantity) would silently route to the less
    specific parser and lose the precise column mapping."""
    lowered = [(h or "").strip().lower() for h in headers]
    candidates: List[BrokerParser] = []
    for p in _REGISTRY:
        if not all(any(tok in h for h in lowered) for tok in p.detect_tokens):
            continue
        # Re-key the column_map to the EXACT header strings as they appear
        # (longest-want-first so generic prefixes don't shadow specific
        # ones; e.g. "cost basis per share" must NOT bind to "cost basis").
        used: set = set()
        resolved: Dict[str, str] = {}
        for field_name, want in sorted(p.column_map.items(),
                                       key=lambda kv: -len(kv[1])):
            want_lo = want.lower()
            for h in lowered:
                if h in used:
                    continue
                if want_lo == h or want_lo in h:
                    resolved[field_name] = h
                    used.add(h)
                    break
        if "symbol" in resolved and "shares" in resolved:
            candidates.append(BrokerParser(p.slug, p.detect_tokens, resolved))
    if not candidates:
        return None
    # Most-specific wins — more detect tokens = stronger evidence.
    candidates.sort(key=lambda p: -len(p.detect_tokens))
    return candidates[0]


# --------------------------------------------------------------------------- #
# generic column mapper (no broker match)
# --------------------------------------------------------------------------- #


def _infer_columns(headers: List[str], rows: List[Dict[str, str]]) -> Dict[str, str]:
    """Score each column for each field by header tokens + value shape. Pick
    the best non-conflicting assignment. Returns a {field: header-lower} map
    (possibly empty)."""
    lowered = [(h or "").strip().lower() for h in headers]
    out: Dict[str, str] = {}
    used: set = set()
    # Pass 1 — header tokens
    for field_name, hints in _HEADER_HINTS.items():
        for h_lo in lowered:
            if h_lo in used:
                continue
            if any(t in h_lo for t in hints):
                out[field_name] = h_lo
                used.add(h_lo)
                break
    # Pass 2 — value shape (only for symbol if header pass missed)
    if "symbol" not in out:
        n = max(1, min(20, len(rows)))
        for h_lo in lowered:
            if h_lo in used:
                continue
            sample = [(r.get(h_lo) or "").strip().upper() for r in rows[:n]]
            matches = sum(1 for v in sample if v and _SYMBOL_VALUE_RE.match(v))
            if matches / n >= 0.6:
                out["symbol"] = h_lo
                used.add(h_lo)
                break
    return out


# --------------------------------------------------------------------------- #
# public API
# --------------------------------------------------------------------------- #


@dataclass
class CsvParseResult:
    holdings: List[RawExtractedHolding] = field(default_factory=list)
    notices: List[str] = field(default_factory=list)
    needs_mapping: bool = False
    columns: List[str] = field(default_factory=list)
    broker: Optional[str] = None


def parse_csv(raw: bytes, mapping: Optional[Dict[str, str]] = None) -> CsvParseResult:
    """Decode + parse a CSV blob.

    - If `mapping` is provided, use it (FE second submit after the
      `needs_mapping` step). Mapping keys are field names
      (`symbol`/`shares`/`cost_basis`/`entry_price`/`weight_pct`/`name`)
      and values are LOWER-CASED header strings.
    - Else try the broker registry, then the generic mapper. If even the
      generic mapper can't find a symbol column, return
      `needs_mapping=True, columns=<lower-cased headers>`.
    """
    text = _decode(raw)
    if not text.strip():
        return CsvParseResult(notices=["CSV 文件为空"], needs_mapping=False)

    # Read into list-of-lists FIRST so we can find the real header row even
    # when the export has banner / summary lines on top.
    dialect = _sniff(text)
    rows_raw = list(csv.reader(io.StringIO(text), dialect=dialect))
    if not rows_raw:
        return CsvParseResult(notices=["CSV 没有可解析的行"])
    start = _skip_leading_garbage(rows_raw)
    headers = [(c or "").strip() for c in rows_raw[start]]
    body = rows_raw[start + 1:]
    if not headers or all(not h for h in headers):
        return CsvParseResult(notices=["未找到列头"], needs_mapping=False)

    # Convert body to list-of-dict keyed on LOWER-CASED headers.
    h_lower = [(h or "").strip().lower() for h in headers]
    rows: List[Dict[str, str]] = []
    for r in body:
        if not r or all(not (c or "").strip() for c in r):
            continue
        # Pad / truncate row to header length so DictReader-equivalent
        # access works.
        padded = list(r) + [""] * max(0, len(headers) - len(r))
        rows.append({h_lower[i]: padded[i] for i in range(len(headers))})

    # Path A: caller-supplied mapping (FE second submit).
    if mapping:
        col_map = {k: (v or "").strip().lower() for k, v in mapping.items()}
        notices: List[str] = []
        holdings: List[RawExtractedHolding] = []
        for r in rows:
            h = _row_from_mapping(r, col_map, notices)
            if h is not None:
                holdings.append(h)
        return CsvParseResult(
            holdings=holdings[:MAX_HOLDINGS],
            notices=notices + (["仅展示前 60 项"] if len(holdings) > MAX_HOLDINGS else []),
            columns=h_lower,
        )

    # Path B: broker registry.
    broker = _match_broker(headers)
    if broker is not None:
        notices = []
        holdings = []
        for r in rows:
            h = _row_from_mapping(r, broker.column_map, notices)
            if h is not None:
                holdings.append(h)
        return CsvParseResult(
            holdings=holdings[:MAX_HOLDINGS],
            notices=notices + (["仅展示前 60 项"] if len(holdings) > MAX_HOLDINGS else []),
            broker=broker.slug,
            columns=h_lower,
        )

    # Path C: generic column inference.
    inferred = _infer_columns(headers, rows)
    if "symbol" not in inferred:
        # FE shows the user a column-mapping picker.
        return CsvParseResult(
            needs_mapping=True,
            columns=h_lower,
            notices=["无法自动识别列，请选择对应列后再提交"],
        )
    notices = []
    holdings = []
    for r in rows:
        h = _row_from_mapping(r, inferred, notices)
        if h is not None:
            holdings.append(h)
    return CsvParseResult(
        holdings=holdings[:MAX_HOLDINGS],
        notices=notices + (["仅展示前 60 项"] if len(holdings) > MAX_HOLDINGS else []),
        columns=h_lower,
    )
