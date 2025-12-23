"""
Insforge Service for saving market reports to the database.
Uses Insforge Edge Functions API to interact with the database.
"""

import os
import json
from typing import Optional, Dict, Any, List
import httpx

from app.utils.timezone import today_str, now_iso

# Insforge configuration
INSFORGE_BASE_URL = os.getenv(
    "INSFORGE_BASE_URL", "https://9wmhxyi4.us-east.insforge.app"
)


class InsforgeService:
    """Service for interacting with Insforge database via Edge Functions."""

    def __init__(self):
        self.base_url = INSFORGE_BASE_URL
        self.function_url = f"{self.base_url}/functions/market-reports"
        self.headers = {
            "Content-Type": "application/json",
        }

    async def save_market_report(self, report_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save a market report to the database via Edge Function.

        Args:
            report_data: Dictionary containing report data

        Returns:
            dict with success status and saved report data or error
        """
        try:
            report_date = today_str()  # Pacific timezone

            # Prepare the report for database insertion
            db_report = {
                "report_date": report_date,
                "timestamp": report_data.get("timestamp", now_iso()),
                # New structured fields
                "title": report_data.get("title", ""),
                "summary": report_data.get("summary", ""),
                "quick_take": report_data.get("quick_take", ""),
                "market_narrative": report_data.get("market_narrative", ""),
                "macro": report_data.get("macro"),
                "news": report_data.get("news"),
                "conclusion": report_data.get("conclusion", ""),
                "calendar": report_data.get("calendar", []),
                # Legacy fields for backward compatibility
                "short_analysis": report_data.get("short_analysis", ""),
                "in_depth_analysis": report_data.get("in_depth_analysis", ""),
                # Raw data
                "indices": report_data.get("indices", []),
                "economic_calendar": report_data.get("economic_calendar", {}),
                "earnings_calendar": report_data.get("earnings_calendar", {}),
                "news_data": report_data.get("news_data", {}),
                "market_data": report_data.get("market_data", {}),
            }

            print(f"[InsforgeService] Saving report for date: {report_date}")

            async with httpx.AsyncClient() as client:
                # Use upsert to avoid duplicates for same date
                response = await client.post(
                    f"{self.function_url}?action=upsert",
                    headers=self.headers,
                    json=db_report,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        report_id = data.get("data", {}).get("id")
                        print(f"[InsforgeService] Report saved successfully, ID: {report_id}")
                        return {
                            "success": True,
                            "report_id": report_id,
                            "report_date": report_date,
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        print(f"[InsforgeService] Save failed: {error_msg}")
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    print(f"[InsforgeService] Save failed: {response.status_code} - {error_msg}")
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            print(f"[InsforgeService] Exception saving report: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def get_latest_report(self) -> Optional[Dict[str, Any]]:
        """
        Get the latest market report from the database.

        Returns:
            Report data or None if not found
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.function_url}?latest=true",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            print(f"[InsforgeService] Exception getting latest report: {e}")
            return None

    async def get_report_by_id(self, report_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a market report by ID via Edge Function.

        Args:
            report_id: UUID of the report

        Returns:
            Report data or None if not found
        """
        try:
            url = f"{self.function_url}?id={report_id}"
            print(f"[InsforgeService] get_report_by_id: {report_id}")

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers=self.headers,
                    timeout=30.0,
                )

                print(f"[InsforgeService] Response status: {response.status_code}")

                if response.status_code == 200:
                    result = response.json()
                    if result.get("success") and result.get("data"):
                        report = result["data"]
                        print(f"[InsforgeService] Found report: {report.get('title', 'No title')[:50]}")
                        return report
                    print(f"[InsforgeService] No report found with ID: {report_id}")
                else:
                    print(f"[InsforgeService] Error response: {response.text}")
                return None

        except Exception as e:
            print(f"[InsforgeService] Exception getting report by ID: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def get_report_by_date(self, date: str) -> Optional[Dict[str, Any]]:
        """
        Get a market report by date.

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            Report data or None if not found
        """
        try:
            url = f"{self.function_url}?date={date}"
            print(f"[InsforgeService] get_report_by_date: {date}")
            print(f"[InsforgeService] Fetching from: {url}")

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers=self.headers,
                    timeout=30.0,
                )

                print(f"[InsforgeService] Response status: {response.status_code}")

                if response.status_code == 200:
                    data = response.json()
                    print(f"[InsforgeService] Success: {data.get('success')}, Data: {data.get('data') is not None}")
                    if data.get("success"):
                        return data.get("data")
                else:
                    print(f"[InsforgeService] Error: {response.text}")
                return None

        except Exception as e:
            print(f"[InsforgeService] Exception getting report by date: {e}")
            import traceback
            traceback.print_exc()
            return None

    # =========================================================================
    # Liquidity Analysis Methods
    # =========================================================================

    async def save_liquidity_analysis(self, analysis_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save a liquidity analysis to the database.

        Args:
            analysis_data: Dictionary containing analysis data

        Returns:
            dict with success status and saved analysis ID
        """
        try:
            liquidity_url = f"{self.base_url}/functions/liquidity-analysis"

            db_analysis = {
                "analysis": analysis_data.get("analysis", ""),
                "status": analysis_data.get("status", ""),
                "metrics_snapshot": analysis_data.get("metrics_snapshot", {}),
                "generated_at": analysis_data.get("generated_at", now_iso()),
                "model": analysis_data.get("model", ""),
            }

            print(f"[InsforgeService] Saving liquidity analysis...")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{liquidity_url}?action=insert",
                    headers=self.headers,
                    json=db_analysis,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        analysis_id = data.get("data", {}).get("id")
                        print(f"[InsforgeService] Liquidity analysis saved, ID: {analysis_id}")
                        return {
                            "success": True,
                            "analysis_id": analysis_id,
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        print(f"[InsforgeService] Save failed: {error_msg}")
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    print(f"[InsforgeService] Save failed: {response.status_code} - {error_msg}")
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            print(f"[InsforgeService] Exception saving liquidity analysis: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def get_latest_liquidity_analysis(self) -> Optional[Dict[str, Any]]:
        """
        Get the latest liquidity analysis from the database.

        Returns:
            Analysis data or None if not found
        """
        try:
            liquidity_url = f"{self.base_url}/functions/liquidity-analysis"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{liquidity_url}?latest=true",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            print(f"[InsforgeService] Exception getting latest liquidity analysis: {e}")
            return None

    # =========================================================================
    # RedNote Post Methods
    # =========================================================================

    async def save_rednote_post(self, post_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save a RedNote post to the database.

        Args:
            post_data: Dictionary containing RedNote content and metadata

        Returns:
            dict with success status and saved post ID
        """
        try:
            rednote_url = f"{self.base_url}/functions/rednote-posts"

            db_post = {
                "report_id": post_data.get("report_id"),
                "report_date": post_data.get("report_date"),
                "content": post_data.get("content", {}),
                "generated_at": post_data.get("generated_at", now_iso()),
            }

            print(f"[InsforgeService] Saving RedNote post for date: {db_post.get('report_date')}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{rednote_url}?action=upsert",
                    headers=self.headers,
                    json=db_post,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        post_id = data.get("data", {}).get("id")
                        print(f"[InsforgeService] RedNote post saved, ID: {post_id}")
                        return {
                            "success": True,
                            "post_id": post_id,
                            "report_date": db_post.get("report_date"),
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        print(f"[InsforgeService] Save failed: {error_msg}")
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    print(f"[InsforgeService] Save failed: {response.status_code} - {error_msg}")
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            print(f"[InsforgeService] Exception saving RedNote post: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def get_latest_rednote(self) -> Optional[Dict[str, Any]]:
        """
        Get the latest RedNote post from the database.

        Returns:
            RedNote post data or None if not found
        """
        try:
            rednote_url = f"{self.base_url}/functions/rednote-posts"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{rednote_url}?latest=true",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            print(f"[InsforgeService] Exception getting latest RedNote post: {e}")
            return None

    async def get_rednote_by_date(self, date: str) -> Optional[Dict[str, Any]]:
        """
        Get a RedNote post by date.

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            RedNote post data or None if not found
        """
        try:
            rednote_url = f"{self.base_url}/functions/rednote-posts"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{rednote_url}?date={date}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            print(f"[InsforgeService] Exception getting RedNote post by date: {e}")
            return None


# Singleton instance
_insforge_service: Optional[InsforgeService] = None


def get_insforge_service() -> InsforgeService:
    """Get or create the Insforge service singleton."""
    global _insforge_service
    if _insforge_service is None:
        _insforge_service = InsforgeService()
    return _insforge_service
