from app.features.screener.research_agent import _JsonStringFieldDelta
from app.features.screener.router import _stream_text_chunks


def test_json_string_field_delta_streams_message_only():
    parser = _JsonStringFieldDelta("message")

    chunks = [
        '{"title":"","message":"你好',
        '\\n',
        '世界',
        '","options":["x"]}',
    ]
    deltas = [parser.feed(chunk) for chunk in chunks]

    assert "".join(deltas) == "你好\n世界"


def test_json_string_field_delta_ignores_other_fields_before_message():
    parser = _JsonStringFieldDelta("message")

    assert parser.feed('{"title":"不要显示","options":[]') == ""
    assert parser.feed(',"message":"正文') == "正文"
    assert parser.feed('继续"}') == "继续"


def test_json_string_field_delta_handles_escape_across_chunks():
    parser = _JsonStringFieldDelta("message")

    assert parser.feed('{"message":"他说\\') == ""
    assert parser.feed('"hi') == '他说"hi'
    assert parser.feed('"}') == ""


def test_stream_text_chunks_preserves_text_order():
    assert _stream_text_chunks("abcdef", chunk_size=2) == ["ab", "cd", "ef"]
    assert "".join(_stream_text_chunks("你好世界", chunk_size=1)) == "你好世界"
