#!/usr/bin/env python3
"""
Sync all existing website users with Resend subscriptions.
Links user_id from Insforge auth with Resend contact metadata.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/sync_existing_users.py
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.services.subscription_service import get_subscription_service


def sync_all_users():
    """Sync all existing website users with Resend subscriptions."""

    subscription_service = get_subscription_service()

    # Users from auth.users table (queried via Insforge MCP)
    users = [
        {"id": "d00a6201-646a-489f-95a2-aff8f90fe669", "email": "kedengpan@gmail.com", "name": "Golden Pan"},
        {"id": "b530a7a8-25f5-45ee-95f1-79acddb048e5", "email": "test@marketbrew.test", "name": "Test User"},
        {"id": "cec8d3f7-7f0e-4e6d-b943-fc98232eb52c", "email": "agneszhang37@gmail.com", "name": "Agnes Zhang"},
    ]

    print("Syncing users with Resend subscriptions...")
    print("=" * 50)

    synced = 0
    for user in users:
        print(f"\n{user['name']} ({user['email']})")

        result = subscription_service.sync_user(
            user_id=user['id'],
            email=user['email'],
            first_name=user['name']
        )

        if result.get('synced_channels'):
            synced += 1
            for ch in result['synced_channels']:
                status = "subscribed" if ch['subscribed'] else "unsubscribed"
                symbols = ch.get('metadata', {}).get('symbols', [])
                symbols_str = f" ({', '.join(symbols)})" if symbols else ""
                print(f"  + {ch['channel']}: {status}{symbols_str}")
        else:
            print("  - No subscriptions found")

        # Respect Resend rate limit (2 requests/second)
        time.sleep(2)

    print(f"\n{'='*50}")
    print(f"Done: {synced}/{len(users)} users synced with subscriptions")


if __name__ == "__main__":
    sync_all_users()
