"""Generic background-job run monitoring for the admin console.

A *source* exposes a normalized view (recent runs + a health overview) of a
recurring background job, so the admin UI can monitor any job — zsxq ingest
today, the Twitter crawl tomorrow — through one screen. Add a source by
implementing ``JobSource`` and registering it; no UI change needed.
"""
