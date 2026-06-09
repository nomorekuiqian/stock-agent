"""Serenity KOL agent instruction regression tests."""

from __future__ import annotations

from pathlib import Path

from app.features.kol_research.agent import _build_instruction, _sanitize_user_facing_markdown
from app.shared.kol_persona import get_persona


def test_kol_instruction_uses_unified_outer_policy_and_persona_skills():
    serenity = get_persona("aleabitoreddit")
    frank = get_persona("qinbafrank")
    assert serenity is not None
    assert frank is not None

    serenity_instruction = _build_instruction(serenity)
    frank_instruction = _build_instruction(frank)

    for instruction, username in (
        (serenity_instruction, "@aleabitoreddit"),
        (frank_instruction, "@qinbafrank"),
    ):
        assert username in instruction
        assert "KOL 方法论投研分析师" in instruction
        assert "帮助用户透过" in instruction
        assert "过去的公开观点、长期方法论" in instruction
        assert "当前可获得的市场和公司数据" in instruction
        assert "默认以深度投研方式回答" in instruction
        assert "每轮流程" in instruction
        assert "个股、板块、宏观、新闻事件、方法论、比较、机会发现、历史观点追问" in instruction
        assert "加载方法论相关 framework skill" in instruction
        assert "如果涉及具体个股,加载对应 ticker skill" in instruction
        assert "如果涉及产业或主题,加载对应 sector skill" in instruction
        assert "引用历史观点时,必须提及大致时间或当时语境" in instruction
        assert "尽量通俗易懂" in instruction
        assert "不要把一个博主的框架套到另一个博主身上" in instruction
        assert "Serenity 专属回答纪律" not in instruction
        assert "direct_short" not in instruction
        assert "normal_explain" not in instruction
        assert "观点的**策展人**" not in instruction

    assert "Serenity 的三种判断状态" in serenity_instruction
    assert "可证伪锚" not in serenity_instruction
    assert "三杀" not in serenity_instruction
    assert "三杀" in frank_instruction


def test_serenity_skill_material_does_not_reference_other_persona_frameworks():
    root = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "features"
        / "twitter"
        / "methodologies"
        / "_drafts"
        / "serenity-skill-v1"
    )
    forbidden = ("Frank", "frank", "qinbafrank", "三杀", "杀估值", "杀业绩", "杀逻辑")
    offenders: list[str] = []

    for path in root.rglob("*"):
        if not path.is_file() or "evidence" in path.parts:
            continue
        if path.suffix not in {".md", ".json"}:
            continue
        text = path.read_text(encoding="utf-8")
        if any(term in text for term in forbidden):
            offenders.append(str(path.relative_to(root)))

    assert offenders == []


def test_user_facing_sanitizer_downgrades_overstrong_trading_language():
    text = (
        "SIVE 非常值得关注，也非常值得继续观察，值得高度关注，"
        "处在黄金期和黄金窗口期，是最具确定性的国王制造者，"
        "可以提前入场等机构接盘。800V 直流（HDC）是绝对瓶颈。"
        "TLDR: 这是一个 chokepoint 和 bottleneck，处于 design-in 和 qualification，"
        "存在 forward mismatch，属于杀验证。物料清单（BOM）对应 TAM 和 thesis，"
        "完全值得继续深入研究，拥有极高的权重和最具爆发力的空间，可重点轮动加仓。"
        "它是物理咽喉（物理咽喉），有极高的研究与追踪价值、强烈支持、强力背书、"
        "顶尖背景和不可替代的国安节点。"
    )

    sanitized = _sanitize_user_facing_markdown(text)

    assert "值得高度关注" not in sanitized
    assert "黄金期" not in sanitized
    assert "黄金窗口期" not in sanitized
    assert "最具确定性" not in sanitized
    assert "国王制造者" not in sanitized
    assert "提前入场" not in sanitized
    assert "接盘" not in sanitized
    assert "HDC" not in sanitized
    assert "绝对瓶颈" not in sanitized
    assert "TLDR" not in sanitized
    assert "chokepoint" not in sanitized
    assert "bottleneck" not in sanitized
    assert "design-in" not in sanitized
    assert "qualification" not in sanitized
    assert "forward mismatch" not in sanitized
    assert "杀验证" not in sanitized
    assert "物料清单（物料清单）" not in sanitized
    assert "TAM" not in sanitized
    assert "thesis" not in sanitized
    assert "完全值得继续深入研究" not in sanitized
    assert "极高的权重" not in sanitized
    assert "最具爆发力" not in sanitized
    assert "重点轮动加仓" not in sanitized
    assert "物理咽喉（物理咽喉）" not in sanitized
    assert "极高的研究与追踪价值" not in sanitized
    assert "强烈支持" not in sanitized
    assert "强力背书" not in sanitized
    assert "顶尖背景" not in sanitized
    assert "不可替代的国安节点" not in sanitized
    assert "值得继续观察" in sanitized
    assert "仍可放进观察名单" in sanitized
    assert "验证窗口" in sanitized
    assert "关键上游" in sanitized
    assert "提前识别" in sanitized
    assert "追认" in sanitized
    assert "HVDC" in sanitized
    assert "关键瓶颈" in sanitized
    assert "一句话说" in sanitized
    assert "物理咽喉" in sanitized
    assert "产能瓶颈" in sanitized
    assert "客户导入" in sanitized
    assert "客户验证" in sanitized
    assert "前瞻错配" in sanitized
    assert "可服务市场" in sanitized
    assert "原始判断" in sanitized
    assert "仍值得继续研究" in sanitized
    assert "较高权重" in sanitized
    assert "弹性较高" in sanitized
    assert "重点轮动关注" in sanitized
    assert "较高的研究与追踪价值" in sanitized
    assert "支持信号" in sanitized
    assert "相关背景" in sanitized
    assert "重要国安节点" in sanitized
    assert "非常值得关注" not in sanitized
    assert "非常值得继续观察" not in sanitized
