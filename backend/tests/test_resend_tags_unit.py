from app.core.resend_tags import resend_channel_tags


def test_resend_channel_tags_include_channel_and_extra_values():
    tags = resend_channel_tags(
        "daily_report",
        cta_variant="paid",
        empty="",
        missing=None,
        retry=2,
    )

    assert tags == [
        {"name": "channel", "value": "daily_report"},
        {"name": "cta_variant", "value": "paid"},
        {"name": "retry", "value": "2"},
    ]
