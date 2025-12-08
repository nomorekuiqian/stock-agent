from dotenv import load_dotenv
load_dotenv()  # Load .env before importing agents

import os
from datetime import datetime
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from agents.agent import MacroAgent
from app.services.email_service import get_email_service

app = FastAPI(title="Macro Analysis API")

# Configure CORS - allow localhost and production domains
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]
# Add production frontend URL from environment
if os.getenv("FRONTEND_URL"):
    allowed_origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize macro agent
macro_agent = MacroAgent()

@app.get("/")
async def root():
    return {"message": "Macro Analysis API is running"}

@app.post("/api/macro")
async def analyze_macro():
    try:
        result = await macro_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate macro analysis")

        # Transform market_data to frontend expected format
        market_data = result.get("market_data", {})

        # Build indices array from equities + volatility
        indices = []
        for name, data in market_data.get("equities", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("volatility", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })

        # Build trends array from all assets
        trends = []
        def get_trend_label(week_change: float, month_change: float) -> str:
            avg = (week_change + month_change) / 2
            if avg > 5:
                return "Strongly Bullish"
            elif avg > 1:
                return "Bullish"
            elif avg < -5:
                return "Strongly Bearish"
            elif avg < -1:
                return "Bearish"
            return "Neutral"

        for category in ["equities", "commodities", "currencies", "financials"]:
            for name, data in market_data.get(category, {}).items():
                if isinstance(data, dict) and "value" in data:
                    trends.append({
                        "name": name,
                        "current": data.get("value", 0),
                        "week_change": data.get("week_change", 0),
                        "month_change": data.get("month_change", 0),
                        "trend": get_trend_label(data.get("week_change", 0), data.get("month_change", 0))
                    })

        # Build liquidity from rates
        rates_data = market_data.get("rates", {})
        yield_curve = rates_data.get("yield_curve", {})
        spreads = rates_data.get("spreads", {})

        liquidity = {
            "yield_curve": {
                "rates": {k: v.get("rate", 0) if isinstance(v, dict) else v for k, v in yield_curve.items()},
                "changes": {k: v.get("daily_change", 0) if isinstance(v, dict) else 0 for k, v in yield_curve.items()}
            },
            "spreads": {
                "10y_3m": spreads.get("10y_3m"),
                "10y_5y": spreads.get("10y_5y"),
                "inversion_warning": (spreads.get("10y_3m") or 0) < 0
            }
        }

        return {
            "indices": indices,
            "trends": trends,
            "liquidity": liquidity,
            "timestamp": result.get("timestamp", datetime.now().isoformat()),
            "short_analysis": result.get("short_analysis", ""),
            "in_depth_analysis": result.get("in_depth_analysis", "")
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Email Report Endpoints
# =============================================================================

CRON_SECRET = os.getenv("CRON_SECRET", "")


@app.post("/api/report/send")
async def send_daily_report(x_cron_secret: str = Header(None, alias="X-Cron-Secret")):
    """
    Generate and send daily market report via email.
    Protected by CRON_SECRET for scheduled job authentication.
    """
    # Verify cron secret if configured
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Generate the macro analysis
        result = await macro_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate macro analysis")

        # Transform to frontend format for consistent email
        market_data = result.get("market_data", {})

        indices = []
        for name, data in market_data.get("equities", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("volatility", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })

        def get_trend_label(week_change: float, month_change: float) -> str:
            avg = (week_change + month_change) / 2
            if avg > 5:
                return "Strongly Bullish"
            elif avg > 1:
                return "Bullish"
            elif avg < -5:
                return "Strongly Bearish"
            elif avg < -1:
                return "Bearish"
            return "Neutral"

        trends = []
        for category in ["equities", "commodities", "currencies", "financials"]:
            for name, data in market_data.get(category, {}).items():
                if isinstance(data, dict) and "value" in data:
                    trends.append({
                        "name": name,
                        "current": data.get("value", 0),
                        "week_change": data.get("week_change", 0),
                        "month_change": data.get("month_change", 0),
                        "trend": get_trend_label(data.get("week_change", 0), data.get("month_change", 0))
                    })

        rates_data = market_data.get("rates", {})
        yield_curve = rates_data.get("yield_curve", {})
        spreads = rates_data.get("spreads", {})

        report_data = {
            "indices": indices,
            "trends": trends,
            "liquidity": {
                "yield_curve": {
                    "rates": {k: v.get("rate", 0) if isinstance(v, dict) else v for k, v in yield_curve.items()},
                    "changes": {k: v.get("daily_change", 0) if isinstance(v, dict) else 0 for k, v in yield_curve.items()}
                },
                "spreads": {
                    "10y_3m": spreads.get("10y_3m"),
                    "10y_5y": spreads.get("10y_5y"),
                    "inversion_warning": (spreads.get("10y_3m") or 0) < 0
                }
            },
            "timestamp": result.get("timestamp", datetime.now().isoformat()),
            "short_analysis": result.get("short_analysis", ""),
            "in_depth_analysis": result.get("in_depth_analysis", "")
        }

        # Send email
        email_service = get_email_service()
        email_result = await email_service.send_daily_report(report_data)

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to send email"))

        return {
            "success": True,
            "message": "Daily report sent successfully",
            "email_id": email_result.get("email_id")
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
