"""holdings_sync.parsers — deterministic CSV path (design §3.6).

Locks behavior independent of any LLM:
  ① broker registry matches Robinhood / Fidelity / Schwab / E*TRADE shapes,
  ② generic column inference works on a no-broker-match CSV,
  ③ locale-ambiguous integer-like values are FLAGGED (`notices`), not
     silently 1000×'d (design §7bis.5),
  ④ `%` suffix on a column re-routed to `weight_pct` (never shares),
  ⑤ Chinese `万` / `亿` multipliers + `(123)` negatives + `1.234,56` EU form
     all decode,
  ⑥ no symbol+quantity → `needs_mapping=True, columns=…` (FE picker step),
  ⑦ mapping resubmit honors caller-supplied {field: header} mapping,
  ⑧ footers / totals / banners are dropped,
  ⑨ `$CASH` variants short-circuit to `$CASH`.
"""

from app.features.holdings_sync.parsers import (
    _parse_number,
    parse_csv,
)


def _csv(headers, rows):
    """Build a CSV blob, quoting any value that contains a comma so
    in-value separators (`1,234.56` etc.) don't get re-split by csv.reader."""
    def q(c):
        s = str(c)
        if "," in s or '"' in s:
            return '"' + s.replace('"', '""') + '"'
        return s
    out = [",".join(q(h) for h in headers)]
    for r in rows:
        out.append(",".join(q(c) for c in r))
    return ("\n".join(out) + "\n").encode("utf-8")


# --------------------------------------------------------------------------- #
# ① broker registry — Robinhood / Fidelity / Schwab / E*TRADE
# --------------------------------------------------------------------------- #


def test_robinhood_minimal():
    raw = _csv(
        ["Symbol", "Quantity", "Average Cost"],
        [["AAPL", "10", "150"], ["MSFT", "5", "300"]],
    )
    r = parse_csv(raw)
    assert r.broker == "robinhood"
    assert not r.needs_mapping
    syms = [h.symbol_or_name for h in r.holdings]
    assert syms == ["AAPL", "MSFT"]
    assert r.holdings[0].shares == 10.0
    assert r.holdings[0].cost_basis == 150.0


def test_fidelity_minimal():
    raw = _csv(
        ["Symbol", "Description", "Quantity", "Cost Basis", "Cost Basis Per Share"],
        [["NVDA", "NVIDIA Corp", "8", "1600", "200"]],
    )
    r = parse_csv(raw)
    assert r.broker == "fidelity"
    assert r.holdings[0].symbol_or_name == "NVDA"
    assert r.holdings[0].shares == 8.0
    assert r.holdings[0].cost_basis == 1600.0
    assert r.holdings[0].entry_price == 200.0


def test_schwab_minimal():
    raw = _csv(
        ["Symbol", "Description", "Qty (Quantity)", "Cost Basis"],
        [["TSLA", "Tesla Inc", "3", "750"]],
    )
    r = parse_csv(raw)
    assert r.broker == "schwab"
    assert r.holdings[0].symbol_or_name == "TSLA"


def test_etrade_minimal():
    raw = _csv(
        ["Symbol", "Quantity", "Purchase Price", "Purchase Cost"],
        [["AMD", "4", "120", "480"]],
    )
    r = parse_csv(raw)
    assert r.broker == "etrade"
    assert r.holdings[0].symbol_or_name == "AMD"


# --------------------------------------------------------------------------- #
# ② generic mapper — no broker match, but symbol + quantity inferable
# --------------------------------------------------------------------------- #


def test_generic_mapper_value_shape():
    # Headers don't match a broker tokenset (anonymized), and the first
    # column's values don't look ticker-shaped (contain spaces). The
    # generic mapper's value-shape fallback should pick the column with
    # ticker-shaped values.
    raw = _csv(
        ["Account", "Holding Code", "Holdings", "MV"],
        [["acct one", "AAPL", "10", "1500"],
         ["acct one", "MSFT", "5", "1500"]],
    )
    r = parse_csv(raw)
    assert r.broker is None
    assert not r.needs_mapping, f"unexpected needs_mapping; columns={r.columns}"
    assert {h.symbol_or_name for h in r.holdings} == {"AAPL", "MSFT"}


# --------------------------------------------------------------------------- #
# ③ locale ambiguity → notice, never silent 1000×
# --------------------------------------------------------------------------- #


def test_locale_ambiguous_single_separator_gets_notice():
    raw = _csv(
        ["Symbol", "Quantity"],
        [["AAPL", "1,234"]],   # could be 1234 (US thousands) or 1.234 (EU dec)
    )
    r = parse_csv(raw)
    # We treat as thousands but FLAG ambiguity
    assert r.holdings[0].shares == 1234.0
    assert any("千位分隔符歧义" in n for n in r.notices)


def test_us_form_unambiguous():
    raw = _csv(
        ["Symbol", "Quantity"],
        [["AAPL", "1,234.56"]],
    )
    r = parse_csv(raw)
    assert r.holdings[0].shares == 1234.56
    assert not any("歧义" in n for n in r.notices)


def test_eu_form_unambiguous():
    raw = _csv(
        ["Symbol", "Quantity"],
        [["AAPL", "1.234,56"]],
    )
    r = parse_csv(raw)
    assert r.holdings[0].shares == 1234.56


# --------------------------------------------------------------------------- #
# ④ `%` re-route to weight_pct
# --------------------------------------------------------------------------- #


def test_percent_in_shares_column_reroutes_to_weight():
    # User mis-mapped — shares column actually carries percentages.
    raw = _csv(
        ["Symbol", "Quantity"],
        [["AAPL", "12%"]],
    )
    r = parse_csv(raw)
    h = r.holdings[0]
    assert h.shares is None              # NOT 0.12 shares
    assert h.weight_pct == 12.0


# --------------------------------------------------------------------------- #
# ⑤ CJK multipliers + negatives
# --------------------------------------------------------------------------- #


def test_cjk_wan_multiplier():
    assert _parse_number("2万").value == 20000.0
    assert _parse_number("1.5万").value == 15000.0


def test_cjk_yi_multiplier():
    assert _parse_number("1.2亿").value == 120_000_000.0


def test_paren_negative():
    assert _parse_number("(123)").value == -123.0


# --------------------------------------------------------------------------- #
# ⑥ needs_mapping when symbol can't be inferred
# --------------------------------------------------------------------------- #


def test_needs_mapping_when_symbol_unfindable():
    # All values contain underscores / spaces → none match _SYMBOL_VALUE_RE,
    # and the headers don't match any known hint → needs_mapping.
    raw = _csv(
        ["Code-1", "Field-2", "Field-3"],
        [["row_one", "10_lots", "row_a"], ["row_two", "20_lots", "row_b"]],
    )
    r = parse_csv(raw)
    assert r.needs_mapping is True
    assert r.columns == ["code-1", "field-2", "field-3"]
    assert r.holdings == []


# --------------------------------------------------------------------------- #
# ⑦ mapping resubmit
# --------------------------------------------------------------------------- #


def test_mapping_resubmit_honored():
    raw = _csv(
        ["A", "B"],
        [["AAPL", "10"], ["MSFT", "5"]],
    )
    r = parse_csv(raw, mapping={"symbol": "A", "shares": "B"})
    assert {h.symbol_or_name for h in r.holdings} == {"AAPL", "MSFT"}
    assert r.holdings[0].shares == 10.0


# --------------------------------------------------------------------------- #
# ⑧ footers / totals / banner rows dropped
# --------------------------------------------------------------------------- #


def test_footer_total_dropped():
    raw = _csv(
        ["Symbol", "Quantity"],
        [["AAPL", "10"], ["Total", ""], ["Net Account Value", "1500"]],
    )
    r = parse_csv(raw)
    assert {h.symbol_or_name for h in r.holdings} == {"AAPL"}


def test_skip_leading_banner_rows():
    text = (
        "Robinhood Securities, LLC Portfolio Export\n"
        "Customer: ANON\n"
        "Symbol,Quantity,Average Cost\n"
        "AAPL,10,150\n"
    )
    r = parse_csv(text.encode("utf-8"))
    assert r.broker == "robinhood"
    assert r.holdings[0].symbol_or_name == "AAPL"


# --------------------------------------------------------------------------- #
# ⑨ $CASH variants → $CASH (resolver short-circuits the rest)
# --------------------------------------------------------------------------- #


def test_cash_variants():
    raw = _csv(
        ["Symbol", "Quantity", "Cost Basis"],
        [["Cash & Equivalents", "", "1234.56"],
         ["现金", "", "200"]],
    )
    r = parse_csv(raw)
    syms = [h.symbol_or_name for h in r.holdings]
    assert syms == ["$CASH", "$CASH"]


# --------------------------------------------------------------------------- #
# misc: UTF-8 BOM, BOM-stripped CSV decodes fine
# --------------------------------------------------------------------------- #


def test_utf8_bom_decodes():
    raw = b"\xef\xbb\xbfSymbol,Quantity\nAAPL,10\n"
    r = parse_csv(raw)
    assert r.holdings[0].symbol_or_name == "AAPL"
