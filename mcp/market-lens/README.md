# Market Lens MCP

Market Lens MCP 是一个本地 stdio MCP adapter，用来把用户自己的 Agent
连接到 TheMarketBrew 的 backend lens engine。当前默认 persona 是
`qinbafrank`，后续可以扩展更多投资博主、分析师或方法论 lens。

本地包不包含完整方法论资产。它只负责暴露 MCP tools、读取 backend URL、
调用 backend，并把 backend 返回的 context pack 交给用户自己的 Agent。

```text
用户自己的 Agent / MCP Client
  -> market-lens-mcp 本地 adapter
  -> TheMarketBrew backend
  -> persona evidence / market data / workflow context
  -> 用户 Agent 自己生成最终回答
```

## 给第一次使用 MCP 的用户

MCP 可以理解成一组给 AI 客户端使用的外部工具。你把 Market Lens MCP
配置到自己的 AI 客户端后，客户端就可以调用 Market Lens tools，从
TheMarketBrew backend 获取 persona 历史证据、市场数据和 workflow context。

你需要准备两样东西：

1. 一个支持 MCP 的 AI 客户端，例如 Codex、Claude Code、Claude Desktop、Cursor 等。
2. 电脑上已经安装 Node.js。可以在终端运行 `node -v` 检查。

## 让你的 Agent 自动安装

如果你正在使用 Codex、Claude Code、Cursor 或其他 coding agent，最简单的方式是
直接把下面这段 prompt 发给它。Agent 会根据你当前使用的客户端选择安装方式。

```text
请帮我安装 Market Lens MCP。

配置要求：
- MCP server 名称：market-lens
- NPM 包：@themarketbrew/market-lens-mcp
- 启动命令：npx -y @themarketbrew/market-lens-mcp
- MARKET_LENS_BACKEND_URL=https://stock-agent-production.up.railway.app/api
- MARKET_LENS_PERSONA=qinbafrank

请根据当前环境选择安装方式：
1. 如果是 Codex，优先使用 `codex mcp add market-lens ...`。
2. 如果是 Claude Code，优先使用 `claude mcp add market-lens -s user ...`。
3. 如果是 Claude Desktop，请写入 Claude Desktop 的 MCP 配置文件：
   - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
   - Windows: %APPDATA%\Claude\claude_desktop_config.json
4. 如果是 Cursor，请写入 ~/.cursor/mcp.json。

安装后请验证：
- MCP 配置里 command 是 npx
- args 是 ["-y", "@themarketbrew/market-lens-mcp"]
- env 包含 MARKET_LENS_BACKEND_URL；MARKET_LENS_PERSONA 可选
- 如果当前客户端已经能刷新 MCP，请调用 market_lens_status 检查连接
- 如果不能刷新，请告诉我需要重启客户端，然后让我重启后调用 market_lens_status
```

## 手动一行安装

所有命令都使用 `npx -y @themarketbrew/market-lens-mcp`，不需要提前全局安装 NPM 包。

### Codex

```bash
codex mcp add market-lens --env MARKET_LENS_BACKEND_URL=https://stock-agent-production.up.railway.app/api --env MARKET_LENS_PERSONA=qinbafrank -- npx -y @themarketbrew/market-lens-mcp
```

### Claude Code

```bash
claude mcp add market-lens -s user -e MARKET_LENS_BACKEND_URL=https://stock-agent-production.up.railway.app/api -e MARKET_LENS_PERSONA=qinbafrank -- npx -y @themarketbrew/market-lens-mcp
```

### Claude Desktop

```bash
node -e 'const fs=require("fs"),os=require("os"),path=require("path");const file=process.platform==="win32"?path.join(process.env.APPDATA,"Claude","claude_desktop_config.json"):path.join(os.homedir(),"Library/Application Support/Claude/claude_desktop_config.json");fs.mkdirSync(path.dirname(file),{recursive:true});const cfg=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")||"{}"):{};cfg.mcpServers={...(cfg.mcpServers||{}),"market-lens":{command:"npx",args:["-y","@themarketbrew/market-lens-mcp"],env:{MARKET_LENS_BACKEND_URL:"https://stock-agent-production.up.railway.app/api",MARKET_LENS_PERSONA:"qinbafrank"}}};fs.writeFileSync(file,JSON.stringify(cfg,null,2)+"\n");console.log("Installed market-lens in "+file);'
```

重启 Claude Desktop 后生效。

### Cursor

```bash
node -e 'const fs=require("fs"),os=require("os"),path=require("path");const file=path.join(os.homedir(),".cursor","mcp.json");fs.mkdirSync(path.dirname(file),{recursive:true});const cfg=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")||"{}"):{};cfg.mcpServers={...(cfg.mcpServers||{}),"market-lens":{command:"npx",args:["-y","@themarketbrew/market-lens-mcp"],env:{MARKET_LENS_BACKEND_URL:"https://stock-agent-production.up.railway.app/api",MARKET_LENS_PERSONA:"qinbafrank"}}};fs.writeFileSync(file,JSON.stringify(cfg,null,2)+"\n");console.log("Installed market-lens in "+file);'
```

重启 Cursor 后，在 MCP tools 列表里启用 `market-lens`。

安装后，你可以先问：

```text
请调用 market_lens_status 检查 Market Lens MCP 是否已经连接成功。
```

如果连接成功，你会看到 adapter/backend 状态、当前 persona 和可用工具列表。

### 手动配置备用

如果你的 MCP 客户端需要手动编辑 JSON，可以使用这段配置：

```json
{
  "mcpServers": {
    "market-lens": {
      "command": "npx",
      "args": ["-y", "@themarketbrew/market-lens-mcp"],
      "env": {
        "MARKET_LENS_BACKEND_URL": "https://stock-agent-production.up.railway.app/api",
        "MARKET_LENS_PERSONA": "qinbafrank"
      }
    }
  }
}
```

## 全局安装方式

通常不需要全局安装。只有当你的 MCP 客户端不能直接运行 `npx` 时，再用这种方式：

```bash
npm install -g @themarketbrew/market-lens-mcp
```

全局安装后，MCP 配置可以写成：

```json
{
  "mcpServers": {
    "market-lens": {
      "command": "market-lens-mcp",
      "args": [],
      "env": {
        "MARKET_LENS_BACKEND_URL": "https://stock-agent-production.up.railway.app/api",
        "MARKET_LENS_PERSONA": "qinbafrank"
      }
    }
  }
}
```

所有 tools 都通过 backend URL 调用。

旧版 `FRANK_LENS_BACKEND_URL`、`FRANK_LENS_PERSONA` 仍然被兼容读取，但新配置建议使用
`MARKET_LENS_*`。

## 从本地包测试

如果你拿到的是本地源码，而不是 NPM 上的包，可以这样安装：

```bash
cd /Users/kedeng/projects/stock-agent/mcp/market-lens
npm install
npm run build
npm install -g .
```

然后使用上面的全局安装配置。

## Tools

主工具是 persona-neutral 的 `market_lens_*`，通过 `persona` 参数切换博主：

- `market_lens_status` — 检查 adapter/backend/persona 状态。
- `market_lens_personas` — 列出可用 persona、蒸馏物料层级数量和 workflow capability。
- `market_lens_list_lenses` — 返回某个 persona 的 `core/framework/macro/sector/ticker` lens index。
- `market_lens_get_lens` — 返回单个 lens 的完整蒸馏 markdown、parsed sections、metadata 和 Evidence Map tweet IDs。
- `market_lens_search_lenses` — 在全部蒸馏物料里搜索 topic/rule/ticker/phrase，用来找到 lens ID。
- `market_lens_search_evidence` — 语义检索历史推文 evidence chunks。
- `market_lens_get_evidence_by_ids` — 根据 `market_lens_get_lens` 返回的 Evidence Map tweet IDs 取原始推文。
- `market_lens_build_context` — 对开放问题构建 evidence + market facts + methodology summary。
- `market_lens_stock_diagnosis` — 个股诊断 context pack。
- `market_lens_market_regime` — 市场/宏观环境 context pack。
- `market_lens_compare` — 多标的比较 context pack。
- `market_lens_research_memo` — 深度 memo context pack。

兼容别名仍保留一到两个 minor version，固定 `persona=qinbafrank`：

- `frank_status`
- `frank_search_evidence`
- `frank_stock_diagnosis`
- `frank_market_regime`
- `frank_compare`
- `frank_research_memo`

所有 workflow tools 返回 context pack，不直接替用户写最终答案。调用方 Agent
应使用返回的 `kol_chunks`、`market_context`、`methodology_context`、
`answer_discipline` 和 `suggested_answer_shape` 组织最终回答。
Material tools 返回蒸馏物料 context；Evidence tools 返回历史推文 context。

## 示例调用

### 判断股票

```json
{
  "persona": "qinbafrank",
  "question": "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
  "ticker": "NVDA",
  "evidence_limit": 6,
  "include_market_data": true
}
```

### 判断市场行情

```json
{
  "persona": "qinbafrank",
  "question": "按 Frank 框架判断当前市场行情。",
  "evidence_limit": 6,
  "include_market_data": true
}
```

### 比较标的

```json
{
  "persona": "qinbafrank",
  "question": "NVDA 和 AVGO 只能留一只，按 Frank 框架怎么选？",
  "tickers": ["NVDA", "AVGO"],
  "evidence_limit": 6,
  "include_market_data": true
}
```

### 检索历史证据

```json
{
  "persona": "qinbafrank",
  "query": "NVDA AI capex RPO 打脸条件",
  "k": 5
}
```

### 检索蒸馏物料

```json
{
  "persona": "qinbafrank",
  "query": "Veto 打脸条件",
  "lens_types": ["core", "framework", "sector"],
  "limit": 5
}
```

### 获取完整 lens

```json
{
  "persona": "qinbafrank",
  "lens_type": "ticker",
  "lens_id": "NVDA"
}
```

## 本地验证

```bash
cd /Users/kedeng/projects/stock-agent/mcp/market-lens
npm run build
npm run inspect
npm run smoke
npm run smoke:adapter
```

确认发布包不包含本地 assets：

```bash
npm pack --dry-run
```

## Live 验证

先启动 backend：

```bash
cd /Users/kedeng/projects/stock-agent/backend
set -a
source /Users/kedeng/projects/stock-agent/backend/.env
set +a
/Users/kedeng/projects/stock-agent/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

再运行：

```bash
MARKET_LENS_BACKEND_URL=http://127.0.0.1:8000/api \
npm run smoke:live
```

## 安全边界

- 不冒充 qinbafrank。
- 只有返回的 `kol_chunks` 可以被称为历史证据。
- 区分历史证据、实时市场数据、方法论推断。
- 不给直接买入、卖出、加仓、减仓指令。
- 不输出精确目标价。
