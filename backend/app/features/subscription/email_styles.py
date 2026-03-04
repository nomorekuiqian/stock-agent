"""
Shared CSS inline style constants for email templates.

Single source of truth for all email styling -- change brand colors or
card appearance here and every template picks it up automatically.
"""

# Card containers
CARD_STYLE = (
    "background: #ffffff; border: 1px solid #e4e4e7; "
    "border-radius: 8px; padding: 20px; margin-bottom: 16px;"
)
CARD_STYLE_WIDE = (
    "background: #ffffff; border: 1px solid #e4e4e7; "
    "border-radius: 8px; padding: 24px; margin-bottom: 16px;"
)

# Section headers
SECTION_HEADER_STYLE = (
    "font-size: 12px; font-weight: 600; color: #0a0a0a; "
    "text-transform: uppercase; letter-spacing: 0.1em; "
    "margin-bottom: 16px; padding-left: 12px; "
    "border-left: 3px solid #0a0a0a;"
)
SECTION_HEADER_STYLE_GREEN = (
    "font-size: 12px; font-weight: 600; color: #0a0a0a; "
    "text-transform: uppercase; letter-spacing: 0.1em; "
    "margin-bottom: 16px; padding-left: 12px; "
    "border-left: 3px solid #10b981;"
)

# Subsection headers
SUBSECTION_HEADER_STYLE = (
    "font-size: 11px; font-weight: 600; color: #71717a; "
    "text-transform: uppercase; letter-spacing: 0.08em; "
    "margin-bottom: 12px; margin-top: 4px;"
)

# Analysis box (used in morning report)
ANALYSIS_BOX_STYLE = (
    "font-size: 12px; color: #52525b; background: #f8f8f8; "
    "padding: 10px 12px; border-radius: 4px; line-height: 1.6; "
    "margin-top: 10px;"
)
