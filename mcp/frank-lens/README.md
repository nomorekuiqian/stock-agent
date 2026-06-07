# Frank Lens MCP

Frank Lens MCP 是一个本地 stdio MCP adapter，用来把用户自己的 Agent
连接到 TheMarketBrew 的 Frank Lens backend。

本地包不包含完整 qinbafrank 方法论资产。它只负责暴露 MCP tools、读取
backend URL 和邀请码、调用 backend，并把 backend 返回的 context pack 交给
用户自己的 Agent。

```text
用户自己的 Agent / MCP Client
  -> frank-lens-mcp 本地进程
  -> TheMarketBrew backend
  -> Frank evidence / market data / workflow context
  -> 用户 Agent 自己生成最终回答
```

## 安装

```bash
npm install -g @themarketbrew/frank-lens-mcp
```

如果从当前仓库安装：

```bash
cd /Users/kedeng/projects/stock-agent-frank-mcp/mcp/frank-lens
npm install
npm run build
npm install -g .
```

## MCP Client 配置

```json
{
  "mcpServers": {
    "frank-lens": {
      "command": "frank-lens-mcp",
      "args": [],
      "env": {
        "FRANK_LENS_BACKEND_URL": "https://stock-agent-production.up.railway.app/api",
        "FRANK_LENS_INVITE_CODE": "beta_xxx",
        "FRANK_LENS_PERSONA": "qinbafrank"
      }
    }
  }
}
```

内测期免费，但 `frank_search_evidence` 和 workflow tools 需要
`FRANK_LENS_INVITE_CODE`。`frank_status` 可以无邀请码调用。

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
cd /Users/kedeng/projects/stock-agent-frank-mcp/mcp/frank-lens
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
cd /Users/kedeng/projects/stock-agent-frank-mcp/backend
set -a
source /Users/kedeng/projects/stock-agent/backend/.env
set +a
/Users/kedeng/projects/stock-agent/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

再运行：

```bash
FRANK_LENS_BACKEND_URL=http://127.0.0.1:8000/api \
FRANK_LENS_INVITE_CODE=beta_xxx \
npm run smoke:live
```

## 安全边界

- 不冒充 qinbafrank。
- 只有返回的 `kol_chunks` 可以被称为历史证据。
- 区分历史证据、实时市场数据、方法论推断。
- 不给直接买入、卖出、加仓、减仓指令。
- 不输出精确目标价。
