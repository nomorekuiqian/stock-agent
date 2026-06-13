# TheMarketBrew MCP

TheMarketBrew MCP 让你的 AI Agent 连接 TheMarketBrew 的市场研究引擎，把
persona 方法论、历史证据、当前市场数据和新闻上下文带进你的本地工作流。

它不是一个“查股价”的小工具，也不是交易信号机器人。它更像一个研究镜头：
帮助你的 Agent 用明确的框架拆解股票、板块、宏观环境和市场新闻，然后由你的
Agent 生成最终分析。

```text
你的 AI 客户端
  -> TheMarketBrew MCP adapter
  -> TheMarketBrew backend
  -> persona 方法论 + 历史证据 + 市场数据
  -> 你的 Agent 生成最终投研回答
```

本地 NPM 包只是一个轻量 stdio adapter。完整方法论资产、Evidence Map、数据工具和
workflow 都在 TheMarketBrew backend。内容、数据和 workflow 工具需要 TheMarketBrew
账号授权；adapter 不会索要或保存你的网页登录密码。

## 适合谁

适合已经在用 AI 做市场研究的人，尤其是：

- 研究美股、财报、行业和宏观的个人投资者。
- 需要快速整理研究材料的研究员或投资团队。
- 关注 AI 基建、半导体、软件、流动性等主题的人。
- 想把 TheMarketBrew 上下文接入 Claude Code、Codex、Cursor 等本地 Agent 的用户。

不适合：

- 想要直接买卖信号的人。
- 想让 Agent 冒充某个 persona 本人发言的人。
- 需要交易执行或实时行情终端的人。
- 不想登录 TheMarketBrew 账号的人。

## 能力概览

普通 AI 投研工具大多是在查数据、总结新闻、套通用分析框架。TheMarketBrew MCP 的区别是：它把你信任的博主框架、博主过去的内容、实时市场数据和新闻放到同一个 Agent 里。

核心能力：

- 用信任的博主框架研究市场。Agent 可以读取这个人的研究方法、行业框架和个股框架，不再只用一套泛泛的 AI 金融模板。
- 实时搜索博主过去的内容。比如这个博主以前怎么看某只股票、某个行业、某个宏观环境，现在都可以被 Agent 查出来。
- 获取最新可用的个股数据。包括报价、公司概况、财务、估值、技术指标、财报日程、历史价格、电话会文字稿、内部人交易和公司新闻。比让模型凭记忆回答可靠得多。
- 获取最新可用的宏观数据。包括市场概览、宏观风险、流动性、市场情绪、经济日历、财报日历、晨报和周报。
- 获取新闻和事件材料。包括个股新闻、市场新闻、公司公告、晨报摘要和社媒摘要，并把新闻和相关股票、行业、主题连起来。
- 把“博主过去怎么想”和“市场现在发生了什么”放在一起看。Agent 可以判断旧框架现在是否还适用，哪些数据在支持，哪些变化可能打脸。

## 安装方式

不要手动复制一堆命令。把下面这段 prompt 发给你的本地 Agent，让它根据当前环境自动安装。

```text
请帮我安装 TheMarketBrew MCP。

目标：
- MCP server 名称：themarketbrew
- NPM 包：themarketbrew
- 启动方式：npx -y themarketbrew
- Backend URL：https://stock-agent-production.up.railway.app/api
- 不要默认写死 persona；让 Agent 登录后先调用 market_lens_personas 再选择 persona

请根据当前客户端自动选择安装方式：
1. 如果是 Claude Code，请用 Claude Code 的 MCP 配置方式安装。
2. 如果是 Codex，请用 Codex 的 MCP 配置方式安装。
3. 如果是 Claude Desktop，请写入 Claude Desktop 的 MCP 配置文件。
4. 如果是 Cursor，请写入 Cursor 的 MCP 配置文件。
5. 如果当前环境不支持自动写配置，请告诉我需要修改哪个 MCP 配置文件，并给出完整配置内容。

安装后请验证：
- MCP server 能连接成功。
- 调用 market_lens_status 检查 backend 连接。
- 如果需要登录，请调用 market_lens_login，给我 verification_url 和 user_code。
- 我在浏览器里登录 TheMarketBrew 并批准后，请调用 market_lens_auth_status 完成 token 写入。
- 登录完成后，请调用 market_lens_data_catalog，确认内容和数据工具可用。

注意：
- 不要向我索要 TheMarketBrew 密码。
- 不要复制浏览器 cookie 到 MCP 配置。
- 不要把 persona 写死在默认配置里，除非我明确要求。
```

安装完成后，你可以这样让 Agent 检查：

```text
请调用 TheMarketBrew MCP 的 market_lens_status，确认连接状态。
如果还没登录，请启动登录流程。
```

## 登录和 token

内容、数据和 workflow 工具要求 TheMarketBrew 账号。

登录流程是 browser/device flow：

1. Agent 调用 `market_lens_login`。
2. MCP 返回 `verification_url` 和 `user_code`。
3. 你在浏览器里打开链接，用 TheMarketBrew 账号登录并批准授权。
4. Agent 调用 `market_lens_auth_status`。
5. MCP adapter 把 opaque token 存到本地 auth 文件里。

adapter 不保存你的网页登录密码。token 会保存在本机，默认路径是：

```text
~/.themarketbrew/mcp-auth.json
```

当前 token 有效期是 30 天。过期、撤销、删除 auth 文件或切换 backend 后，需要重新登录。

## 可以直接这样问

安装并登录后，可以把这些 prompt 发给你的 Agent：

```text
请使用 TheMarketBrew MCP，用 qinbafrank persona 分析 NVDA。
请区分历史证据、当前市场事实和方法论推断。
```

```text
请使用 TheMarketBrew MCP，比较 NVDA、AVGO 和 MRVL。
它们分别代表 AI capex 链条里的哪个环节？什么变化会改变判断？
```

```text
请使用 aleabitoreddit persona 研究 CPO、silicon photonics 和 optical interconnect。
重点展示产业链瓶颈、受益环节和需要继续验证的数据。
```

```text
请针对这条市场新闻生成一份 research memo。
需要结合 persona 历史证据、当前市场数据和可证伪条件。
```

```text
请先调用 market_lens_data_catalog，然后告诉我 stock、market、news 这几类工具分别能查什么。
```

## 免责声明

TheMarketBrew MCP 只用于市场研究和信息整理，不构成投资建议、交易建议或财务顾问服务。

你需要自己判断所有输出。市场数据、新闻、历史内容和 AI 分析都可能存在延迟、遗漏或错误。博主过去的观点也只是历史材料，不代表当前建议。

TheMarketBrew MCP 不是交易终端，不提供下单、持仓管理或实时行情保证。任何投资决策和交易后果都由用户自行承担。

不要把 TheMarketBrew 账号密码、浏览器 cookie 或 private token 写进 MCP 配置。
