from fastapi import APIRouter, Depends

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.features.research_kb.agent import answer
from app.features.research_kb.models import ResearchKBRequest, ResearchKBResponse

logger = get_logger(__name__)

router = APIRouter(prefix="/api/research-kb", tags=["research_kb"])


@router.post("/chat", response_model=ResearchKBResponse)
async def research_kb_chat(
    req: ResearchKBRequest,
    user_id: str = Depends(verify_user_token),
):
    logger.info("research_kb_chat by user=%s msg=%s", user_id[:12], req.message[:80])
    return await answer(req.message, req.history)
