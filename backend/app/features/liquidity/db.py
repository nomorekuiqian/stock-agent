"""
Liquidity database operations using Insforge Edge Functions.

Provides save and retrieve operations for liquidity analysis data.
"""

import traceback
from typing import Optional, Dict, Any

import httpx

from app.core.database import get_insforge_service
from app.utils.timezone import now_iso


async def save_liquidity_analysis(analysis_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a liquidity analysis to the database.

    Args:
        analysis_data: Dictionary containing analysis data

    Returns:
        dict with success status and saved analysis ID
    """
    try:
        service = get_insforge_service()
        liquidity_url = f"{service.base_url}/functions/liquidity-analysis"

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
                headers=service.headers,
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
        traceback.print_exc()
        return {"success": False, "error": str(e)}


async def get_latest_liquidity_analysis() -> Optional[Dict[str, Any]]:
    """
    Get the latest liquidity analysis from the database.

    Returns:
        Analysis data or None if not found
    """
    try:
        service = get_insforge_service()
        liquidity_url = f"{service.base_url}/functions/liquidity-analysis"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{liquidity_url}?latest=true",
                headers=service.headers,
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
