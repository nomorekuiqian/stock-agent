# 推文筛选切换 Gemini 3.5 Flash-Lite

2026-09-17 核实的最新稳定 Flash-Lite 为 `gemini-3.5-flash-lite`。模型集中定义为 `app.core.ai_models.CLASSIFICATION_MODEL`；仅 KOL enrichment 使用，显式设置 `thinking_level=MINIMAL`。日报综合继续使用 `GENERATIVE_MODEL`。调度、输入范围、schema、批量大小、清洗和持久化语义保持原行为。MINIMAL 不保证零思考。

已于 2026-09-17 部署生产；没有手动触发真实生成、发送邮件或修改业务数据。计量与 enrichment provenance 随实际模型切换，并补齐 3.5 Flash-Lite 的缓存/思考价格计算。

## 标准 API 单价

美元 / 百万 token：

| 模型 | 普通输入 | 缓存输入 | 输出含思考 |
|---|---:|---:|---:|
| Gemini 3.8 Flash，2026 年优惠价 | 0.75 | 0.075 | 3.75 |
| Gemini 3.5 Flash-Lite | 0.30 | 0.03 | 2.50 |

来源：[Google 模型页](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)、[官方价格](https://ai.google.dev/gemini-api/docs/pricing)、[思考级别](https://ai.google.dev/gemini-api/docs/thinking)。不适用 Batch 折扣：应用每批处理多条推文不等于使用 Google Batch API。

## 实际历史流量回算

基准：9 月 6–15 日十个完整 UTC 日，筛选 1,232 次，原模型筛选 $26.02，项目全部模型 $40.38。普通输入、缓存量及普通输出保持原值，只替换价格，并分别假设思考量。30 天情景为十天乘 3，不是当月 Google 账单预测。

| 场景 | 筛选 / 30 天 | 筛选降幅 | 全项目 / 30 天 | 全项目节省 / 30 天 |
|---|---:|---:|---:|---:|
| 原配置 | $78.07 | — | $121.13 | — |
| 新模型，思考量不变 | $46.50 | 40.4% | $89.55 | $31.58 |
| 新模型，思考量剩 25% | $23.74 | 69.6% | $66.80 | $54.33 |
| 新模型，零额外思考假设 | $16.16 | 79.3% | $59.21 | $61.92 |

思考量剩 25% 是敏感性分析，零思考是理想假设，均非测量结果。模型变化也可能改变普通输出、缓存命中及重试量，因此以上不是实际费用上下界。此前使用 3.1 Flash-Lite 的约 85% 节省估计不适用于本次 3.5 选择。上线后仍须验证标签质量和真实单位成本。

聚合计算：[费用情景 JSON](token-cost-evidence-2026-09-16/flash-lite-comparison-2026-09-17.json)。

## 验证

| Scope | Level | Test | Result |
|---|---|---|---|
| Backend | lint | Agent 实例加载、筛选模型与 MINIMAL 配置、综合模型检查 | pass |
| Backend | unit | 分类计费、原生成计费/重试、推文清洗与批处理，共 42 项 | pass |

未进行付费模型质量对照；已完成生产部署及只读验证。

## 生产部署结果

- 部署 ID：`e11659a5-8bf3-44dd-b067-b5e66a852ddf`，Railway 状态 SUCCESS。
- 基线为原生产部署 `aa9fcfd7-7606-460d-935f-34902682146e`；从生产 /app 导出独立构建上下文，仅替换 `app/core/ai_models.py`、`app/features/twitter_digest/agents.py`、`app/shared/llm_pricing.py`。没有上传当前工作区其他未完成修改，没有提交或推送 Git。
- 生产实例导入确认：enrich 为 `gemini-3.5-flash-lite` + MINIMAL，curate 为 `gemini-3.8-flash`；三个代码文件 SHA256 与部署包一致。
- Google 模型元数据 GET 确认该项目可访问 `models/gemini-3.5-flash-lite`，未调用生成接口。
- `/`、`/health`、`/ready` 均 HTTP 200；ready 的 InsForge 与所需 API key 检查正常。
- 本次沿用现有 requirements 与 Docker 构建配置；构建会重新解析未固定的依赖，不声称依赖版本与原容器完全一致。
- 后续自然定时任务使用新配置；实际成本和质量尚待新运行数据验证。

[生产验证记录](token-cost-evidence-2026-09-16/flash-lite-deployment-2026-09-17.json)。
