"""holdings_sync Pydantic models (design §3.1).

正确性核心: `NormalizedHolding` 故意**不含** thesis/target/stop_loss/conviction
—— source 适配器在结构上无法携带 P1（保护在类型层而非约定层）。
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

# reuse the portfolio symbol guard so a symbol is safe to interpolate into the
# reconcile EF's PostgREST not.in(...) (same threat model as portfolio).
from app.features.portfolio.models import _SYMBOL_RE, PortfolioListResponse

SourceLiteral = Literal["manual", "paste", "csv", "screenshot", "pdf", "snaptrade"]
ConfidenceLiteral = Literal["high", "medium", "low"]
RowStatus = Literal[
    "ok",
    "needs_review",
    "unresolved",
    "needs_mapping",
    "pending_review",   # 延迟预算未决（§2bis.A.5）
    "no_quote",         # 报价回环失败（§2bis.B.d）
    "budget_exhausted", # 每请求 fallback 网络预算耗尽（§2bis.A.2）
]
# source that may be committed (manual/snaptrade never go through this module)
CommitSourceLiteral = Literal["paste", "csv", "screenshot", "pdf"]

_MAX = 60  # 产品上限（设计 §8 决策，30→60）


class NormalizedHolding(BaseModel):
    """reconcile sink 仅消费此模型。**无 P1 字段** —— 全设计最重要的正确性决策。"""

    symbol: str
    shares: Optional[float] = Field(None, ge=0)
    cost_basis: Optional[float] = Field(None, ge=0)
    entry_price: Optional[float] = Field(None, ge=0)
    weight_pct: Optional[float] = Field(None, ge=0, le=100)
    external_account_id: Optional[str] = None
    # 故意不含 thesis/target/stop_loss/conviction


class SymbolCandidate(BaseModel):
    symbol: str
    name: str
    exchange: str


class ExtractedRow(NormalizedHolding):
    # Override symbol to Optional: unresolved/budget_exhausted/pending_review
    # rows legitimately have no symbol yet (user fixes in Review). The strict
    # `symbol: str` lives on NormalizedHolding/CommitRequest where it matters.
    symbol: Optional[str] = None  # type: ignore[assignment]
    raw: str
    resolved_name: Optional[str] = None
    exchange: Optional[str] = None
    confidence: ConfidenceLiteral = "low"
    status: RowStatus = "unresolved"
    candidates: List[SymbolCandidate] = Field(default_factory=list)
    # 产品兜底提示位（§7bis）—— 仅 Review 展示/确认，不进 NormalizedHolding、不落库
    currency_hint: Optional[str] = None
    dup_of: Optional[str] = None
    notices: List[str] = Field(default_factory=list)


class ExtractDraft(BaseModel):
    draft_id: str                       # 临时回显，不落库
    source: SourceLiteral
    rows: List[ExtractedRow]
    dropped_note: Optional[str] = None
    columns: Optional[List[str]] = None  # 仅 needs_mapping(CSV) 时


class RawExtractedHolding(BaseModel):
    symbol_or_name: str
    shares: Optional[float] = None
    cost_basis: Optional[float] = None
    entry_price: Optional[float] = None
    weight_pct: Optional[float] = None


class PasteExtractionOutput(BaseModel):
    looks_like_holdings: bool                       # 防滥用自报
    holdings: List[RawExtractedHolding] = Field(default_factory=list, max_length=_MAX)
    # ↑ max_length 仅内部 Pydantic 校验；**绝不作为 response_schema 下发给 Gemini**
    #   （PoC 实测: maxItems + 多 nullable 数值字段 → 400；60 上限解析后应用层截断）


class VisionExtractionOutput(PasteExtractionOutput):
    pass


class CommitRequest(BaseModel):
    source: CommitSourceLiteral                     # manual/snaptrade 不经此提交
    draft_id: Optional[str] = None
    clear_source: bool = False                      # 仅显式撤销本 source 全部导入时 true
    # rows = 该 source 的**完整目标集**（非增量；续修须发 已落库∪新接受）。
    # clear_source=true 时允许空 rows。
    rows: List[NormalizedHolding] = Field(default_factory=list, max_length=_MAX)


class CommitResponse(BaseModel):
    written: int
    preserved_p1: int                 # 被 merge 保护的 P1 行数（可观测）
    portfolio: PortfolioListResponse  # 复用现有模型，FE 复用渲染
