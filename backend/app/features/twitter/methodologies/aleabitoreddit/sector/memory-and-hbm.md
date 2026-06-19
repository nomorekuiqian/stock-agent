---
skill: sector-memory-and-hbm
layer: sector
coverage: high
tweets: 353
static_corpus_cutoff: 2026-05-27
recent_direct_evidence_since: 2026-06-18
latest_evidence: 2026-06-18
last_updated: 2026-06-19
---

# Sector: memory-and-hbm

## 适用问题

- 「HBM / 存储她怎么看?」「MU / SNDK / SK Hynix / Samsung 排序?」
- 「memory 短缺有多久?」「黄仁勋说 memory bottleneck severe 是真的吗?」
- 「AEHR (测试) 在 memory 链里是什么角色?」

## 核心问题

**Memory 短缺周期处在哪一段? AI 拉动 vs 消费电子周期, 谁在主导? 测试设备 AEHR 是不是被低估的中游?**

## 公司或产业是什么

**Memory** = AI 算力的"短期记忆". GPU 每读写一次 token 都通过 HBM (High Bandwidth Memory). DRAM / NAND 是更广的存储.

**核心 sub-segments**:
- **HBM** (High Bandwidth Memory): SK Hynix (60% 全球) + Samsung + MU; 量产 HBM3e / HBM4
- **DRAM**: SK Hynix + Samsung + MU + Nanya
- **NAND**: Samsung + SK Hynix + WDC + SNDK + Kioxia
- **测试**: AEHR (晶圆级 burn-in 测试) 给 HBM / AI chip
- **2D NAND 短缺** (2026-05 新瓶颈)

**关键标的**:
- **MU** ($355B MC) — HBM3e / HBM4 chase SK Hynix; 财报反复超预期
- **SNDK** ($16B+ MC) — NAND, 涨幅大但她明确说"meme stock"
- **AEHR** ($49 mentions) — HBM 测试 burn-in, 小盘 supplier
- **Samsung Electronics** (005930) — 韩股, 全球内存第二
- **SK Hynix** (HXSCL) — 韩股, HBM 第一
- **Nanya** (2408) — Taipei DRAM

## 她看什么信息

- **NVDA CEO 关于 memory bottleneck** ("Memory Bottleneck is Severe", 2026-01)
- **HBM 量产时间表** (HBM4 H2 2026 量产)
- **韩国 chip cycle** (EWY ETF 作为代理)
- **2D NAND 短缺** (2026-05 新瓶颈)
- **MU 财报指引** (反复超预期)
- **AEHR 客户 design wins** (HBM 测试 + AI chip burn-in)

## 她如何理解

### Memory 是 GPU 之后的第一个瓶颈

她的瓶颈迁移路径里, memory 是 GPU 之后第一个被点出:

```
GPU (NVDA) → HBM (MU / SK Hynix / Samsung) → 电力 (IREN) → EML (LITE) → ...
```

> "Nvidia CEO said today that the 'Memory Bottleneck is Severe'. SK Hynix ($330B), $MU ($355B), Samsung ($595B). Wait and see when they find out the entire AI buildout will be bottlenecked by the tiny $AXTI ($1B) after China's new export controls." (id: 2008633673743298617, 2026-01-06)

她明确把 memory 作为 GPU 之后的第一个瓶颈, 但 chokepoint 真正在更上游 (InP — AXTI).

### SNDK 是 "meme stock"

她明确不把 SNDK 当 chokepoint:

> "Nobody can convince me $SNDK isn't a meme stock at this point. But as I've said, bottlenecks with multi-year visibility like $HPS.A or $LITE tend to perform better." (id: 2052784100784922983, 2026-05-08)

SNDK 涨幅大但是周期性 NAND 重定价, 不是结构性 chokepoint.

### Big Tech 给 SK 海力士融资

> "Big Tech funding SK Hynix" (id: 2053205192980721797, 2026-05-09)

Mag7 直接给上游 memory 注资,验证 memory 短缺 thesis.

### AEHR 是 HBM 测试的 unsung hero

AEHR ~$49 提及, 她持续看好作为 HBM / AI 芯片 burn-in 测试供应商. 小盘 ($1-2B MC), Stage 0-1.

### 2D NAND 是 2026-05 新瓶颈

> "TLDR of recent semi developments... 2D NAND 短缺 (2026-05)" (id: 2053205192980721797)

她在 2026-05 提到 2D NAND 短缺作为新瓶颈, 但尚未给具体重仓标的.

## 2026-06-18 后最新变化

- `2067621883525394768` — 2026-06-18，Serenity 复盘 memory theme 的市场错位：3 个月前多数人 bearish memory，但 MU / SNDK / EWY / SK Hynix / Samsung 已明显上涨。她把 memory 和 photonics 列为 top 2 themes，同时提醒 optics 仍更早期。

处理口径：memory 不再只是 1 月的 HBM bottleneck 旧证据；截至 2026-06-18，她仍把它列为核心 theme。但回答时要说明 memory 的许多大票已经明显重定价，新增弹性可能更偏 photonics / substrates。

## 决策框架

| 标的 | 姿态 |
|---|---|
| MU | 持有, anchor 配置, 不重仓 (因为已是大 MC, 弹性差) |
| Samsung Electronics (005930) | medium, 韩股配置 |
| SK Hynix (HXSCL) | medium, 韩股配置 |
| AEHR | small / 试探, 测试设备小盘 |
| SNDK | NEUTRAL ("meme stock", 不重仓 但也不空) |
| Nanya 2408 | medium, Taipei DRAM 配置 |

## 减仓与轮动信号

1. **HBM4 量产完成 H2 2026** → 短缺消解, 部分 memory 标的回调
2. **AI 算力增速放缓** → memory demand 同步放缓 (低概率)
3. **2D NAND 短缺解决** → SNDK / SK Hynix NAND 业务回调
4. **InP / SiPh 替代 memory bandwidth** (CPO 量产后部分 memory bandwidth 通过光学绕过) — 长期风险

## 常见误读

| 误读 | 实际 |
|---|---|
| MU 是 HBM 主线 | MU 在追 SK Hynix, 不是行业第一 |
| SNDK 涨幅大 = 看好 | 她明确说"meme stock" |
| AEHR 是 GPU 测试 | AEHR 主要做 HBM 晶圆级 burn-in 测试 |
| memory 短缺 = MU 重仓 | 真 chokepoint 在 InP (AXTI), 不在 memory 本身 |
| HBM4 量产 = memory 涨完 | HBM5 / HBM6 / 玻璃基板 HBM 后续仍 ramp |

## 回答注意

- 先说明 Memory / HBM 在 Serenity 漏斗里的位置: GPU 后的第一瓶颈,但不等于所有存储股都值得展开。
- 只挑用户问题相关的 2-3 个子环节: HBM 主流、NAND、测试、或更上游材料。
- 显式判断当前更像估值回撤、验证窗口,还是逻辑破裂;不要把 Stage / tier 当作答案标题。
- 分清历史观点、当前事实和方法推断。没有直接推文覆盖时,退回到 AI capex + bottleneck 方法论。

## Evidence Map

- "Nvidia CEO: Memory Bottleneck is Severe" (id: 2008633673743298617, 2026-01-06)
- "Nobody can convince me $SNDK isn't a meme stock" (id: 2052784100784922983, 2026-05-08)
- "Big Tech funding SK Hynix" (id: 2053205192980721797, 2026-05-09)
- "Memory: Nanya $2408, SK Hynix $HXSCL, $MU" (id: 1985770241532838347, 2025-11-04)
- "Strong Buy: SK Hynix $HXSCL $SNAP Samsung Electronics" (id: 1998846813177262295, 2025-12-10)
- "2D NAND 短缺" (id: 2053205192980721797, 2026-05-09)
- "Memory and photonics are top themes; MU / SNDK / EWY / SK Hynix / Samsung gained after bearish consensus" (id: 2067621883525394768, 2026-06-18)
