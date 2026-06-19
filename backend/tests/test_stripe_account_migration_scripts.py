from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock

import pytest


def test_prepare_customers_selects_safe_default_candidates():
    from scripts import prepare_stripe_account_migration_customers as prepare

    single = prepare.PaymentCandidate(
        id="pm_single",
        kind="payment_method",
        created=1,
        signature=("visa", "4242", 1, 2030, "fp_1"),
    )
    duplicate_old = prepare.PaymentCandidate(
        id="pm_old",
        kind="payment_method",
        created=1,
        signature=("amex", "2003", 6, 2027, "fp_2"),
    )
    duplicate_new = prepare.PaymentCandidate(
        id="pm_new",
        kind="payment_method",
        created=2,
        signature=("amex", "2003", 6, 2027, "fp_2"),
    )

    selected, reason = prepare.choose_default_candidate(
        [single],
        source_default_signature=None,
    )
    assert selected == single
    assert reason == "single_candidate"

    selected, reason = prepare.choose_default_candidate(
        [duplicate_old, duplicate_new],
        source_default_signature=None,
    )
    assert selected == duplicate_new
    assert reason == "identical_candidates"


def test_prepare_customers_uses_source_default_match_and_rejects_ambiguous_cards():
    from scripts import prepare_stripe_account_migration_customers as prepare

    source_signature = ("visa", "4242", 1, 2030, "fp_1")
    matching = prepare.PaymentCandidate(
        id="pm_match",
        kind="payment_method",
        created=1,
        signature=source_signature,
    )
    other = prepare.PaymentCandidate(
        id="pm_other",
        kind="payment_method",
        created=2,
        signature=("mastercard", "4444", 1, 2030, "fp_2"),
    )

    selected, reason = prepare.choose_default_candidate(
        [matching, other],
        source_default_signature=source_signature,
    )
    assert selected == matching
    assert reason == "matched_source_default"

    selected, reason = prepare.choose_default_candidate(
        [matching, other],
        source_default_signature=None,
    )
    assert selected is None
    assert reason == "multiple_candidates_no_match"


def test_prepare_customers_writes_dashboard_pan_copy_csv(monkeypatch, tmp_path):
    from scripts import prepare_stripe_account_migration_customers as prepare

    monkeypatch.setattr(prepare, "REPORT_DIR", tmp_path)
    paths = prepare._write_outputs([
        prepare.CustomerReadiness(
            user_id="user-1",
            email="user@example.com",
            source_subscription_id="sub_old",
            source_customer_id="cus_old",
            destination_customer_id="cus_new",
            has_default_payment_method=False,
            attached_payment_method_count=0,
            attached_source_count=0,
            selected_default_id=None,
            default_action="no_candidates",
            risk="missing_destination_payment_method",
            ok=False,
        )
    ])

    assert paths["pan_copy"].read_text(encoding="utf-8").splitlines()[0] == "customer"
    assert paths["pan_copy_dashboard"].read_text(encoding="utf-8").splitlines()[0] == "Customer ID"


def test_preflight_active_rows_skip_already_destination_state():
    from scripts import preflight_stripe_account_migration as preflight

    rows = [
        {
            "user_id": "user-1",
            "status": "active",
            "stripe_subscription_id": "sub_source",
        },
        {
            "user_id": "user-2",
            "status": "active",
            "stripe_subscription_id": "sub_dest",
            "stripe_migration_state": "already_destination",
        },
    ]

    assert preflight._active_stripe_rows(rows, None) == [rows[0]]


def test_status_phase_reports_awaiting_pan_copy():
    from scripts import status_stripe_account_migration as status

    summary = {
        "discovered_mapping_rows": 0,
        "discovered_schedule_rows": 0,
        "payment_risks": {"missing_destination_payment_method": 25},
        "preflight_ok": False,
        "exported_rows": 45,
    }

    assert status._phase(summary) == "awaiting_pan_copy"


def test_status_phase_reports_scheduled_toolkit_import():
    from scripts import status_stripe_account_migration as status

    summary = {
        "discovered_mapping_rows": 0,
        "discovered_schedule_rows": 45,
        "payment_risks": {},
        "preflight_ok": True,
        "exported_rows": 45,
    }

    assert status._phase(summary) == "post_import_scheduled"


def test_status_phase_reports_schedule_mapping_ready():
    from scripts import status_stripe_account_migration as status

    summary = {
        "discovered_mapping_rows": 0,
        "discovered_schedule_rows": 45,
        "discovered_schedule_pending_rows": 0,
        "discovered_schedule_ready_rows": 45,
        "payment_risks": {},
        "preflight_ok": True,
        "exported_rows": 45,
    }

    assert status._phase(summary) == "post_import_reconcile_ready"


def test_status_next_action_reports_pan_copy_artifact(monkeypatch, tmp_path):
    from scripts import status_stripe_account_migration as status

    pan_copy = tmp_path / "pan-copy-remaining-customer-ids-dashboard-20260618T190038Z.csv"
    pan_copy.write_text("Customer ID\ncus_old\n", encoding="utf-8")
    monkeypatch.setattr(status, "REPORT_DIR", tmp_path)

    action = status._next_action(
        {
            "phase": "awaiting_pan_copy",
            "payment_risks": {"missing_destination_payment_method": 25},
        },
        customer_map_path=Path("tmp/stripe-account-migration/customer-map.csv"),
    )

    assert action["action"] == "upload_pan_copy"
    assert action["ready"] is False
    assert action["artifacts"]["latest_pan_copy_dashboard_csv"] == str(pan_copy)
    assert "Billing migration toolkit" in action["do_not"][0]


def test_status_next_action_reports_toolkit_export_gate():
    from scripts import status_stripe_account_migration as status

    action = status._next_action(
        {
            "phase": "ready_for_billing_toolkit",
            "payment_risks": {},
        },
        customer_map_path=Path("tmp/stripe-account-migration/customer-map.csv"),
    )

    assert action["action"] == "export_and_upload_billing_toolkit_csv"
    assert action["ready"] is True
    assert any("--include-cancel-scheduled" in command for command in action["commands"])
    assert any("Do not reuse old toolkit CSVs" in item for item in action["do_not"])


def test_status_next_action_uses_ready_schedules_as_mapping_input():
    from scripts import status_stripe_account_migration as status

    action = status._next_action(
        {
            "phase": "post_import_reconcile_ready",
            "discovered_mapping_rows": 0,
            "discovered_schedule_rows": 45,
            "discovered_schedule_pending_rows": 0,
            "payment_risks": {},
        },
        customer_map_path=Path("tmp/stripe-account-migration/customer-map.csv"),
    )

    assert action["action"] == "reconcile_destination_subscriptions"
    assert action["ready"] is True
    assert "discover-schedules" in action["commands"][0]
    assert "discovered-schedules-latest.csv" in action["commands"][1]


@pytest.mark.asyncio
async def test_status_builds_summary(monkeypatch, tmp_path):
    from scripts import status_stripe_account_migration as status
    from scripts import preflight_stripe_account_migration as preflight
    from scripts import prepare_stripe_account_migration_customers as prepare
    from scripts import export_stripe_account_migration as export

    customer_map = tmp_path / "customer-map.csv"
    customer_map.write_text(
        "old_stripe_customer_id,new_stripe_customer_id,user_id\ncus_old,cus_new,user-1\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(status, "prepare_customers", AsyncMock(return_value=[
        prepare.CustomerReadiness(
            user_id="user-1",
            email="user@example.com",
            source_subscription_id="sub_old",
            source_customer_id="cus_old",
            destination_customer_id="cus_new",
            has_default_payment_method=False,
            attached_payment_method_count=0,
            attached_source_count=0,
            selected_default_id=None,
            default_action="no_candidates",
            risk="missing_destination_payment_method",
            ok=False,
        )
    ]))
    monkeypatch.setattr(
        status,
        "resolve_destination_product_ids",
        AsyncMock(return_value={"pro": "prod_pro", "max": "prod_max"}),
    )
    monkeypatch.setattr(
        status,
        "run_preflight",
        AsyncMock(return_value=preflight.PreflightReport(
            ok=False,
            summary={"hard_failures": 1},
            checks=[],
        )),
    )
    monkeypatch.setattr(
        status,
        "build_export",
        AsyncMock(return_value=[
            export.ExportRow(
                user_id="user-1",
                email="user@example.com",
                source_customer_id="cus_old",
                destination_customer_id="cus_new",
                source_subscription_id="sub_old",
                status="active",
                current_period_start=1,
                current_period_end=2,
                start_date=3,
                amount_summary="20 usd/month x1",
                action="exported",
                ok=True,
                csv_row={"cancel_at_period_end": ""},
            )
        ]),
    )
    monkeypatch.setattr(status, "discover_mapping", AsyncMock(return_value=[]))
    monkeypatch.setattr(status, "discover_schedules", AsyncMock(return_value=[]))

    report = await status.build_status(customer_map_path=customer_map)

    assert report["summary"]["phase"] == "awaiting_pan_copy"
    assert report["summary"]["customer_map_rows"] == 1
    assert report["summary"]["exported_rows"] == 1
    assert report["summary"]["discovered_schedule_rows"] == 0
    assert report["summary"]["discovered_schedule_ready_rows"] == 0
    assert report["summary"]["ready_for_toolkit_upload"] is False
    assert report["next_action"]["action"] == "upload_pan_copy"


@pytest.mark.asyncio
async def test_repair_local_state_marks_source_inactive_without_apply(monkeypatch):
    from scripts import repair_stripe_account_migration_local_state as repair

    local_rows = [{
        "user_id": "user-1",
        "email": "user@example.com",
        "plan": "pro",
        "status": "active",
        "stripe_customer_id": "cus_old",
        "stripe_subscription_id": "sub_old",
    }]
    apply_mark = AsyncMock()
    monkeypatch.setattr(repair, "_source_api_key", lambda source_account: "sk_live_source")
    monkeypatch.setattr(repair, "_destination_api_key", lambda: "sk_live_dest")
    monkeypatch.setattr(repair, "_list_local_users", AsyncMock(return_value=local_rows))
    monkeypatch.setattr(repair, "_active_stripe_rows", lambda rows, user_id_filter: rows)
    monkeypatch.setattr(
        repair,
        "_classify_candidate_accounts",
        AsyncMock(return_value={
            "source_active": [],
            "already_destination": [],
            "source_cancel_at_period_end": [],
            "source_inactive": [{
                "user_id": "user-1",
                "source_subscription_id": "sub_old",
                "status": "canceled",
            }],
            "unknown": [],
            "lookup_errors": [],
        }),
    )
    monkeypatch.setattr(
        repair,
        "_list_destination_active_subscriptions_by_email",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(repair, "_apply_mark_canceled", apply_mark)

    results = await repair.repair_local_state(apply=False)

    assert len(results) == 1
    assert results[0].action == "mark_canceled"
    assert results[0].ok is True
    assert results[0].applied is False
    apply_mark.assert_not_awaited()


@pytest.mark.asyncio
async def test_repair_local_state_applies_already_destination_sync(monkeypatch):
    from scripts import repair_stripe_account_migration_local_state as repair

    local_rows = [{
        "user_id": "user-1",
        "email": "user@example.com",
        "plan": "max",
        "status": "active",
        "stripe_customer_id": "cus_new",
        "stripe_subscription_id": "sub_new",
    }]
    apply_sync = AsyncMock(return_value=True)
    monkeypatch.setattr(repair, "_source_api_key", lambda source_account: "sk_live_source")
    monkeypatch.setattr(repair, "_destination_api_key", lambda: "sk_live_dest")
    monkeypatch.setattr(repair, "_list_local_users", AsyncMock(return_value=local_rows))
    monkeypatch.setattr(repair, "_active_stripe_rows", lambda rows, user_id_filter: rows)
    monkeypatch.setattr(
        repair,
        "_classify_candidate_accounts",
        AsyncMock(return_value={
            "source_active": [],
            "already_destination": local_rows,
            "source_cancel_at_period_end": [],
            "source_inactive": [],
            "unknown": [],
            "lookup_errors": [],
        }),
    )
    monkeypatch.setattr(
        repair,
        "_retrieve_subscription_with_key",
        AsyncMock(return_value={
            "id": "sub_new",
            "customer": "cus_new",
            "status": "active",
        }),
    )
    monkeypatch.setattr(repair, "_apply_destination_sync", apply_sync)

    results = await repair.repair_local_state(apply=True)

    assert len(results) == 1
    assert results[0].action == "sync_destination_subscription"
    assert results[0].ok is True
    assert results[0].applied is True
    assert results[0].destination_subscription_id == "sub_new"
    apply_sync.assert_awaited_once()
    assert apply_sync.await_args.kwargs["legacy_from_current"] is False


@pytest.mark.asyncio
async def test_export_builds_toolkit_adhoc_row(monkeypatch, tmp_path):
    from scripts import export_stripe_account_migration as export

    now = datetime(2026, 6, 18, tzinfo=timezone.utc)
    period_start = int((now - timedelta(days=1)).timestamp())
    period_end = int((now + timedelta(days=30)).timestamp())
    customer_map = tmp_path / "customer-map.csv"
    customer_map.write_text(
        "old_stripe_customer_id,new_stripe_customer_id\ncus_old,cus_new\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(export, "STRIPE_LEGACY_SECRET_KEY", "sk_legacy")
    monkeypatch.setattr(
        export,
        "_list_local_users",
        AsyncMock(return_value=[{
            "user_id": "user-1",
            "email": "user@example.com",
            "plan": "max",
            "status": "active",
            "stripe_customer_id": "cus_old",
            "stripe_subscription_id": "sub_old",
            "entitlements": ["ai_research_engine"],
        }]),
    )
    monkeypatch.setattr(
        export,
        "_retrieve_source_subscription",
        AsyncMock(return_value={
            "id": "sub_old",
            "customer": "cus_old",
            "status": "active",
            "collection_method": "charge_automatically",
            "automatic_tax": {"enabled": False},
            "items": {
                "data": [{
                    "quantity": 1,
                    "current_period_start": period_start,
                    "current_period_end": period_end,
                    "price": {
                        "unit_amount": 1000,
                        "currency": "usd",
                        "recurring": {"interval": "month", "interval_count": 1},
                    },
                }],
            },
        }),
    )

    rows = await export.build_export(
        customer_map_path=customer_map,
        adhoc_product_id="prod_destination_max",
        now=now,
    )

    assert len(rows) == 1
    row = rows[0]
    assert row.ok is True
    assert row.csv_row is not None
    assert row.csv_row["customer"] == "cus_new"
    assert row.csv_row["adhoc_items.0.amount"] == "10"
    assert row.csv_row["adhoc_items.0.product"] == "prod_destination_max"
    assert row.csv_row["billing_cycle_anchor"] == str(period_end)
    assert row.csv_row["backdate_start_date"] == str(period_start)
    assert row.csv_row["proration_behavior"] == "none"
    assert row.csv_row["metadata_source"] == "internal:Stripe"
    assert row.csv_row["metadata_old_Stripe_sub_id"] == "sub_old"
    assert row.csv_row["metadata_user_id"] == "user-1"


@pytest.mark.asyncio
async def test_export_requires_destination_customer_mapping(monkeypatch):
    from scripts import export_stripe_account_migration as export

    monkeypatch.setattr(export, "STRIPE_LEGACY_SECRET_KEY", "sk_legacy")
    monkeypatch.setattr(
        export,
        "_list_local_users",
        AsyncMock(return_value=[{
            "user_id": "user-1",
            "plan": "max",
            "status": "active",
            "stripe_customer_id": "cus_old",
            "stripe_subscription_id": "sub_old",
        }]),
    )
    retrieve = AsyncMock()
    monkeypatch.setattr(export, "_retrieve_source_subscription", retrieve)

    rows = await export.build_export(
        customer_map_path=None,
        adhoc_product_id="prod_destination_max",
        now=datetime(2026, 6, 18, tzinfo=timezone.utc),
    )

    assert rows[0].ok is False
    assert rows[0].error == "Missing destination customer mapping"
    retrieve.assert_not_awaited()


@pytest.mark.asyncio
async def test_export_skips_rows_already_marked_destination(monkeypatch):
    from scripts import export_stripe_account_migration as export

    monkeypatch.setattr(export, "STRIPE_LEGACY_SECRET_KEY", "sk_legacy")
    monkeypatch.setattr(
        export,
        "_list_local_users",
        AsyncMock(return_value=[{
            "user_id": "user-1",
            "plan": "max",
            "status": "active",
            "stripe_customer_id": "cus_new",
            "stripe_subscription_id": "sub_new",
            "stripe_migration_state": "already_destination",
        }]),
    )
    retrieve = AsyncMock()
    monkeypatch.setattr(export, "_retrieve_source_subscription", retrieve)

    rows = await export.build_export(
        customer_map_path=None,
        adhoc_product_id="prod_destination_max",
        now=datetime(2026, 6, 18, tzinfo=timezone.utc),
    )

    assert rows[0].ok is False
    assert rows[0].error == "Local row already belongs to the destination Stripe account"
    retrieve.assert_not_awaited()


@pytest.mark.asyncio
async def test_export_uses_plan_specific_destination_product(monkeypatch, tmp_path):
    from scripts import export_stripe_account_migration as export

    now = datetime(2026, 6, 18, tzinfo=timezone.utc)
    period_start = int((now - timedelta(days=1)).timestamp())
    period_end = int((now + timedelta(days=30)).timestamp())
    customer_map = tmp_path / "customer-map.csv"
    customer_map.write_text(
        "old_stripe_customer_id,new_stripe_customer_id\ncus_old,cus_new\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(export, "STRIPE_MIGRATION_SOURCE_SECRET_KEY", "sk_live_source")
    monkeypatch.setattr(
        export,
        "_list_local_users",
        AsyncMock(return_value=[{
            "user_id": "user-1",
            "email": "user@example.com",
            "plan": "pro",
            "status": "active",
            "stripe_customer_id": "cus_old",
            "stripe_subscription_id": "sub_old",
        }]),
    )
    monkeypatch.setattr(
        export,
        "_retrieve_source_subscription",
        AsyncMock(return_value={
            "id": "sub_old",
            "customer": "cus_old",
            "status": "active",
            "items": {
                "data": [{
                    "quantity": 1,
                    "current_period_start": period_start,
                    "current_period_end": period_end,
                    "price": {
                        "unit_amount": 1000,
                        "currency": "usd",
                        "recurring": {"interval": "month", "interval_count": 1},
                    },
                }],
            },
        }),
    )

    rows = await export.build_export(
        customer_map_path=customer_map,
        adhoc_product_id="prod_destination_max",
        adhoc_product_ids={"pro": "prod_destination_pro", "max": "prod_destination_max"},
        now=now,
    )

    assert rows[0].ok is True
    assert rows[0].csv_row["adhoc_items.0.product"] == "prod_destination_pro"


def test_reconcile_mapping_accepts_stripe_dashboard_export_headers(tmp_path):
    from scripts import reconcile_stripe_account_migration as reconcile

    mapping = tmp_path / "new-subscriptions.csv"
    mapping.write_text(
        "id,metadata_old_Stripe_sub_id,metadata_user_id,billing_amount_cents\n"
        "sub_new,sub_old,user-1,1000\n",
        encoding="utf-8",
    )

    rows = reconcile._read_mapping(mapping)

    assert len(rows) == 1
    assert rows[0].old_subscription_id == "sub_old"
    assert rows[0].new_subscription_id == "sub_new"
    assert rows[0].user_id == "user-1"
    assert rows[0].expected_amount_cents == 1000


def test_reconcile_mapping_accepts_schedule_headers(tmp_path):
    from scripts import reconcile_stripe_account_migration as reconcile

    mapping = tmp_path / "scheduled-subscriptions.csv"
    mapping.write_text(
        "schedule_id,old_stripe_subscription_id,new_stripe_subscription_id,user_id\n"
        "sub_sched_new,sub_old,sub_new,user-1\n",
        encoding="utf-8",
    )

    rows = reconcile._read_mapping(mapping)

    assert len(rows) == 1
    assert rows[0].schedule_id == "sub_sched_new"
    assert rows[0].old_subscription_id == "sub_old"
    assert rows[0].new_subscription_id == "sub_new"


@pytest.mark.asyncio
async def test_reconcile_discovers_mapping_from_destination_metadata(monkeypatch):
    from scripts import reconcile_stripe_account_migration as reconcile

    def fake_list(*args, **kwargs):
        return {
            "data": [{
                "id": "sub_new",
                "status": "active",
                "created": 1780000000,
                "metadata": {
                    "old_Stripe_sub_id": "sub_old",
                    "user_id": "user-1",
                },
                "items": {
                    "data": [{
                        "price": {"unit_amount": 2000},
                    }],
                },
            }],
        }

    monkeypatch.setattr(reconcile.stripe.Subscription, "list", fake_list)
    monkeypatch.setattr(reconcile, "_destination_api_key", lambda: "sk_live_dest")

    rows = await reconcile.discover_mapping()

    assert len(rows) == 1
    assert rows[0].old_subscription_id == "sub_old"
    assert rows[0].new_subscription_id == "sub_new"
    assert rows[0].user_id == "user-1"
    assert rows[0].expected_amount_cents == 2000


@pytest.mark.asyncio
async def test_reconcile_discovers_mapping_across_pages(monkeypatch):
    from scripts import reconcile_stripe_account_migration as reconcile

    calls = []

    def fake_list(*args, **kwargs):
        calls.append(kwargs)
        if not kwargs.get("starting_after"):
            return {
                "has_more": True,
                "data": [
                    {"id": "sub_existing_%s" % index, "metadata": {}}
                    for index in range(100)
                ],
            }
        return {
            "has_more": False,
            "data": [{
                "id": "sub_new",
                "status": "active",
                "created": 1780000000,
                "metadata": {"old_Stripe_sub_id": "sub_old"},
                "items": {"data": [{"price": {"unit_amount": 2000}}]},
            }],
        }

    monkeypatch.setattr(reconcile.stripe.Subscription, "list", fake_list)
    monkeypatch.setattr(reconcile, "_destination_api_key", lambda: "sk_live_dest")

    rows = await reconcile.discover_mapping(limit=150)

    assert len(rows) == 1
    assert rows[0].old_subscription_id == "sub_old"
    assert calls[0]["limit"] == 100
    assert calls[1]["limit"] == 50
    assert calls[1]["starting_after"] == "sub_existing_99"


@pytest.mark.asyncio
async def test_reconcile_discovers_scheduled_toolkit_import(monkeypatch):
    from scripts import reconcile_stripe_account_migration as reconcile

    def fake_list(*args, **kwargs):
        return {
            "data": [{
                "id": "sub_sched_new",
                "status": "not_started",
                "created": 1780000000,
                "subscription": None,
                "released_subscription": None,
                "metadata": {"source": "internal:Stripe"},
                "phases": [{
                    "start_date": 1780100000,
                    "metadata": {
                        "old_Stripe_sub_id": "sub_old",
                        "user_id": "user-1",
                    },
                    "items": [{
                        "price": {"unit_amount": 2000},
                    }],
                }],
            }],
        }

    monkeypatch.setattr(reconcile.stripe.SubscriptionSchedule, "list", fake_list)
    monkeypatch.setattr(reconcile, "_destination_api_key", lambda: "sk_live_dest")

    rows = await reconcile.discover_schedules()

    assert len(rows) == 1
    assert rows[0].old_subscription_id == "sub_old"
    assert rows[0].schedule_id == "sub_sched_new"
    assert rows[0].new_subscription_id is None
    assert rows[0].user_id == "user-1"
    assert rows[0].expected_amount_cents == 2000
    assert rows[0].start_date == 1780100000


@pytest.mark.asyncio
async def test_reconcile_discovers_schedules_across_pages(monkeypatch):
    from scripts import reconcile_stripe_account_migration as reconcile

    calls = []

    def fake_list(*args, **kwargs):
        calls.append(kwargs)
        if not kwargs.get("starting_after"):
            return {
                "has_more": True,
                "data": [
                    {"id": "sub_sched_existing_%s" % index, "metadata": {}}
                    for index in range(100)
                ],
            }
        return {
            "has_more": False,
            "data": [{
                "id": "sub_sched_new",
                "status": "not_started",
                "created": 1780000000,
                "phases": [{
                    "metadata": {"old_Stripe_sub_id": "sub_old"},
                    "items": [{"price": {"unit_amount": 2000}}],
                }],
            }],
        }

    monkeypatch.setattr(reconcile.stripe.SubscriptionSchedule, "list", fake_list)
    monkeypatch.setattr(reconcile, "_destination_api_key", lambda: "sk_live_dest")

    rows = await reconcile.discover_schedules(limit=150)

    assert len(rows) == 1
    assert rows[0].old_subscription_id == "sub_old"
    assert calls[0]["limit"] == 100
    assert calls[1]["limit"] == 50
    assert calls[1]["starting_after"] == "sub_sched_existing_99"


@pytest.mark.asyncio
async def test_reconcile_discovers_active_schedule_subscription_id(monkeypatch):
    from scripts import reconcile_stripe_account_migration as reconcile

    def fake_list(*args, **kwargs):
        return {
            "data": [{
                "id": "sub_sched_new",
                "status": "active",
                "created": 1780000000,
                "subscription": {"id": "sub_new"},
                "metadata": {
                    "old_Stripe_sub_id": "sub_old",
                    "user_id": "user-1",
                },
                "phases": [{"items": [{"price": "price_unexpanded"}]}],
            }],
        }

    monkeypatch.setattr(reconcile.stripe.SubscriptionSchedule, "list", fake_list)
    monkeypatch.setattr(reconcile, "_destination_api_key", lambda: "sk_live_dest")

    rows = await reconcile.discover_schedules()

    assert len(rows) == 1
    assert rows[0].new_subscription_id == "sub_new"
    assert rows[0].expected_amount_cents is None


@pytest.mark.asyncio
async def test_reconcile_can_schedule_source_cancel_after_apply(monkeypatch, tmp_path):
    from scripts import reconcile_stripe_account_migration as reconcile

    mapping = tmp_path / "mapping.csv"
    mapping.write_text(
        "old_stripe_subscription_id,new_stripe_subscription_id,user_id\n"
        "sub_old,sub_new,user-1\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        reconcile,
        "_list_local_users",
        AsyncMock(return_value=[{
            "user_id": "user-1",
            "stripe_customer_id": "cus_old",
            "stripe_subscription_id": "sub_old",
        }]),
    )
    monkeypatch.setattr(
        reconcile,
        "_retrieve_new_subscription",
        AsyncMock(return_value={
            "id": "sub_new",
            "customer": "cus_new",
            "status": "active",
            "metadata": {"old_Stripe_sub_id": "sub_old", "user_id": "user-1"},
            "items": {"data": [{"price": {"unit_amount": 2000}}]},
        }),
    )
    sync = AsyncMock(return_value={"synced": True})
    cancel = AsyncMock(return_value=True)
    monkeypatch.setattr(reconcile, "sync_subscription_from_stripe", sync)
    monkeypatch.setattr(reconcile, "_schedule_source_cancel_at_period_end", cancel)

    results = await reconcile.reconcile(
        mapping,
        apply=True,
        cancel_source_at_period_end=True,
    )

    assert results[0].ok is True
    assert results[0].action == "applied"
    assert results[0].source_cancel_scheduled is True
    sync.assert_awaited_once()
    cancel.assert_awaited_once_with("sub_old", source_account="legacy")


@pytest.mark.asyncio
async def test_reconcile_strict_metadata_accepts_schedule_mapping(monkeypatch, tmp_path):
    from scripts import reconcile_stripe_account_migration as reconcile

    mapping = tmp_path / "schedule-mapping.csv"
    mapping.write_text(
        "schedule_id,old_stripe_subscription_id,new_stripe_subscription_id,user_id,expected_amount_cents\n"
        "sub_sched_new,sub_old,sub_new,user-1,2000\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        reconcile,
        "_list_local_users",
        AsyncMock(return_value=[{
            "user_id": "user-1",
            "stripe_customer_id": "cus_old",
            "stripe_subscription_id": "sub_old",
        }]),
    )
    monkeypatch.setattr(
        reconcile,
        "_retrieve_new_subscription",
        AsyncMock(return_value={
            "id": "sub_new",
            "customer": "cus_new",
            "status": "active",
            "metadata": {},
            "items": {"data": [{"price": {"unit_amount": 2000}}]},
        }),
    )
    monkeypatch.setattr(
        reconcile,
        "_retrieve_schedule",
        AsyncMock(return_value={
            "id": "sub_sched_new",
            "subscription": {"id": "sub_new"},
            "metadata": {"old_Stripe_sub_id": "sub_old", "user_id": "user-1"},
            "phases": [],
        }),
    )

    results = await reconcile.reconcile(mapping, strict_metadata=True)

    assert results[0].ok is True
    assert results[0].metadata_old_subscription_id == "sub_old"
    assert results[0].metadata_user_id == "user-1"


@pytest.mark.asyncio
async def test_reconcile_strict_metadata_reports_verified_schedule_metadata(monkeypatch, tmp_path):
    from scripts import reconcile_stripe_account_migration as reconcile

    mapping = tmp_path / "schedule-mapping.csv"
    mapping.write_text(
        "schedule_id,old_stripe_subscription_id,new_stripe_subscription_id,user_id,expected_amount_cents\n"
        "sub_sched_new,sub_old,sub_new,user-1,2000\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        reconcile,
        "_list_local_users",
        AsyncMock(return_value=[{
            "user_id": "user-1",
            "stripe_customer_id": "cus_old",
            "stripe_subscription_id": "sub_old",
        }]),
    )
    monkeypatch.setattr(
        reconcile,
        "_retrieve_new_subscription",
        AsyncMock(return_value={
            "id": "sub_new",
            "customer": "cus_new",
            "status": "active",
            "metadata": {"old_Stripe_sub_id": "sub_wrong", "user_id": "user-wrong"},
            "items": {"data": [{"price": {"unit_amount": 2000}}]},
        }),
    )
    monkeypatch.setattr(
        reconcile,
        "_retrieve_schedule",
        AsyncMock(return_value={
            "id": "sub_sched_new",
            "subscription": {"id": "sub_new"},
            "metadata": {"old_Stripe_sub_id": "sub_old", "user_id": "user-1"},
            "phases": [],
        }),
    )

    results = await reconcile.reconcile(mapping, strict_metadata=True)

    assert results[0].ok is True
    assert results[0].metadata_old_subscription_id == "sub_old"
    assert results[0].metadata_user_id == "user-1"


@pytest.mark.asyncio
async def test_reconcile_strict_metadata_rejects_wrong_schedule_subscription(monkeypatch, tmp_path):
    from scripts import reconcile_stripe_account_migration as reconcile

    mapping = tmp_path / "schedule-mapping.csv"
    mapping.write_text(
        "schedule_id,old_stripe_subscription_id,new_stripe_subscription_id,user_id\n"
        "sub_sched_new,sub_old,sub_new,user-1\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        reconcile,
        "_list_local_users",
        AsyncMock(return_value=[{
            "user_id": "user-1",
            "stripe_customer_id": "cus_old",
            "stripe_subscription_id": "sub_old",
        }]),
    )
    monkeypatch.setattr(
        reconcile,
        "_retrieve_new_subscription",
        AsyncMock(return_value={
            "id": "sub_new",
            "customer": "cus_new",
            "status": "active",
            "metadata": {},
            "items": {"data": [{"price": {"unit_amount": 2000}}]},
        }),
    )
    monkeypatch.setattr(
        reconcile,
        "_retrieve_schedule",
        AsyncMock(return_value={
            "id": "sub_sched_new",
            "subscription": {"id": "sub_other"},
            "metadata": {"old_Stripe_sub_id": "sub_old", "user_id": "user-1"},
            "phases": [],
        }),
    )

    results = await reconcile.reconcile(mapping, strict_metadata=True)

    assert results[0].ok is False
    assert results[0].error == "New subscription metadata does not match old subscription id"


@pytest.mark.asyncio
async def test_export_resolves_destination_product_from_max_price(monkeypatch):
    from scripts import export_stripe_account_migration as export

    monkeypatch.setattr(export, "STRIPE_SECRET_KEY", "sk_primary")
    monkeypatch.setattr(export, "STRIPE_MIGRATION_DESTINATION_SECRET_KEY", "")
    monkeypatch.setattr(export, "STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID", "")
    monkeypatch.setattr(export, "STRIPE_MAX_PRICE_ID", "price_max")
    captured = {}

    def fake_retrieve(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return {"id": "price_max", "product": {"id": "prod_max"}}

    monkeypatch.setattr(
        export.stripe.Price,
        "retrieve",
        fake_retrieve,
    )

    product_id = await export.resolve_destination_product_id()

    assert product_id == "prod_max"
    assert captured["args"][0] == "price_max"
    assert captured["kwargs"]["api_key"] == "sk_primary"


@pytest.mark.asyncio
async def test_export_prefers_migration_destination_price_and_key(monkeypatch):
    from scripts import export_stripe_account_migration as export

    monkeypatch.setattr(export, "STRIPE_SECRET_KEY", "sk_test_runtime")
    monkeypatch.setattr(export, "STRIPE_MAX_PRICE_ID", "price_runtime")
    monkeypatch.setattr(export, "STRIPE_MIGRATION_DESTINATION_SECRET_KEY", "sk_live_dest")
    monkeypatch.setattr(export, "STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID", "price_live_max")
    captured = {}

    def fake_retrieve(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return {"id": "price_live_max", "product": {"id": "prod_live_max"}}

    monkeypatch.setattr(export.stripe.Price, "retrieve", fake_retrieve)

    product_id = await export.resolve_destination_product_id()

    assert product_id == "prod_live_max"
    assert captured["args"][0] == "price_live_max"
    assert captured["kwargs"]["api_key"] == "sk_live_dest"


def test_validate_migration_key_modes_rejects_test_destination(monkeypatch):
    from scripts import export_stripe_account_migration as export

    monkeypatch.setattr(export, "STRIPE_MIGRATION_SOURCE_SECRET_KEY", "sk_live_source")
    monkeypatch.setattr(export, "STRIPE_LEGACY_SECRET_KEY", "")
    monkeypatch.setattr(export, "STRIPE_MIGRATION_DESTINATION_SECRET_KEY", "sk_test_dest")
    monkeypatch.setattr(export, "STRIPE_SECRET_KEY", "")

    with pytest.raises(RuntimeError, match="requires live source and destination"):
        export.validate_migration_key_modes(source_account="legacy")


def test_validate_migration_key_modes_accepts_live_migration_keys(monkeypatch):
    from scripts import export_stripe_account_migration as export

    monkeypatch.setattr(export, "STRIPE_MIGRATION_SOURCE_SECRET_KEY", "sk_live_source")
    monkeypatch.setattr(export, "STRIPE_LEGACY_SECRET_KEY", "")
    monkeypatch.setattr(export, "STRIPE_MIGRATION_DESTINATION_SECRET_KEY", "sk_live_dest")
    monkeypatch.setattr(export, "STRIPE_SECRET_KEY", "")

    export.validate_migration_key_modes(source_account="legacy")


@pytest.mark.asyncio
async def test_preflight_passes_with_customer_map_and_source_sample(monkeypatch, tmp_path):
    from scripts import preflight_stripe_account_migration as preflight

    now = datetime.now(timezone.utc)
    period_end = int((now + timedelta(days=30)).timestamp())
    customer_map = tmp_path / "customer-map.csv"
    customer_map.write_text(
        "old_stripe_customer_id,new_stripe_customer_id\ncus_old,cus_new\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(preflight, "_destination_api_key", lambda: "sk_primary")
    monkeypatch.setattr(preflight, "INSFORGE_BASE_URL", "https://example.insforge.app")
    monkeypatch.setattr(preflight, "_source_api_key", lambda source_account: "sk_legacy")
    local_rows = [{
        "user_id": "user-1",
        "email": "user@example.com",
        "plan": "max",
        "status": "active",
        "stripe_customer_id": "cus_old",
        "stripe_subscription_id": "sub_old",
        "stripe_account_ref": "legacy_2026",
        "legacy_stripe_customer_id": None,
        "legacy_stripe_subscription_id": None,
        "stripe_migration_state": None,
        "stripe_migrated_at": None,
        "stripe_price_id": "price_old",
        "billing_amount_cents": 1000,
        "billing_currency": "usd",
        "billing_interval": "month",
        "billing_interval_count": 1,
    }]
    monkeypatch.setattr(
        preflight,
        "_list_local_users",
        AsyncMock(return_value=local_rows),
    )
    monkeypatch.setattr(
        preflight,
        "_verify_destination_product",
        AsyncMock(return_value=(True, {"id": "prod_destination_max", "active": True})),
    )
    monkeypatch.setattr(
        preflight,
        "_verify_destination_customers_payment_ready",
        AsyncMock(return_value={
            "checked": 1,
            "ready": 1,
            "missing_default_count": 0,
            "missing_default_sample": [],
            "lookup_error_count": 0,
            "lookup_error_sample": [],
        }),
    )
    monkeypatch.setattr(
        preflight,
        "_retrieve_source_subscription",
        AsyncMock(return_value={
            "id": "sub_old",
            "customer": "cus_old",
            "status": "active",
            "items": {
                "data": [{
                    "current_period_end": period_end,
                }],
            },
        }),
    )
    monkeypatch.setattr(
        preflight,
        "_classify_candidate_accounts",
        AsyncMock(return_value={
            "source_active": local_rows,
            "already_destination": [],
            "source_inactive": [],
            "unknown": [],
            "lookup_errors": [],
        }),
    )

    report = await preflight.run_preflight(
        customer_map_path=customer_map,
        adhoc_product_id="prod_destination_max",
    )

    assert report.ok is True
    assert report.summary["candidate_rows"] == 1
    assert all(check.ok for check in report.checks if check.severity == "error")


@pytest.mark.asyncio
async def test_preflight_reports_missing_customer_map(monkeypatch):
    from scripts import preflight_stripe_account_migration as preflight

    monkeypatch.setattr(preflight, "_destination_api_key", lambda: "sk_primary")
    monkeypatch.setattr(preflight, "INSFORGE_BASE_URL", "https://example.insforge.app")
    monkeypatch.setattr(preflight, "_source_api_key", lambda source_account: "sk_legacy")
    local_rows = [{
        "user_id": "user-1",
        "status": "active",
        "stripe_customer_id": "cus_old",
        "stripe_subscription_id": "sub_old",
        "stripe_account_ref": "legacy_2026",
        "legacy_stripe_customer_id": None,
        "legacy_stripe_subscription_id": None,
        "stripe_migration_state": None,
        "stripe_migrated_at": None,
        "stripe_price_id": "price_old",
        "billing_amount_cents": 1000,
        "billing_currency": "usd",
        "billing_interval": "month",
        "billing_interval_count": 1,
    }]
    monkeypatch.setattr(
        preflight,
        "_list_local_users",
        AsyncMock(return_value=local_rows),
    )
    monkeypatch.setattr(
        preflight,
        "_classify_candidate_accounts",
        AsyncMock(return_value={
            "source_active": local_rows,
            "already_destination": [],
            "source_inactive": [],
            "unknown": [],
            "lookup_errors": [],
        }),
    )
    monkeypatch.setattr(
        preflight,
        "_verify_destination_product",
        AsyncMock(return_value=(True, {"id": "prod_destination_max", "active": True})),
    )
    monkeypatch.setattr(preflight, "_retrieve_source_subscription", AsyncMock())

    report = await preflight.run_preflight(
        customer_map_path=None,
        adhoc_product_id="prod_destination_max",
        sample_limit=0,
    )

    customer_check = next(check for check in report.checks if check.name == "customer_mapping")
    assert report.ok is False
    assert customer_check.ok is False
    assert customer_check.data["missing_customer_count"] == 1


@pytest.mark.asyncio
async def test_preflight_reports_destination_customer_missing_default_payment_method(monkeypatch, tmp_path):
    from scripts import preflight_stripe_account_migration as preflight

    customer_map = tmp_path / "customer-map.csv"
    customer_map.write_text(
        "old_stripe_customer_id,new_stripe_customer_id\ncus_old,cus_new\n",
        encoding="utf-8",
    )
    local_rows = [{
        "user_id": "user-1",
        "status": "active",
        "stripe_customer_id": "cus_old",
        "stripe_subscription_id": "sub_old",
        "stripe_account_ref": "legacy_2026",
        "legacy_stripe_customer_id": None,
        "legacy_stripe_subscription_id": None,
        "stripe_migration_state": None,
        "stripe_migrated_at": None,
        "stripe_price_id": "price_old",
        "billing_amount_cents": 1000,
        "billing_currency": "usd",
        "billing_interval": "month",
        "billing_interval_count": 1,
    }]

    monkeypatch.setattr(preflight, "_destination_api_key", lambda: "sk_primary")
    monkeypatch.setattr(preflight, "INSFORGE_BASE_URL", "https://example.insforge.app")
    monkeypatch.setattr(preflight, "_source_api_key", lambda source_account: "sk_legacy")
    monkeypatch.setattr(preflight, "_list_local_users", AsyncMock(return_value=local_rows))
    monkeypatch.setattr(
        preflight,
        "_classify_candidate_accounts",
        AsyncMock(return_value={
            "source_active": local_rows,
            "already_destination": [],
            "source_cancel_at_period_end": [],
            "source_inactive": [],
            "unknown": [],
            "lookup_errors": [],
        }),
    )
    monkeypatch.setattr(
        preflight,
        "_verify_destination_product",
        AsyncMock(return_value=(True, {"id": "prod_destination_max", "active": True})),
    )
    monkeypatch.setattr(
        preflight,
        "_retrieve_destination_customer",
        AsyncMock(return_value={
            "id": "cus_new",
            "invoice_settings": {"default_payment_method": None},
            "default_source": None,
        }),
    )

    report = await preflight.run_preflight(
        customer_map_path=customer_map,
        adhoc_product_id="prod_destination_max",
        sample_limit=0,
    )

    payment_check = next(
        check for check in report.checks if check.name == "destination_customer_payment_methods"
    )
    assert report.ok is False
    assert payment_check.ok is False
    assert payment_check.data["checked"] == 1
    assert payment_check.data["missing_default_count"] == 1
