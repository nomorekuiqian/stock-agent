# Holdout Replay — Serenity Skill v1

> Status: TEMPLATE (pending runtime execution)

## 目的

留出 10-20% Serenity 推文不参与蒸馏, 验证生成的 skill 能否解释 holdout 中的分析路径.

## 方法

1. 随机抽取 100-200 条 thesis / sector_framework / catalyst 推文作为 holdout
2. 对每条 holdout 推文:
   a. 提取她的核心 thesis / decision / 受益标的
   b. 让 agent 加载 serenity-skill-v1, 给定相同的输入信息 (新闻 / 财报 / 时间窗) 但不看原推文
   c. 让 agent 输出 Serenity 视角的解读
   d. 人工对比 agent 输出 vs holdout 原文, 评分 0-3:
      - 0: 完全错 (方向相反 / 标的完全不同)
      - 1: 部分对 (方向对但理由 / 标的错)
      - 2: 大体对 (方向 + 主要标的 + 理由都对, 细节有差)
      - 3: 完全对 (能复现原推文的判断 + 受益标的 + 时间窗)

## 验收标准

平均分 ≥ 2.0 (大体对)
0 分比例 ≤ 10%

## 测试集设计

100 条样本应当涵盖:

- 30 条 thesis 推文 (各 sector)
- 30 条 catalyst 推文 (新闻反推)
- 20 条 sector_framework 推文 (排名 / 评级)
- 10 条 trade_action 推文 (加减仓决定)
- 10 条 risk_flag 推文 (减仓 / 警告)

## 执行(pending)

需要 runtime agent + 人工评分. 留待 cockpit 灰度上线时配套.

## 预期发现

预期高频主线 ticker (NBIS / SIVE / AXTI) 解释能力较强 (≥2.5 平均分), 低覆盖 ticker (CRWV / WULF) 较弱 (~1.5 平均分).
