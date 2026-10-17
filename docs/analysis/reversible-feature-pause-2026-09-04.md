# 功能暂停执行报告

状态：**已上线**。生产与公开 staging 均已验证。
页面/API 最终验证：2026-09-04 20:31 PDT（2026-09-05 03:31 UTC）。

## 已完成的改动

| 功能 | 用户入口处理 | 阻断 token 的措施 |
|---|---|---|
| 持仓体检 | 隐藏导航、简报动作；旧页面跳到 For You | API、service 和诊断 Agent 前置拒绝；简报不再推荐体检 |
| Research-KB | `/research/kb` 跳到通用 Research | 阻断问答、专属检索、embedding；公开 `/api/vector/*` 一并拒绝，关闭旁路 |
| KOL 独立助手 | 隐藏博主研究室与 persona 切换；旧链接回到通用 Research | 阻断聊天、流式生成、追问、方法论提取、warmup；旧会话不能从共享历史接口恢复 |
| Panda 社区服务 | `/panda` 跳到 Research | 阻断社区 API、抓取入口与对应来源的向量写入；grant 和归档保留 |
| AI Monitor | 隐藏页面入口；旧页面回到 For You | 用户/admin/cron 批量生成和单 ticker 生成均拒绝 |
| MCP | 隐藏授权入口；旧网页授权返回 403 | 后端挂载和 standalone MCP 拦截；两个独立运行实例停止，无法继续调用或进入 x402 收费流程 |
| Onboarding | 不再挂载引导、不再请求引导状态；注册后默认进入 Today | 状态/完成 API 拒绝，Drip 定时任务暂停；注册、邮箱验证和登录保留 |

暂停由发布时固定配置控制，普通用户、付费权益、旧 MCP token 或 cron key 都不能开启。后端在路由处理前返回 `403 / feature_paused`；管理员同样不能使用暂停功能的生成入口。

功能实现、持仓、旧会话、历史报告、授权和归档均保留。旧 KOL 浏览器状态也保留在原 sessionStorage key 中，中性 Research 使用独立 key。Panda grant 的管理员管理接口保留原管理员鉴权，本身不调用模型。

## 定时任务与运行实例

InsForge 当前共 **17 个 schedules：13 个保留运行，4 个暂停**。其中 3 个此前已经暂停，本次新停 KOL 向量索引，并对全部 4 个复核。

| 定时任务 | 此前 | 当前 |
|---|---|---|
| Watchlist Monitor Paid Universe | 已暂停 | 暂停 |
| zsxq Panda Ingestion | 已暂停 | 暂停 |
| Onboarding Drip | 已暂停 | 暂停 |
| KOL Tweet Embeddings — Frank + Serenity + Panda | 运行 | **暂停** |

`cron-trigger` 为前三个任务增加 no-op 守卫，即使手动触发，也返回 `disabled=true`，不转发后端。生产实际调用这三个停用分支验证通过。KOL 向量索引由后端守卫拒绝。

独立 MCP 的生产和 staging 服务均为 **0 个活动部署**，现有三个公开地址返回 404。服务配置和源码没有删除。仓库未发现剩余 GitHub `schedule/cron` 声明，Railway 主服务也没有相关 cron 配置。

**保留边界：KOL 日报没有下线。** 按“暂停独立助手”的范围，保留其必要的推文抓取、list 同步、enrichment、日报生成/发送，以及日报内部历史检索；这些共享任务仍有正常的模型/数据成本。个性化持仓简报、持仓编辑、手动添加股票、通用 Research 继续运行。

[任务状态证据](feature-pause-evidence-2026-09-04/schedules.json)

## 模型与 token 验证

- 生成模型已随本次后端发布统一为 **`gemini-3.8-flash`**，直接在生产容器内确认。暂停模块的模型配置也已升级，但访问和生成开关保持关闭。
- embedding 仍采用适合向量检索的模型；暂停模块的独立索引、问答和公开向量接口不能再触发它，保留日报的内部检索继续可用。
- 单元测试用会报错的模型/网络/embedding mock 验证直接生成函数，确认暂停后调用次数为 **0**；没有用真实生成请求测试停用功能。
- 生产 `llm_usage` 在 **2026-09-05T03:26:02.000Z 至 2026-09-05T03:32:58.649Z** 的观测窗口内，暂停模块相关生成调用 **0 次、0 tokens**。这是短窗口内已记录的生成用量，不包含供应商未归集的账单或独立 embedding 账单；embedding 的停止依据是入口守卫与索引任务停用。

[生产模型与暂停策略](feature-pause-evidence-2026-09-04/deployed-policy.json) · [用量观测](feature-pause-evidence-2026-09-04/usage-observation.json)

## 验证结果

| 检查 | 结果 |
|---|---|
| 生产与 staging 最终 API 检查 | 20 个暂停请求全部 403；两环境 `/health` 均 200 |
| 生产匿名/旧格式 token 请求 | 14 个关键入口 × 2 种请求身份，共 28 次，全部 `feature_paused` |
| 生产页面/授权 | 8 个暂停页面或旧参数入口正确重定向；前端 MCP authorize 为 403 |
| 首页与定价页 | 页面 200，渲染的链接中没有暂停功能入口 |
| 生产核心服务 | `/`、`/health`、`/ready` 均 200 |
| 合并线上修复后的后端发布包 | 232 项相关回归通过；最终补充公共 vector 守卫后，60 项相关检查通过（两组有重叠） |
| 前端 | 全量 755 项中 752 项首次通过；3 条旧行为断言更新后，相关 24 项复测全部通过 |
| 构建与静态检查 | 本地及 Vercel 生产构建通过；Python AST 通过；ESLint 0 errors、39 warnings |

[最终双环境检查](feature-pause-evidence-2026-09-04/final-production-and-staging.json) · [页面与定时任务 no-op 验证](feature-pause-evidence-2026-09-04/frontend-and-dispatcher.json)

## 发布记录与后续维护

- Vercel：`dpl_7Y4bW2PzG2HSmJxouxNcBrwZgmny`，已 promote 到正式域名。
- Railway production：`aa9fcfd7-7606-460d-935f-34902682146e`，SUCCESS。
- Railway staging：`00f23062-ca99-45ff-9646-1efc0d22a143`，SUCCESS。
- 已更新的 Edge Functions：`cron-trigger`、`picker-conversations`。
- 首次 Railway 构建因发布包缺少配置要求的 `backend/` 目录而失败；旧服务保持运行。修复包结构后重发成功。

发布前发现线上与本地有差异。本次发布以线上代码为底，合入模型升级与暂停改动，保留了线上 Langfuse、数据库连接恢复、支付查询与研究流式响应修复。生产 `llm-usage` 的 RPC 版本已包含 cached/thoughts 字段，**没有用本地较早版本覆盖它**。

**本地 checkout 不等于此次完整线上基线。** 为避免覆盖工作区已有改动，没有把所有线上差异反向覆盖本地。后续发布应先整合下面的冻结源码包，尤其不要直接部署本地较早的 `llm-usage.js`。本次没有执行 Git 操作、提交或推送。

2026-09-22 更新：投研助手已恢复 Frank / Serenity persona，研究室继续暂停。当前线上源码与最新冻结包见[本次恢复发布记录](persona-chat-restoration-2026-09-22.md)，后续发布请使用该更新后的基线。

- [完整发布源码快照](/Users/kedeng/projects/stock-agent/.codex/artifacts/feature-pause-2026-09-04/release-source.tar.gz)：位于已忽略的 `.codex/artifacts`；不含 `.env`、服务密钥或数据库备份。
- [SHA-256 与文件清单](feature-pause-evidence-2026-09-04/release-manifest.json)
- [部署状态](feature-pause-evidence-2026-09-04/deployments.json)

## 恢复步骤

1. 明确要恢复哪项功能，修改 backend `core/feature_pause.py` 与 frontend `lib/feature-pause.ts` 对应项，保留其余暂停项。
2. 从本次发布基线合入改动，检查访问、模型、embedding 和计量，再发布。不要直接回滚旧部署，否则会连带回退模型升级和线上修复。
3. 只有需要自动产出时，才开启对应 schedule；MCP 独立服务恢复需重新部署其原服务配置。
4. 对历史会话、缓存和授权做兼容检查；不需要重建或删除用户数据。
