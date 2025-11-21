from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.services.agent_service import AgentService
from app.services.stock_service import StockDataService
from app.models.request_models import AnalyzeRequest, AnalyzeResponse

app = FastAPI(title="Stock Research Agent API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
agent_service = AgentService()

@app.get("/")
async def root():
    return {"message": "Stock Research Agent API is running"}

@app.get("/api/stock/{ticker}")
async def get_stock_info(ticker: str):
    info = StockDataService.get_stock_info(ticker)
    if not info:
        raise HTTPException(status_code=404, detail="Stock not found")
    return info

@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_stock(request: AnalyzeRequest):
    try:
        # Extract ticker from request if needed, or use the explicit ticker field
        result = await agent_service.analyze_multidimensional(request.ticker)
        return AnalyzeResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trending")
async def get_trending():
    try:
        return StockDataService.get_trending_stocks()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
