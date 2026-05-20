# pyright: reportMissingImports=false
"""Backup critical Insforge tables to JSONL files.

Designed to run as a daily cron (locally via launchd, or in GitHub Actions).
Outputs one JSONL file per table under ./backups/<YYYY-MM-DD>/.

This is the minimal version — it dumps each table via Insforge's REST API
using the SERVICE_KEY. It does NOT handle:
- Schema export (only data)
- Incremental backup
- Compression / upload to S3 / encryption at rest

TODO for主理人 before relying on this for disaster recovery:
1. Decide where backups live long-term (S3 / iCloud / Time Machine / Google Drive)
2. Add upload step at the end of main()
3. Wire into GitHub Actions cron (.github/workflows/insforge-backup.yml)
4. Add a restore counterpart script
5. Verify Insforge's own PITR / snapshot offering — if available, this script
   becomes a redundant secondary backup

Usage:
    python scripts/backup_insforge.py
    python scripts/backup_insforge.py --tables subscriptions watchlists daily_reports
    python scripts/backup_insforge.py --out /path/to/backups
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / "backend" / ".env")

CRITICAL_TABLES = [
    "subscriptions",
    "watchlists",
    "user_profiles",
    "daily_reports",
    "morning_reports",
    "personal_digests",
    "feedback",
    "invite_codes",
]


async def dump_table(table: str, out_dir: Path) -> int:
    """Dump a table to JSONL. Returns row count.

    NOTE: This stub uses a placeholder. Insforge does not expose a generic
    "SELECT * FROM table" REST endpoint — each table typically goes through
    an edge function. Until主理人 confirms the correct path, this function
    raises so we don't generate empty backups silently.
    """
    raise NotImplementedError(
        f"TODO: implement dump for '{table}'. Pick one approach:\n"
        f"  A) Call an edge function action like list_all_<table> (need to add it)\n"
        f"  B) Use Insforge's pg_dump endpoint if exposed via SERVICE_KEY\n"
        f"  C) Direct PostgreSQL connection string if Insforge exposes one\n"
        f"Output should be JSONL written to {out_dir}/{table}.jsonl"
    )


async def main() -> int:
    parser = argparse.ArgumentParser(description="Backup Insforge tables to JSONL.")
    parser.add_argument(
        "--tables",
        nargs="+",
        default=CRITICAL_TABLES,
        help=f"Tables to dump (default: {' '.join(CRITICAL_TABLES)})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=PROJECT_ROOT / "backups",
        help="Output directory root (default: ./backups)",
    )
    args = parser.parse_args()

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_dir = args.out / today
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Backup target: {out_dir}")
    print(f"Tables: {', '.join(args.tables)}")
    print()

    manifest = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "tables": {},
    }
    exit_code = 0

    for table in args.tables:
        try:
            count = await dump_table(table, out_dir)
            print(f"  OK   {table}: {count} rows")
            manifest["tables"][table] = {"rows": count, "status": "ok"}
        except NotImplementedError as e:
            print(f"  TODO {table}: {e}")
            manifest["tables"][table] = {"status": "not_implemented"}
            exit_code = 2
        except Exception as e:
            print(f"  FAIL {table}: {e}")
            manifest["tables"][table] = {"status": "error", "error": str(e)}
            exit_code = 1

    manifest["finished_at"] = datetime.now(timezone.utc).isoformat()
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print()
    print(f"Manifest written to {out_dir / 'manifest.json'}")

    return exit_code


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
