from app.features.twitter_digest.topic_workflow import (
    _tickers_from_enrichment,
    expand_query_terms,
    score_tweet_for_topic,
)


def test_expand_query_terms_adds_spacex_aliases():
    terms = expand_query_terms("SpaceX 还会涨吗？")

    assert "spacex" in terms
    assert "spcx" in terms
    assert "rklb" in terms
    assert "starlink" in terms
    assert all("涨" not in term for term in terms)


def test_tickers_from_enrichment_supports_ticker_stances():
    enrichment = {
        "tickers": ["rklb"],
        "ticker_stances": [
            {"ticker": "SPCX", "stance": "bull"},
            {"ticker": "$ASTS", "stance": "neutral"},
        ],
    }

    assert _tickers_from_enrichment(enrichment) == ["RKLB", "SPCX", "ASTS"]


def test_score_tweet_prefers_tag_matches_over_body_only():
    terms = expand_query_terms("SpaceX 还会涨吗？")
    tagged = {
        "text": "This is a short note.",
        "symbols": {
            "quality": "keep",
            "ticker_stances": [{"ticker": "SPCX", "stance": "neutral"}],
            "sectors": ["航天"],
        },
    }
    body_only = {
        "text": "SpaceX is mentioned once in the body.",
        "symbols": {"quality": "keep"},
    }

    tagged_score, tagged_matches = score_tweet_for_topic(tagged, terms)
    body_score, body_matches = score_tweet_for_topic(body_only, terms)

    assert tagged_score > body_score
    assert "spcx" in tagged_matches
    assert "spacex" in body_matches


def test_score_tweet_requires_topic_match_before_quality_boost():
    terms = expand_query_terms("SpaceX 还会涨吗？")
    unrelated = {
        "text": "NVDA earnings commentary with no space-economy topic.",
        "symbols": {"quality": "keep"},
        "like_count": 100,
        "retweet_count": 20,
    }

    score, matches = score_tweet_for_topic(unrelated, terms)

    assert score == 0
    assert matches == []


def test_score_tweet_does_not_match_short_ticker_inside_words():
    terms = expand_query_terms("SpaceX 还会涨吗？")
    false_positive = {
        "text": "People are applying multiple models. This is plainly unrelated.",
        "symbols": {"quality": "keep"},
    }
    exact_ticker = {
        "text": "$PL is discussed as a space-economy peer.",
        "symbols": {"quality": "keep"},
    }

    false_score, false_matches = score_tweet_for_topic(false_positive, terms)
    exact_score, exact_matches = score_tweet_for_topic(exact_ticker, terms)

    assert false_score == 0
    assert false_matches == []
    assert exact_score > 0
    assert "pl" in exact_matches
