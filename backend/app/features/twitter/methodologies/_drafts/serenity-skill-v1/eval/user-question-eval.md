# User Question Eval — Serenity Skill v1

> Status: TEMPLATE (pending runtime execution)

## 目的

跑预设用户问题集, 评估 skill 是否 actionable, 是否能正确路由到 framework, 是否给出有 Serenity 特征的回答.

## 14 道题集

### Tier 1: Routing 验证(框架命中)

1. **「她推荐什么股票?」**
   - 期望命中: `framework/ask-for-top-picks`
   - 期望回答含: 校正预期 + 按供应链桶组织 + 风险标签

2. **「她现在重仓什么?」**
   - 期望命中: `framework/ask-about-positioning`
   - 期望回答含: NBIS / SIVE / AXTI 集中度 + $$ 披露 + "看好≠重仓" 警告

3. **「她是怎么找到这些冷门股的?」**
   - 期望命中: `framework/ask-about-method`
   - 期望回答含: 资本开支漏斗 + 物料清单反推流程 + 客户验证 / 前瞻错配 / 机构追认

4. **「寻找下一个机会」**
   - 期望命中: `framework/ask-about-method` + 必要 sector
   - 期望回答含: 方法先行;先讲如何从大趋势下沉到更窄瓶颈,再给 2-4 个可继续挖的供应链层级和验证问题
   - 失败信号: 把 SIVE / AXTI / NBIS 等历史高信念标的重新列成清单,引用很多但没有展示发现流程

### Tier 2: 单股深度

5. **「SIVE 还能买吗?」**
   - 期望命中: `framework/ask-about-stock` + `ticker/SIVE.md`
   - 期望回答含: CW DFB 物理咽喉 + 客户链 + MSCI / Nasdaq 催化 + 风险

6. **「NVDA 是她重仓吗?」**
   - 期望命中: `framework/ask-about-stock` + `ticker/NVDA.md`
   - 期望回答含: anchor 配置不是重仓; alpha 在下游

7. **「她对 IREN 看法变了吗?」**
   - 期望命中: `framework/ask-about-positioning` (变化关键词)
   - 期望回答含: bull → bear 切换 + $6B ATM 稀释 + 同环切换到 NBIS

8. **「AXTI 在她体系里是什么?」**
   - 期望命中: `framework/ask-about-stock` + `ticker/AXTI.md`
   - 期望回答含: 40% InP 全球 + 上游材料链 + 政府背书 + PT $150 / $300+

### Tier 3: 板块 / 新闻

9. **「CPO 还能上车吗?」**
   - 期望命中: `framework/ask-about-sector` + `sector/photonics-and-cpo.md` (优先, 因为没明确 consensus 关键词)
   - 期望回答含: 子环节地图 + 上游 (SIVE/FOCI) Stage 0-1 + 下游 (LITE/COHR) 部分轮出

10. **「CPO 已经是 consensus 了吗?」**
   - 期望命中: `framework/ask-is-consensus`
   - 期望回答含: 共识曲线定位 (Stage 0-1 上游 + Stage 2 下游) + Photonics TAM $14B → $154B

11. **「Intel CEO 说 CPU 比例从 1:8 拉到 1:1, 她会怎么解读?」**
    - 期望命中: `framework/ask-news-decoder`
    - 期望回答含: CPU (INTC/AMD/ARM) → 代工 / 设备 / 测试 / 上游材料;说明直接受益和二阶受益

12. **「Substrates supercycle 是什么?」**
    - 期望命中: `framework/ask-about-sector` + `sector/substrates.md`
    - 期望回答含: AXTI/SOI/IQE/TSEM/LPK 子环节 + 上游材料物理咽喉

### Tier 4: 难度 / 边界

13. **「她怎么看 ASML?」**
    - 期望命中: `framework/ask-about-stock` + `ticker/ASML.md` (marker)
    - 期望回答: 明确声明"她没有专门 thesis", fallback 到 ai-infrastructure-mag7 anchor 框架

14. **「美股现在是大顶吗?」**
    - 期望命中: `macro/ai-capex-cycle` (默认 macro)
    - 期望回答含: AI 资本开支 2030 之前仍在爬坡 + 不交易 Fed 政策本身

## 评分维度

每道题用 4 个维度评分 (0-3 each, 总分 0-12):

1. **Routing 正确性**: 是否命中了期望的 framework
2. **Skill 加载正确性**: 是否同时加载了正确的 sector / ticker 文件
3. **回答内容 Serenity 特征**: 是否展示她的供应链方法链、关键证据和验证问题
4. **风险标签 / 边界处理**: 是否提示了"看好≠重仓", 小盘流动性, coverage 等级等

## 验收标准

平均总分 ≥ 9/12 (75%)
Routing 错误 ≤ 2/14 (15%)
风险标签缺失 ≤ 3/14

## 执行(pending)

需要 runtime agent. 配合 cockpit 灰度上线一起跑.
