"""
Sync watchlist users to Resend "Personal Digest Daily" audience,
and create "Conversion Targets" audience with all engaged users.

Usage:
    # Dry run (default) - only prints what would happen
    python scripts/sync_resend_audiences.py

    # Actually execute
    python scripts/sync_resend_audiences.py --execute
"""

import argparse
import json
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend
from app.core.config import RESEND_API_KEY

resend.api_key = RESEND_API_KEY

RATE_LIMIT_DELAY = 0.55  # 550ms between Resend API calls


def rate_wait():
    time.sleep(RATE_LIMIT_DELAY)


# ---------------------------------------------------------------------------
# Step 1: All watchlist users (from DB query results)
# These users have set up watchlists and should be in Personal Digest audience
# ---------------------------------------------------------------------------
WATCHLIST_USERS = [
    {"email": "zhuangxuesong@163.com", "user_id": "0695a323-1ba0-4009-b70c-49280a86dff9"},
    {"email": "martin890@duck.com", "user_id": "6031d46f-072e-47a9-9e74-5e9f4e1d250a"},
    {"email": "drqiezi@gmail.com", "user_id": "e8069c49-ae10-4f02-9f6e-ff6fa0fb3637"},
    {"email": "rightnameleft@gmail.com", "user_id": "76eac8b9-48bb-41d2-9edf-c7ff2dbec430"},
    {"email": "rayniwang@gmail.com", "user_id": "9a690a1f-fa26-4d1a-b039-104796a25811"},
    {"email": "ceciliaintech@gmail.com", "user_id": "b75c8bf9-50fe-40de-aa2b-143abeb5f18d"},
    {"email": "amandaxu88@gmail.com", "user_id": "d7c532aa-a3e6-4316-9abe-613ee2126ec6"},
    {"email": "931098495@qq.com", "user_id": "774176d6-8f83-4bf9-b121-9191c0c9014b"},
    {"email": "mikeduan@gmail.com", "user_id": "beb69633-011f-4963-ba4b-fbee743c6cd3"},
    {"email": "chunqiuzhanguo296@gmail.com", "user_id": "fb9e2800-c6df-4403-9d7d-9519518f6227"},
    {"email": "slowdownops@gmail.com", "user_id": "dbf3253c-2a9b-4d42-bd3a-ed38a511af93"},
    {"email": "1413511145@qq.com", "user_id": "6f955ab0-7980-4dca-a67f-a24609bc0223"},
    {"email": "xiaohang.chen02@gmail.com", "user_id": "5a56cbe9-c7b4-4d7a-9e65-42dccedf53a5"},
    {"email": "chair_kao@hotmail.com", "user_id": "64fd626b-78da-490a-a35d-2802bf5aac4a"},
    {"email": "yitezheng13@gmail.com", "user_id": "3b72f296-2d33-40c7-8edd-6ab292d1dc49"},
    {"email": "dongyanqing0716@gmail.com", "user_id": "852bfa55-bff8-49c9-ab01-6c0e56d7cd3a"},
    {"email": "jadeju2021888@gmail.com", "user_id": "7f0b4623-7107-4408-a89d-6a198fdb0b9f"},
    {"email": "jackz2000@gmail.com", "user_id": "0c1e9965-17cd-4dd5-aed3-44056d9e0c83"},
    {"email": "85205669@qq.com", "user_id": "c2e6c987-fe07-4b92-8160-d61788890cc3"},
    {"email": "yinong.cai@foxmail.com", "user_id": "720b45dd-634b-45d6-8d83-5b2eea696c1f"},
    {"email": "pzheng421@gmail.com", "user_id": "efb747c5-f292-421e-995b-6bd61368022b"},
    {"email": "jasmine.beini@gmail.com", "user_id": "eea7ada0-0315-40c7-b435-4fdc763e5eab"},
    {"email": "jessmoon999@gmail.com", "user_id": "1a850132-4a90-4d74-b2c1-7080933e5fa2"},
    {"email": "jiancao2018@gmail.com", "user_id": "2418b74d-7e69-465d-ab02-ff5db3758539"},
    {"email": "crystal.qin94@gmail.com", "user_id": "13fbbfad-c6ed-4852-9608-14770d9bdcc4"},
    {"email": "rusheng0903@gmail.com", "user_id": "f11bc924-511b-40d6-b688-48693a930d40"},
    {"email": "lindui1994@gmail.com", "user_id": "72306abc-953d-44b4-809c-0d93ff95e44b"},
    {"email": "470119982@qq.com", "user_id": "6c58c198-2f73-4071-bdf5-f627987c81d4"},
    {"email": "jozhou8221@gmail.com", "user_id": "275c0c2e-c5b3-4fd8-b33c-8bda474dde8b"},
    {"email": "mornwing@gmail.com", "user_id": "bfbd1e50-f4cf-44a1-a6c8-f80b222c4872"},
    {"email": "chihfong@outlook.com", "user_id": "0c228395-59df-49bb-9fd8-d2ef757c633a"},
    {"email": "junnie.qiu@gmail.com", "user_id": "62faa1f2-7ccd-4075-be37-b161a05fff7b"},
    {"email": "jsun199508@gmail.com", "user_id": "661f442c-60a2-4cc8-a4d9-1c67299f0865"},
    {"email": "connectaso@gmail.com", "user_id": "c9d38dcb-486b-408f-b9e0-cede003ab6d0"},
    {"email": "ssxxzzyyabab@gmail.com", "user_id": "b9be8872-340a-4379-ba76-ec8596b5f409"},
    {"email": "stanleysheng1987@gmail.com", "user_id": "088ce3aa-d4b0-433b-b232-2a890e9107cb"},
    {"email": "286823689@qq.com", "user_id": "63aba221-d907-4f59-9ffa-af5bbff49e8b"},
    {"email": "a34b56c78@163.com", "user_id": "809ada2f-a4c6-4c51-8cf0-67491038c4de"},
    {"email": "maximaoliver8@gmail.com", "user_id": "3dd6c6f0-5487-48c6-b690-3ecf91cf0cc0"},
    {"email": "abc977gold@gmail.com", "user_id": "c1627c06-7b1d-404c-a2b4-ac5072d40974"},
    {"email": "genesofar@gmail.com", "user_id": "2510ac2a-670d-4053-b3a8-130590649202"},
    {"email": "gwu188@gmail.com", "user_id": "0c6b339f-078d-4da6-9697-5d9400013936"},
    {"email": "flqgggggg@gmail.com", "user_id": "b9a23f2b-4633-45ae-9fdc-d84726240890"},
    {"email": "gkjiale@gmail.com", "user_id": "b756e36a-6614-4c32-9408-ba1bdd203e56"},
    {"email": "2449565796@qq.com", "user_id": "083c960a-f7a3-4618-a36c-d357d454e7af"},
    {"email": "594865967@qq.com", "user_id": "c654b8c6-45a5-4b4b-9fc1-6c8250f90368"},
    {"email": "zhoujunfuv5@163.com", "user_id": "8316c941-9a72-4c67-8ee5-f860605be913"},
    {"email": "diytwork@gmail.com", "user_id": "6e48f462-0855-4ff9-87cf-82b6dedd5142"},
    {"email": "senpainoticeme20xx@gmail.com", "user_id": "822350db-f076-4ac8-b195-f6274d23c0ad"},
    {"email": "wenyi.wynn@gmail.com", "user_id": "100784f1-e554-4f03-a4b0-dfc5b512a457"},
    {"email": "307911541@qq.com", "user_id": "43ad250d-59ce-47aa-a553-153fa4540394"},
    {"email": "celtiswang@gmail.com", "user_id": "540b5b22-8b31-4338-bd54-ecd7605c4144"},
    {"email": "yizhou.kyle.lou@gmail.com", "user_id": "66383822-bafa-4df8-8658-16b128861f21"},
    {"email": "billfan1991@gmail.com", "user_id": "8e83d37f-cabb-4730-b067-17ef95985564"},
    {"email": "1234ohshell@gmail.com", "user_id": "e028301f-c5e0-4d20-abc5-b05d0817664f"},
    {"email": "jxiang30@gmail.com", "user_id": "6e617019-b54c-4eb3-a8cf-ee9addb1662f"},
    {"email": "mdctherapy@gmail.com", "user_id": "607503f9-b64f-419d-a9e8-6b89fff1755f"},
    {"email": "bobo@chuhaiqu.club", "user_id": "ef83dd40-bc9a-4bb8-a09d-bf996fdb6aa6"},
    {"email": "voya.technologies@gmail.com", "user_id": "14204862-26b9-4f24-b8ff-7f98e2f3fe1d"},
    {"email": "qzhu24@gmail.com", "user_id": "0e113d57-cc9f-4b35-a900-745904571524"},
    {"email": "zyzjames2004@gmail.com", "user_id": "4cba7993-3d58-4051-8c3c-2e534c04fc72"},
    {"email": "ttian.ttian10@gmail.com", "user_id": "efd1b8a8-e805-4323-b028-9a491e8dbaf9"},
    {"email": "steven.hova@gmail.com", "user_id": "b3a143ba-f0f1-4269-a11f-077655538a62"},
    {"email": "likenan930524@gmail.com", "user_id": "9e9d3909-f315-46aa-89af-e8cc1628db6a"},
    {"email": "benzhiyuanwang@gmail.com", "user_id": "5bd29ae4-26b4-45c7-8ccd-5535145f6128"},
    {"email": "xuxy1994@gmail.com", "user_id": "cc6be287-9a4e-436c-8b21-3e204c54a5ef"},
    {"email": "leoxu993@gmail.com", "user_id": "a20acb6b-2e12-4556-bf99-441e3b49a554"},
    {"email": "sqrt2141@gmail.com", "user_id": "cca77946-098f-45c1-951d-b591c481ad0b"},
    {"email": "jackli9299@gmail.com", "user_id": "926620b5-248a-4979-a67b-7f5b9458410c"},
    {"email": "agneszhang37@gmail.com", "user_id": "cec8d3f7-7f0e-4e6d-b943-fc98232eb52c"},
    {"email": "kedengpan@gmail.com", "user_id": "d00a6201-646a-489f-95a2-aff8f90fe669"},
]

# ---------------------------------------------------------------------------
# Step 2: All engaged users for Conversion Targets audience
# Sources: watchlist, questionnaire, email_feedback, user_feedback
# ---------------------------------------------------------------------------
CONVERSION_TARGETS = [
    # 4 sources
    {"email": "594865967@qq.com", "sources": "watchlist,questionnaire,email_feedback,user_feedback"},
    # 3 sources
    {"email": "connectaso@gmail.com", "sources": "watchlist,questionnaire,email_feedback"},
    {"email": "jackli9299@gmail.com", "sources": "watchlist,questionnaire,email_feedback"},
    {"email": "qzhu24@gmail.com", "sources": "watchlist,questionnaire,email_feedback"},
    # 2 sources
    {"email": "1234ohshell@gmail.com", "sources": "watchlist,email_feedback"},
    {"email": "931098495@qq.com", "sources": "watchlist,questionnaire"},
    {"email": "a34b56c78@163.com", "sources": "watchlist,questionnaire"},
    {"email": "benzhiyuanwang@gmail.com", "sources": "watchlist,email_feedback"},
    {"email": "bobo@chuhaiqu.club", "sources": "watchlist,email_feedback"},
    {"email": "dongyanqing0716@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "jsun199508@gmail.com", "sources": "watchlist,email_feedback"},
    {"email": "junnie.qiu@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "jxiang30@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "likenan930524@gmail.com", "sources": "watchlist,email_feedback"},
    {"email": "martin890@duck.com", "sources": "watchlist,questionnaire"},
    {"email": "mikeduan@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "rayniwang@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "rightnameleft@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "rusheng0903@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "slowdownops@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "sqrt2141@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "superluck58@outlook.com", "sources": "questionnaire,email_feedback"},
    {"email": "ttian.ttian10@gmail.com", "sources": "watchlist,email_feedback"},
    {"email": "wenyi.wynn@gmail.com", "sources": "watchlist,questionnaire"},
    {"email": "xuxy1994@gmail.com", "sources": "watchlist,email_feedback"},
    {"email": "yinong.cai@foxmail.com", "sources": "watchlist,questionnaire"},
    {"email": "zhuangxuesong@163.com", "sources": "watchlist,questionnaire"},
    {"email": "zyzjames2004@gmail.com", "sources": "watchlist,questionnaire"},
    # 1 source (questionnaire only - not in watchlist)
    {"email": "1007235554@qq.com", "sources": "questionnaire"},
    {"email": "a307820157@gmail.com", "sources": "questionnaire"},
    {"email": "aaronlee0727@gmail.com", "sources": "questionnaire"},
    {"email": "akllbzc@gmail.com", "sources": "questionnaire"},
    {"email": "alexjiang28@icloud.com", "sources": "questionnaire"},
    {"email": "aochen63@gmail.com", "sources": "questionnaire"},
    {"email": "bizarf2022@gmail.com", "sources": "questionnaire"},
    {"email": "hd984144063@gmail.com", "sources": "questionnaire"},
    {"email": "hdaxiong@sina.cn", "sources": "questionnaire"},
    {"email": "jiahaopeng666@gmail.com", "sources": "questionnaire"},
    {"email": "jws19951205@gmail.com", "sources": "questionnaire"},
    {"email": "linx0725@gmail.com", "sources": "questionnaire"},
    {"email": "linxi0818@gmail.com", "sources": "questionnaire"},
    {"email": "lubing0410@gmail.com", "sources": "questionnaire"},
    {"email": "north1039@163.com", "sources": "questionnaire"},
    {"email": "sdytfx12@gmail.com", "sources": "questionnaire"},
    {"email": "shark.hh@gmail.com", "sources": "questionnaire"},
    {"email": "shawfeng22@gmail.com", "sources": "questionnaire"},
    {"email": "tigercai0221@gmail.com", "sources": "questionnaire"},
    {"email": "zxyzx0430@outlook.com", "sources": "questionnaire"},
    {"email": "zzpwestlife@gmail.com", "sources": "questionnaire"},
    # 1 source (email_feedback only)
    {"email": "1445049657@qq.com", "sources": "email_feedback"},
    {"email": "2290507789@qq.com", "sources": "email_feedback"},
    {"email": "james1024@126.com", "sources": "email_feedback"},
    {"email": "Jenny.shaozhen.zhang@gmail.com", "sources": "email_feedback"},
    {"email": "jessiek@phoenixtv.com", "sources": "email_feedback"},
    {"email": "leo@67pallmall.com", "sources": "email_feedback"},
    {"email": "liuruochen526@gmail.com", "sources": "email_feedback"},
    {"email": "morrison416cn@gmail.com", "sources": "email_feedback"},
    {"email": "wangj7@tcd.ie", "sources": "email_feedback"},
    {"email": "yuhe0326@gmail.com", "sources": "email_feedback"},
    {"email": "zhuangfeizan2900@sina.com", "sources": "email_feedback"},
    {"email": "zx2592@gmail.com", "sources": "email_feedback"},
    # 1 source (user_feedback only)
    {"email": "etih94932@gmail.com", "sources": "user_feedback"},
    {"email": "gao@kankan.de", "sources": "user_feedback"},
    {"email": "nathan.lee.tw@gmail.com", "sources": "user_feedback"},
    {"email": "vhhkyunate@gmail.com", "sources": "user_feedback"},
]


def build_conversion_targets() -> list[dict]:
    """Merge WATCHLIST_USERS + CONVERSION_TARGETS into a single deduplicated list.

    Conversion Targets is a superset of Personal Digest Daily:
    all watchlist users + all other engaged users.
    """
    merged: dict[str, dict] = {}

    # Add all watchlist users first
    for u in WATCHLIST_USERS:
        email = u["email"].lower()
        merged[email] = {"email": u["email"], "sources": "watchlist"}

    # Merge in engagement data (may upgrade sources for existing entries)
    for t in CONVERSION_TARGETS:
        email = t["email"].lower()
        if email in merged:
            # Merge sources
            existing_sources = set(merged[email]["sources"].split(","))
            new_sources = set(t["sources"].split(","))
            all_sources = sorted(existing_sources | new_sources)
            merged[email]["sources"] = ",".join(all_sources)
        else:
            merged[email] = {"email": t["email"], "sources": t["sources"]}

    return sorted(merged.values(), key=lambda x: x["sources"].count(","), reverse=True)


def find_audience(name: str) -> str | None:
    """Find audience ID by name."""
    rate_wait()
    audiences = resend.Audiences.list()
    for aud in audiences.get("data", []):
        if aud.get("name") == name:
            return aud["id"]
    return None


def create_audience(name: str) -> str:
    """Create a new audience."""
    rate_wait()
    result = resend.Audiences.create({"name": name})
    return result["id"]


def list_contacts(audience_id: str) -> dict[str, dict]:
    """List all contacts in an audience, keyed by email."""
    rate_wait()
    contacts = resend.Contacts.list(audience_id=audience_id)
    return {
        c["email"].lower(): c
        for c in contacts.get("data", [])
    }


def add_contact(audience_id: str, email: str, user_id: str | None = None,
                sources: str | None = None) -> None:
    """Add or update a contact in an audience."""
    params: dict = {
        "audience_id": audience_id,
        "email": email,
        "unsubscribed": False,
    }
    # Store metadata in last_name as JSON (Resend workaround)
    metadata = {}
    if user_id:
        metadata["user_id"] = user_id
    if sources:
        metadata["sources"] = sources
    if metadata:
        params["last_name"] = json.dumps(metadata)

    rate_wait()
    try:
        resend.Contacts.create(params)
    except Exception as e:
        if "already exists" in str(e).lower():
            # Update existing contact
            rate_wait()
            resend.Contacts.update({
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": False,
                **({"last_name": json.dumps(metadata)} if metadata else {}),
            })
        else:
            raise


def sync_personal_digest(execute: bool) -> None:
    """Step 1: Sync watchlist users to Personal Digest Daily audience."""
    print("\n" + "=" * 60)
    print("STEP 1: Sync Watchlist -> Personal Digest Daily")
    print("=" * 60)

    audience_id = find_audience("Personal Digest Daily")
    if not audience_id:
        print("ERROR: 'Personal Digest Daily' audience not found!")
        return

    print(f"Audience ID: {audience_id}")

    existing = list_contacts(audience_id)
    print(f"Existing contacts: {len(existing)}")
    print(f"Watchlist users to sync: {len(WATCHLIST_USERS)}")

    missing = []
    for user in WATCHLIST_USERS:
        if user["email"].lower() not in existing:
            missing.append(user)

    print(f"\nMissing from Resend (need to add): {len(missing)}")
    for u in missing:
        print(f"  + {u['email']}")

    if execute and missing:
        print(f"\nAdding {len(missing)} contacts...")
        for i, user in enumerate(missing):
            add_contact(audience_id, user["email"], user_id=user["user_id"])
            print(f"  [{i+1}/{len(missing)}] Added {user['email']}")
        print("Done!")
    elif not execute and missing:
        print("\n[DRY RUN] Use --execute to actually add these contacts")


def create_conversion_targets(execute: bool) -> None:
    """Step 2: Create Conversion Targets audience with all engaged users."""
    print("\n" + "=" * 60)
    print("STEP 2: Create Conversion Targets Audience")
    print("=" * 60)

    audience_name = "Conversion Targets"
    all_targets = build_conversion_targets()
    print(f"Total engaged users (superset): {len(all_targets)}")

    # Show breakdown
    multi = [t for t in all_targets if "," in t["sources"]]
    single = [t for t in all_targets if "," not in t["sources"]]
    print(f"  Multi-source (2+): {len(multi)}")
    print(f"  Single-source: {len(single)}")

    if not execute:
        print("\n[DRY RUN] Would create audience and add all contacts")
        print("[DRY RUN] Use --execute to actually create")
        return

    audience_id = find_audience(audience_name)
    if audience_id:
        print(f"Audience '{audience_name}' already exists: {audience_id}")
        existing = list_contacts(audience_id)
        print(f"Existing contacts: {len(existing)}")
    else:
        print(f"Creating audience '{audience_name}'...")
        audience_id = create_audience(audience_name)
        print(f"Created: {audience_id}")
        existing = {}

    to_add = [
        t for t in all_targets
        if t["email"].lower() not in existing
    ]
    print(f"New contacts to add: {len(to_add)}")

    for i, target in enumerate(to_add):
        add_contact(audience_id, target["email"], sources=target["sources"])
        print(f"  [{i+1}/{len(to_add)}] Added {target['email']} ({target['sources']})")

    print("Done!")


def main():
    parser = argparse.ArgumentParser(description="Sync Resend audiences")
    parser.add_argument("--execute", action="store_true",
                        help="Actually execute (default is dry run)")
    args = parser.parse_args()

    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not configured")
        return

    if not args.execute:
        print("*** DRY RUN MODE (use --execute to make changes) ***")

    sync_personal_digest(args.execute)
    create_conversion_targets(args.execute)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Watchlist users (Personal Digest): {len(WATCHLIST_USERS)}")
    print(f"Conversion targets (superset): {len(build_conversion_targets())}")
    if not args.execute:
        print("\nRun with --execute to apply changes.")


if __name__ == "__main__":
    main()
