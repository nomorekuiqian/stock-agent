# 功能删减证据审计与 Gemini 3.8 Flash 统一升级

> Status: Completed (local implementation and evidence audit; not deployed)
> 日期：2026-09-04 PDT；查询记录采用数据库 UTC 时间。
> 用户确认范围：UI 不改；列出建议删除的功能及数据理由；统一升级生成模型为 gemini-3.8-flash。

## 目标

先刷新功能使用与运行证据，再输出保留/合并/退出建议。实现所有运行时生成链路的 Gemini 3.8 Flash 统一配置及兼容性修复。

## 范围

- 只读生产：近 30/60 天真实用户活动、Agent 会话、产物、邮件点击/发送、LLM 用量与计划任务；区分后台生成和用户主动使用，标注埋点缺失。
- 本地修改：模型统一配置、实际调用 provider、thinking 参数、相关用量计价与测试、当前文档。
- 向量 embedding 不属于文本生成模型，不替换成不兼容的生成模型。历史报告的真实 model 标签、过往评测数据与离线人工导入 provenance 保留。
- 不删除功能，不修改 UI，不停生产定时任务，不发送邮件、不改账单。Git 和发布按项目要求另行处理。

## 实现设计

1. 引入统一生成模型常量，运行时 ADK/原生调用使用 gemini-3.8-flash。
2. Research/KOL 的 MINIMAL thinking 改为官方支持的 LOW。
3. Watchlist Monitor 当前连接 DeepSeek，不能只替换 model 字符串；迁移至 Gemini 原生客户端，保留结构校验、重试、计量和上游超时。
4. 统一 stock 生成结果的 model 元数据；缓存缺少历史模型标签时不冒充新模型。
5. 新模型成本按官方当前价格与日期计算；不要把 generic Flash 旧价当作 3.8 价格。
6. 运行有意义的模型配置、结构输出、重试、计量与现有业务测试；若可用，做无持久化/无发送的最小模型兼容性 smoke。

## 进度

- [x] 核实 Gemini 3.8 Flash 官方支持范围（不支持 minimal thinking）。
- [x] 当前生产数据库只读连接可用；CLI 用户 refresh 失败未影响项目数据库读取。
- [x] 完成 30/60 天功能证据审计。
- [x] 完成模型迁移和必要测试。
- [x] 输出功能删减建议、证据限制与升级状态。

## 来源

- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- https://ai.google.dev/gemini-api/docs/pricing
- 各涉及模块 .context.md；本次原始聚合查询结果另附审计产物。


## 交付与验证

- 功能建议与数据限制：`docs/analysis/feature-retirement-audit-2026-09-04.md`。
- 15 份仅聚合的证据文件：`docs/analysis/feature-retirement-evidence-2026-09-04/`，未保存邮件地址/用户 ID/对话内容/密钥。
- `core/ai_models.py` 单一配置，23 个运行时模型常量导入校验通过。
- 生成模型迁移包含 Google 原生 structured client、LOW thinking、同模型 503 重试、新缓存 namespace 和真实历史 model 标签。
- 270 项相关业务测试通过；新增 Edge Function 回归及后续受影响测试 16 项通过（有重叠，不相加）。
- 真实 Gemini JSON 和 ADK function call smoke 通过；无应用持久化、无邮件发送。
- Python AST、JS 语法、新增行空白检查、聚合证据隐私检查通过。无 frontend 改动。
- 官方费用核实与 3.8 精确分支；Edge Function 补齐 cached/thoughts token 的 daily 聚合。后端和该 Edge Function 必须一起发布才能完整更新后台估值。
- 未执行 Git 操作、提交、推送、生产部署或功能删除。Embedding、离线实验、历史 provenance 未冒充为 3.8。
