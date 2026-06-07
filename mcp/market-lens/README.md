# Market Lens MCP

Market Lens MCP 是一个本地 stdio MCP adapter，用来把用户自己的 Agent
连接到 TheMarketBrew 的 backend lens engine。当前默认 persona 是
`qinbafrank`，后续可以扩展更多投资博主、分析师或方法论 lens。

本地包不包含完整方法论资产。它只负责暴露 MCP tools、读取 backend URL
和邀请码、调用 backend，并把 backend 返回的 context pack 交给用户自己的
Agent。

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

你需要准备三样东西：

1. 一个支持 MCP 的 AI 客户端，例如 Codex、Claude Code、Claude Desktop、Cursor 等。
2. 电脑上已经安装 Node.js。可以在终端运行 `node -v` 检查。
3. 一个 Market Lens 内测邀请码，也就是 `MARKET_LENS_INVITE_CODE`。

## 快速开始

发布到 NPM 后，最简单的方式是用 `npx`。这种方式不需要提前全局安装包，
MCP 客户端启动时会自动拉取并运行：

```json
{
  "mcpServers": {
    "market-lens": {
      "command": "npx",
      "args": ["-y", "@themarketbrew/market-lens-mcp"],
      "env": {
        "MARKET_LENS_BACKEND_URL": "https://stock-agent-production.up.railway.app/api",
        "MARKET_LENS_INVITE_CODE": "把你的邀请码填在这里",
        "MARKET_LENS_PERSONA": "qinbafrank"
      }
    }
  }
}
```

重启客户端后，你可以先问：

```text
请调用 frank_status 检查 Market Lens MCP 是否已经连接成功。
```

如果连接成功，你会看到 adapter/backend 状态、当前 persona 和可用工具列表。

## 全局安装方式

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
        "MARKET_LENS_INVITE_CODE": "把你的邀请码填在这里",
        "MARKET_LENS_PERSONA": "qinbafrank"
      }
    }
  }
}
```

内测期免费，但 `frank_search_evidence` 和 workflow tools 需要
`MARKET_LENS_INVITE_CODE`。`frank_status` 可以无邀请码调用。

旧版 `FRANK_LENS_BACKEND_URL`、`FRANK_LENS_INVITE_CODE`、`FRANK_LENS_PERSONA`
仍然被兼容读取，但新配置建议使用 `MARKET_LENS_*`。

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

- `frank_status`
- `frank_search_evidence`
- `frank_stock_diagnosis`
- `frank_market_regime`
- `frank_compare`
- `frank_research_memo`

所有 workflow tools 返回 context pack，不直接替用户写最终答案。调用方 Agent
应使用返回的 `kol_chunks`、`market_context`、`methodology_context`、
`answer_discipline` 和 `suggested_answer_shape` 组织最终回答。

## 示例调用

### 判断股票

```json
{
  "question": "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
  "ticker": "NVDA",
  "evidence_limit": 6,
  "include_market_data": true
}
```

### 判断市场行情

```json
{
  "question": "按 Frank 框架判断当前市场行情。",
  "evidence_limit": 6,
  "include_market_data": true
}
```

### 比较标的

```json
{
  "question": "NVDA 和 AVGO 只能留一只，按 Frank 框架怎么选？",
  "tickers": ["NVDA", "AVGO"],
  "evidence_limit": 6,
  "include_market_data": true
}
```

### 检索历史证据

```json
{
  "query": "NVDA AI capex RPO 打脸条件",
  "k": 5
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
MARKET_LENS_INVITE_CODE=beta_xxx \
npm run smoke:live
```

## 安全边界

- 不冒充 qinbafrank。
- 只有返回的 `kol_chunks` 可以被称为历史证据。
- 区分历史证据、实时市场数据、方法论推断。
- 不给直接买入、卖出、加仓、减仓指令。
- 不输出精确目标价。
