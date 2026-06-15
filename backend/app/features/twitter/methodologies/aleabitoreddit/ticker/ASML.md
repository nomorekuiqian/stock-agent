---
skill: ticker-asml
layer: ticker
coverage: low
direct_mention_count: 18
sector: ai-infrastructure-mag7
static_corpus_cutoff: 2026-05-27
recent_direct_evidence_since: 2026-04-18
latest_evidence: 2026-05-17
last_updated: 2026-06-15
---

# Ticker Marker: ASML

## 覆盖状态

`coverage: low / marker`

静态蒸馏截至 2026-05-27 未覆盖独立 ASML thesis；但后续已入库语料重审中，2026-04-18 已有直接证据（`2045565771234021468`，"ASML / TSM earnings = Good Outlook. Semis + capex go brrr."）。

这次从 `coverage: none` 修正为 `coverage: low` 是覆盖口径修正，不是高信念升级：她偶尔提到 ASML 在 sector_framework 推文中作为半导体设备 anchor 参考，但**没有专门 thesis**，没有重仓，没有进入 ratings。

## Fallback

1. `sector/ai-infrastructure-mag7.md` — Mag7 anchor 配置框架
2. `sector/substrates.md` — 上游材料相关
3. `ticker/TSM.md` — TSM 的客户视角下提到 EUV

## related themes

- EUV / High-NA EUV 光刻机
- 半导体 capex 资本支出周期
- 中国出口管制 (ASML 是关键管制对象)

## 规则

不能把 AI 基建相邻证据说成 Serenity 对 ASML 的直接观点. 她**没有**发过 ASML thesis. 如果用户问"她怎么看 ASML", 回答应该:

> "Serenity 在历史推文里没有专门写过 ASML thesis. 她的 AI infra 视角中, ASML 作为 EUV 光刻机 anchor 默认存在但**不是核心持仓**. 如果你想看她对半导体设备 cycle 的态度, 参考 sector/ai-infrastructure-mag7.md, 或看她对 TSM 的持续 long 论点 (TSM 是 ASML 最大客户)."

## Evidence Map

- "$ASML" 提及但无独立 thesis（18 条 bucket 证据，多数在 sector_framework / macro_view 列表中）
- "ASML / TSM earnings = Good Outlook. Semis + capex go brrr." (id: 2045565771234021468, 2026-04-18) — 直接正向证据，但仍是行业 TLDR，不是独立 ASML thesis。
- "TLDR of recent semi developments... $TSM pushing CoPoS" — ASML 被提及但作为客户链 anchor (id: 2053205192980721797, 2026-05-09)
- "$AAOI earnings ... rotation upstream like: $ASML-type suppliers" (id: 2027480850397573567, 2026-02-27) — 方法论推断：她用 ASML-type suppliers 类比上游设备环节，不等于直接看多 ASML 本身。
