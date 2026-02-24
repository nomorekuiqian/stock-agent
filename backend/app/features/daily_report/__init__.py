"""
Market feature module - daily market report generation and caching.

Components:
    router  - FastAPI router with POST /api/market endpoint
    agent   - MarketAgent class and analyst LLM agent
    models  - Pydantic output schemas (MarketReportOutput, etc.)
    db      - Database operations for market_reports table
"""
