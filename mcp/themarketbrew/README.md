# TheMarketBrew MCP

TheMarketBrew MCP 让你的 AI 客户端可以通过 MCP 调用 TheMarketBrew 的市场投研引擎。它的核心用途不是“查一个股票资料”，而是让你的 Agent 能透过不同博主的理论、证据和方法论来做公开股票市场研究。

本地 NPM 包只是一个很薄的 stdio adapter，不包含完整蒸馏资产。它负责连接 TheMarketBrew backend，拿到 context pack，再交给你的 Agent 生成最终回答。

```text
你的 AI 客户端
  -> TheMarketBrew MCP adapter
  -> TheMarketBrew backend
  -> persona 方法论 + 历史证据 + 市场数据
  -> 你的 Agent 生成最终投研回答
```

## 可以用来做什么

TheMarketBrew MCP 的作用，是给你的 Agent 一个具体的市场研究镜头，而不是只靠通用金融提示词。

- **用某个 persona 的框架分析个股。** 让 Agent 先看这个 persona 会先检查什么，历史上怎么看，当前事实是在支持还是削弱 thesis，以及什么信号会推翻原判断。
- **研究板块或主题。** 把一个主题拆成产业链层级、物理瓶颈、受益标的、风险点和后续验证问题。
- **比较多个标的。** 用同一套方法论比较几只股票，而不是只做通用估值对比。
- **解读市场新闻。** 把产品发布、财报、政策、供应链消息或宏观事件，转成对不同板块和标的的潜在影响。
- **生成研究 memo。** 组合 persona 方法论、历史证据、实时市场数据和回答纪律，让 Agent 写出结构更完整的研究备忘录。
- **检索历史证据。** 搜索 persona 历史观点，并在需要直接归因时取回原始 Evidence Map 内容。

可用 persona 由 backend 暴露。Agent 应该先查看可用 persona 和物料覆盖情况，再根据用户问题选择合适的 persona；每次工具调用都可以通过 `persona` 参数显式切换。

## 使用要求

- 一个支持 MCP 的客户端，例如 Claude Code、Codex、Claude Desktop、Cursor，或其他 agent runtime。
- Node.js 20 或更高版本。

## 安装

大多数用户不需要全局安装，直接通过 `npx` 启动即可。

### Claude Code

```bash
claude mcp add themarketbrew -s user \
  -e THEMARKETBREW_BACKEND_URL=https://stock-agent-production.up.railway.app/api \
  -- npx -y themarketbrew
```

### Codex

```bash
codex mcp add themarketbrew \
  --env THEMARKETBREW_BACKEND_URL=https://stock-agent-production.up.railway.app/api \
  -- npx -y themarketbrew
```

### 手动 MCP 配置

```json
{
  "mcpServers": {
    "themarketbrew": {
      "command": "npx",
      "args": ["-y", "themarketbrew"],
      "env": {
        "THEMARKETBREW_BACKEND_URL": "https://stock-agent-production.up.railway.app/api"
      }
    }
  }
}
```

通常不要在配置里写死 persona。让 Agent 先调用 `market_lens_personas`，再根据问题和物料覆盖选择 persona。

只有当你希望某个客户端或工作区固定使用一个 persona 时，才加上：

```bash
THEMARKETBREW_PERSONA=qinbafrank
```

或：

```bash
THEMARKETBREW_PERSONA=aleabitoreddit
```

安装后，可以让客户端检查连接：

```text
请调用 market_lens_status，确认 TheMarketBrew MCP 已经连接成功。
```

如果没有配置默认 persona，`market_lens_status` 会返回可用 persona 和路由提示，而不是自动绑定到某一个博主。

## 示例提问

安装 MCP 后，可以直接这样问你的 Agent：

```text
请使用 TheMarketBrew MCP，用当前选择的 persona 框架分析 NVDA。
请区分历史证据、当前市场事实和方法论推断。
```

```text
请使用 aleabitoreddit persona 研究 AI 基建里下一个可能出现的瓶颈。
重点展示研究路径，不要直接给买入清单。
```

```text
请用当前 persona 的方法论比较 NVDA、AVGO 和 MRVL。
它们分别代表 AI capex 链条里的哪个环节？什么变化会改变判断？
```

```text
请在 TheMarketBrew persona materials 里搜索 CPO、silicon photonics 和 optical interconnect。
然后取回最相关的 lens 和 evidence IDs。
```

```text
请针对这条市场新闻生成一份 research memo。
需要结合 persona 历史证据、当前市场数据和可证伪条件。
```

## 工具

主要工具都是 persona-neutral 的 `market_lens_*`：

- `market_lens_status`：检查 adapter/backend 连接状态；未固定 persona 时会返回 persona 路由提示。
- `market_lens_personas`：列出可用 persona 和物料覆盖情况；当用户没有指定 persona 时，应先调用它来选择。
- `market_lens_list_lenses`、`market_lens_get_lens`、`market_lens_search_lenses`：检索蒸馏方法论物料。
- `market_lens_search_evidence`、`market_lens_get_evidence_by_ids`：检索历史证据。
- `market_lens_build_context`、`market_lens_stock_diagnosis`、`market_lens_market_regime`、`market_lens_compare`、`market_lens_research_memo`：返回组合好的投研 context pack。

Workflow tools 返回的是 context，不是最终投资建议。你的 Agent 应该根据返回的 evidence、market facts、methodology context、answer discipline 和 suggested shape 来组织最终回答。

## 本地开发

```bash
cd /Users/kedeng/projects/stock-agent/mcp/themarketbrew
npm install
npm run build
npm run inspect
npm run smoke
```

如果要连接本地 backend：

```bash
THEMARKETBREW_BACKEND_URL=http://127.0.0.1:8000/api npm run smoke:live
```

## 安全边界

- 不冒充任何 persona 本人。
- 把返回的历史帖子当作证据，而不是交易指令。
- 区分历史证据、当前市场数据和方法论推断。
- 不把 context pack 包装成直接买入、卖出、加仓或减仓指令。
- 不编造精确目标价。
