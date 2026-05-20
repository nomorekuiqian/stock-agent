"""
Twitter KOL types.

The hardcoded seed catalog was removed once the catalog moved fully to the
`kol_accounts` DB table (populated by `sync_kol_list`). Only the row shape
remains, used by `app/features/twitter/service.py`.
"""

from typing import NotRequired, TypedDict


class KolAccount(TypedDict):
    username: str                    # Twitter handle without @
    display_name: str                # Human-readable name
    source: NotRequired[str]         # "list:<id>" — only list-sourced rows are ingested
