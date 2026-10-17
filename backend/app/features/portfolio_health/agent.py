"""Portfolio health diagnosis agent -- generates human-readable analysis from scoring data."""

import json

from app.core.feature_pause import require_active
from app.core.ai_models import GENERATIVE_MODEL
from app.core.logging import get_logger
from app.features.portfolio.models import ProfileView
from app.features.portfolio_health.models import DiagnosisOutput, HealthScore
from app.shared.llm_metering import meter
from app.shared.profile_context import inject_profile

logger = get_logger(__name__)

PORTFOLIO_HEALTH_MODEL = GENERATIVE_MODEL

DIAGNOSIS_INSTRUCTION = """
你是用户的投资组合健康分析师。基于量化评分和用户画像，写出一段诊断性分析。

## 输入
你会收到：
1. 4 维健康评分（分散度/表现/宏观适配/稳定性，各 0-25 分）
2. 用户持仓及权重
3. 板块暴露分布
4. 用户画像（风格/期限/风险容忍）

## 输出要求
- `one_line`: ≤ 60 字的一行总结，像微信消息一样直接
- `diagnosis_markdown`: 3-5 段分析，每段必须引用至少 1 个具体数字（评分、仓位百分比、板块占比）
- `top_risk`: ≤ 30 字，最主要的风险点
- `sector_dna`: 描述组合风格特征（如 "科技重仓成长型"）
- `macro_sensitivity_tag`: low / mid / high
- `next_action`: 一条建议（type 必须是 rebalance/research/none）

## 语言规则
- 所有输出用中文
- 禁止指令性交易词：买入、卖出、加仓、减仓
- 使用：考虑、研究、了解、评估、关注
- 语气随画像调整（对保守用户温和，对激进用户直接）

## $CASH 处理规则
- 若持仓包含 $CASH，认可其避险作用，不判定为"闲置资金"
- 禁止对 $CASH 做基本面分析
- Cash > 30% 时在 sector_dna 标注"高现金缓冲"
- 若组合防御性得分较高且实际由 $CASH 贡献（而非板块持仓），表述为"持有充足的现金缓冲以规避风险"，禁止泛称为"投资了防御性板块"

## 首次体检特例
若 is_first_report=True 且 score_total < 60:
- 语气温和鼓励，强调"发现优化空间正是系统价值"
- 禁用词: 集中度过高、风险偏高、偏弱、不足、较差
- 改用: 可以考虑、值得关注、有优化空间、可以更均衡
- one_line 开头宜正向: "你的组合已经有 X, 接下来..."
"""


async def run_diagnosis(
    score: HealthScore,
    holdings_summary: list[dict],
    exposure: dict[str, float],
    profile: ProfileView,
    is_first_report: bool = False,
    thesis_map: dict[str, str] | None = None,
) -> DiagnosisOutput | None:
    """Run the diagnosis agent. Returns None on failure (caller provides fallback)."""
    require_active("portfolio_health")
    try:
        from google.adk.agents import LlmAgent
        from google.adk.runners import InMemoryRunner
        from google.genai.types import Content, Part

        instruction = inject_profile(DIAGNOSIS_INSTRUCTION, profile)

        agent = LlmAgent(
            model=PORTFOLIO_HEALTH_MODEL,
            name="portfolio_health_diagnoser",
            instruction=instruction,
            output_schema=DiagnosisOutput,
            after_model_callback=meter(
                "portfolio_health", model=PORTFOLIO_HEALTH_MODEL
            ),
        )
        runner = InMemoryRunner(agent=agent, app_name="health")
        session = await runner.session_service.create_session(
            app_name="health", user_id="system"
        )

        user_input = {
            "score": score.model_dump(),
            "holdings": holdings_summary,
            "exposure": exposure,
            "is_first_report": is_first_report,
        }
        if thesis_map:
            user_input["thesis_map"] = thesis_map

        msg = Content(parts=[Part(text=json.dumps(user_input, ensure_ascii=False))])

        result = None
        async for event in runner.run_async(
            user_id="system", session_id=session.id, new_message=msg
        ):
            if hasattr(event, "content") and event.content:
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        try:
                            data = json.loads(part.text)
                            result = DiagnosisOutput(**data)
                        except (json.JSONDecodeError, Exception):
                            pass

        if result:
            _lint_diagnosis(result, is_first_report, score.total)
        return result

    except Exception:
        logger.exception("diagnosis agent failed")
        return None


def _lint_diagnosis(
    result: DiagnosisOutput, is_first_report: bool, score_total: int
) -> None:
    """Post-generation lint. Logs warnings but doesn't fail -- caller decides."""
    forbidden_trade_words = ["买入", "卖出", "加仓", "减仓"]
    for w in forbidden_trade_words:
        if w in result.next_action.text or w in result.diagnosis_markdown:
            logger.warning("lint_fail: forbidden trade word '%s' in diagnosis", w)

    if is_first_report and score_total < 60:
        harsh_words = ["集中度过高", "风险偏高", "偏弱", "不足", "较差"]
        for w in harsh_words:
            if w in result.diagnosis_markdown or w in result.one_line:
                logger.warning(
                    "lint_fail: harsh word '%s' in first report", w
                )
