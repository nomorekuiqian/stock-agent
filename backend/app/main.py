from dotenv import load_dotenv
load_dotenv()  # Load .env before importing agents

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.agents.macro_agent import MacroAgent
from app.models.request_models import MacroData

app = FastAPI(title="Macro Analysis API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize macro agent
macro_agent = MacroAgent()

@app.get("/")
async def root():
    return {"message": "Macro Analysis API is running"}

@app.post("/api/macro", response_model=MacroData)
async def analyze_macro():
    try:
        result = await macro_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate macro analysis")
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
