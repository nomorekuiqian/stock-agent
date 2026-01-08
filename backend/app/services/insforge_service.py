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

    async def list_rednote_posts(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        List all RedNote posts from the database, ordered by date descending.

        Args:
            limit: Maximum number of posts to return (default 20)

        Returns:
            List of RedNote posts with id, report_date, and content.cover_title
        """
        try:
            rednote_url = f"{self.base_url}/functions/rednote-posts"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{rednote_url}?list=true&limit={limit}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data", [])
                return []

        except Exception as e:
            print(f"[InsforgeService] Exception listing RedNote posts: {e}")
            return []

    async def get_rednote_by_id(self, post_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a RedNote post by its ID.

        Args:
            post_id: The UUID of the post

        Returns:
            RedNote post data or None if not found
        """
        try:
            rednote_url = f"{self.base_url}/functions/rednote-posts"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{rednote_url}?id={post_id}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            print(f"[InsforgeService] Exception getting RedNote post by ID: {e}")
            return None


    # =========================================================================
    # User Digest Methods (PersonalDigest)
    # =========================================================================

    async def save_user_digest(self, digest_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save a personal digest to the database (always creates new record).

        Args:
            digest_data: Dictionary containing digest data including user_id

        Returns:
            dict with success status and saved digest ID
        """
        try:
            digest_url = f"{self.base_url}/functions/user-digests"

            # Get summary content for legacy fields
            summary_data = digest_data.get("summary", {})
            summary_content = summary_data.get("content", "") if isinstance(summary_data, dict) else ""

            db_digest = {
                "user_id": digest_data.get("user_id"),
                "digest_date": digest_data.get("digest_date", today_str()),
                "symbols": digest_data.get("symbols", []),
                # Header fields
                "greeting": digest_data.get("greeting", ""),
                "one_line_summary": digest_data.get("one_line_summary", ""),
                "bottom_line": summary_content,
                # Legacy field
                "analysis": summary_content,
                # Full structured data
                "digest_data": {
                    "stocks": digest_data.get("stocks", []),
                    "news": digest_data.get("news", {}),
                    "events": digest_data.get("events", []),
                    "summary": digest_data.get("summary", {}),
                },
            }

            print(f"[InsforgeService] Saving user digest for user: {db_digest.get('user_id')}, date: {db_digest.get('digest_date')}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{digest_url}?action=insert",
                    headers=self.headers,
                    json=db_digest,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        digest_id = data.get("data", {}).get("id")
                        action = data.get("action", "saved")
                        print(f"[InsforgeService] User digest {action}, ID: {digest_id}")
                        return {
                            "success": True,
                            "digest_id": digest_id,
                            "action": action,
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
            print(f"[InsforgeService] Exception saving user digest: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def get_user_digest(self, user_id: str, digest_date: str) -> Optional[Dict[str, Any]]:
        """
        Get a user digest by user_id and date.

        Args:
            user_id: User UUID
            digest_date: Date in YYYY-MM-DD format

        Returns:
            Digest data or None if not found
        """
        try:
            digest_url = f"{self.base_url}/functions/user-digests"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{digest_url}?user_id={user_id}&date={digest_date}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            print(f"[InsforgeService] Exception getting user digest: {e}")
            return None

    async def list_user_digests(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        List digests for a user.

        Args:
            user_id: User UUID
            limit: Maximum number of digests to return

        Returns:
            List of digest summaries
        """
        try:
            digest_url = f"{self.base_url}/functions/user-digests"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{digest_url}?user_id={user_id}&limit={limit}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data", [])
                return []

        except Exception as e:
            print(f"[InsforgeService] Exception listing user digests: {e}")
            return []

    # =========================================================================
    # Email Feedback Methods
    # =========================================================================

    async def save_email_feedback(
        self,
        report_date: str,
        email: str,
        rating: str,
        report_id: str = None,
    ) -> Dict[str, Any]:
        """
        Save email feedback to the database.

        Args:
            report_date: Date in YYYY-MM-DD format
            email: User email
            rating: One of 'satisfied', 'neutral', 'dissatisfied'
            report_id: Optional report UUID

        Returns:
            dict with success status and feedback data
        """
        try:
            feedback_url = f"{self.base_url}/functions/email-feedback"

            db_feedback = {
                "report_date": report_date,
                "email": email,
                "rating": rating,
            }
            if report_id:
                db_feedback["report_id"] = report_id

            print(f"[InsforgeService] Saving email feedback: {email} -> {rating} for {report_date}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{feedback_url}?action=upsert",
                    headers=self.headers,
                    json=db_feedback,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        is_duplicate = data.get("isDuplicate", False)
                        print(f"[InsforgeService] Feedback saved (duplicate: {is_duplicate})")
                        return {
                            "success": True,
                            "is_duplicate": is_duplicate,
                            "data": data.get("data"),
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        print(f"[InsforgeService] Feedback save failed: {error_msg}")
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    print(f"[InsforgeService] Feedback save failed: {response.status_code} - {error_msg}")
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            print(f"[InsforgeService] Exception saving email feedback: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def get_feedback_stats(
        self,
        start_date: str,
        end_date: str,
    ) -> Dict[str, Any]:
        """
        Get feedback statistics for a date range.

        Args:
            start_date: Start date in YYYY-MM-DD format
            end_date: End date in YYYY-MM-DD format

        Returns:
            dict with statistics data
        """
        try:
            feedback_url = f"{self.base_url}/functions/email-feedback"

            print(f"[InsforgeService] Getting feedback stats: {start_date} to {end_date}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{feedback_url}?action=stats",
                    headers=self.headers,
                    json={
                        "start_date": start_date,
                        "end_date": end_date,
                    },
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return {
                            "success": True,
                            "period": data.get("period"),
                            "total": data.get("total", 0),
                            "breakdown": data.get("breakdown", {}),
                            "satisfaction_rate": data.get("satisfaction_rate", 0),
                            "daily": data.get("daily", []),
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            print(f"[InsforgeService] Exception getting feedback stats: {e}")
            return {"success": False, "error": str(e)}


# Singleton instance
_insforge_service: Optional[InsforgeService] = None


def get_insforge_service() -> InsforgeService:
    """Get or create the Insforge service singleton."""
    global _insforge_service
    if _insforge_service is None:
        _insforge_service = InsforgeService()
    return _insforge_service
