"""
Profile context injection for LLM agents.

Pure function — prepends user investment profile to an agent's instruction
so the LLM can tailor tone, depth, and risk language per user.
"""

from typing import Optional

from app.features.portfolio.models import ProfileView


_STYLE_LABELS = {
    "passive": "被动/指数投资者",
    "balanced": "平衡型投资者",
    "active": "主动择股投资者",
}

_HORIZON_LABELS = {
    "short": "短期（< 1 年）",
    "mid": "中期（1-3 年）",
    "long": "长期（3 年以上）",
}

_RISK_LABELS = {
    "low": "保守",
    "moderate": "中等",
    "high": "激进",
}


def inject_profile(instruction: str, profile: Optional[ProfileView] = None) -> str:
    if not profile:
        profile = ProfileView(
            user_id="default",
            style="passive",
            horizon="long",
            risk_tolerance="moderate",
        )

    style_label = _STYLE_LABELS.get(profile.style, profile.style)
    horizon_label = _HORIZON_LABELS.get(profile.horizon, profile.horizon)
    risk_label = _RISK_LABELS.get(profile.risk_tolerance, profile.risk_tolerance)

    header = f"""## 用户画像
- 投资风格: {style_label}
- 投资期限: {horizon_label}
- 风险容忍: {risk_label}

根据画像调整语气、建议力度、风险措辞:
- 对长期用户避免短期噪音，对短期用户强调时间窗口
- 对保守用户避免激进措辞（如"重仓""梭哈""抄底"），强调下行保护
- 对激进用户可以讨论更大胆的场景，但仍需提示风险
- 被动投资者关注组合全局视角，主动投资者关注个股选股理由
"""
    return header + "\n" + instruction
