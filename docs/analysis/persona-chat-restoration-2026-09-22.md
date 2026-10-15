# 投研助手 persona 恢复与发布（2026-09-22）

`/research` 已恢复 Frank（`qinbafrank`）和 Serenity（`aleabitoreddit`）视角，包括各自的蒸馏 Skills、流式聊天和历史对话。用户要求本地验证后发布，已执行。

## 恢复边界

- 新的 `kol_chat` 入口只允许这两个 persona；`kol_research` 仍表示暂停的博主研究室。
- `/kol/*` 继续重定向到 `/research`，研究室的数据接口继续返回 `feature_paused`。
- Panda、MCP、Research-KB、索引及原暂停任务维持原状，没有修改定时任务或 Edge Functions。
- 登录、共享投研额度和会话归属检查继续生效；未知、缺失或冲突的 persona 元数据保持拒绝。

## 验证

- 实际发布源码包：后端 173 项、前端 99 项相关测试通过，生产构建通过。
- Skill 测试使用真实 ADK `ToolContext` 后补测 27 项通过；云端新版 ADK 需要 invocation context，简单 mock context 不足以运行加载器。
- 生产容器实际加载两位 persona 的 `ticker-nvda`，确认内容分别等于其自身资料；Frank 有 48 个 lens，Serenity 有 52 个。
- 生产 `/`、`/health`、`/ready` 均为 200；恢复的 persona 和历史接口匿名请求为 401；暂停接口为 403。
- 正式网站浏览器确认菜单显示 Frank / Serenity，切换后 URL 与视角正确；访问 `/kol/qinbafrank` 回到 `/research`。
- 未进行付费模型答案质量测试，未创建真实用户对话、触发邮件或写入业务数据。

## 发布与源码基线

- Railway production：`1bfdd20b-6471-44b4-ad67-d47ae9d0936c`，SUCCESS。
- Vercel：`dpl_vDYUPisf1WmJD9Q7PBMTByXSYw4j`，READY，已 promote 到 `https://www.themarketbrew.com`。
- 后端基于此前生产部署 `e11659a5-8bf3-44dd-b067-b5e66a852ddf`；前端基于 `dpl_7Y4bW2PzG2HSmJxouxNcBrwZgmny`。后端逐文件哈希核验了冻结快照与生产的对应关系，只加入本次五个运行文件；前端只加入三个运行文件。
- 保留线上 Langfuse、流式响应、数据库和模型修复。工作区存在其他未提交改动，本次采用独立发布包，没有提交或推送 Git。
- **后续部署应从本次发布快照开始，而不是直接上传当前 checkout 或九月初的旧快照。** 当前 checkout 仍不等于完整线上基线。

本次完整源码包（不含环境变量、密钥和构建输出）：

- [发布源码](../../.codex/artifacts/persona-chat-2026-09-22/release-source.tar.gz)
- [文件哈希](../../.codex/artifacts/persona-chat-2026-09-22/release-manifest.json)
- [本次功能补丁](../../.codex/artifacts/persona-chat-2026-09-22/persona-restoration.patch)
- [上线验证](../../.codex/artifacts/persona-chat-2026-09-22/deployment-verification.json)

这些文件保存在仓库已忽略的 `.codex/artifacts/`，用于保持线上版本可追溯。
