# Market Lens MCP

Market Lens MCP 位于：

```text
mcp/market-lens/
```

## 产品形态

当前采用 backend-first beta 形态：

```text
用户 Agent
  -> 本地 NPM MCP adapter
  -> TheMarketBrew backend
  -> persona workflow engine / assets / vector DB / market data
  -> context pack
  -> 用户 Agent 自己写最终回答
```

本地 NPM 包只是薄 adapter，不再打包完整 persona 蒸馏资产。核心 assets、
ticker/sector playbook、Evidence Map、workflow、usage logging 和未来付费能力
都在 backend。当前默认 persona 是 `qinbafrank`。

## 用户安装

```bash
npm install -g @themarketbrew/market-lens-mcp
```

MCP Client 配置：

```json
{
  "mcpServers": {
    "market-lens": {
      "command": "market-lens-mcp",
      "args": [],
      "env": {
        "MARKET_LENS_BACKEND_URL": "https://stock-agent-production.up.railway.app/api",
        "MARKET_LENS_INVITE_CODE": "beta_xxx",
        "MARKET_LENS_PERSONA": "qinbafrank"
      }
    }
  }
}
```

内测期免费，但 workflow/evidence 工具需要邀请码。邀请码存储在 Insforge
`frank_lens_invites` table，通过 `frank-lens-beta` Edge Function 校验。
`FRANK_LENS_*` env 仍作为兼容 fallback，但新配置使用 `MARKET_LENS_*`。

## Tools

对用户暴露稳定工具名，不再区分本地/远程双模式：

- `frank_status`
- `frank_search_evidence`
- `frank_stock_diagnosis`
- `frank_market_regime`
- `frank_compare`
- `frank_research_memo`

`frank_status` 可以无邀请码调用，用来检查 adapter/backend 状态。其他工具需要
`MARKET_LENS_INVITE_CODE`。

## Backend Endpoints

```text
GET  /api/kol_research/personas/{username}/mcp/status
POST /api/kol_research/personas/{username}/mcp/search
POST /api/kol_research/personas/{username}/mcp/market-brief
POST /api/kol_research/personas/{username}/mcp/context
POST /api/kol_research/personas/{username}/mcp/workflow
```

`/mcp/workflow` 支持：

- `stock_diagnosis`
- `market_regime`
- `compare`
- `research_memo`

这些 workflow 返回 context pack，不返回最终答案。用户自己的 Agent 使用自己的
模型和 token 生成最终回答。

## P0 非目标

- 不发布完整本地 methodology package。
- 不做 share page。
- 不接 billing。
- 不主推 backend `/frank/mcp/` FastMCP remote URL。

## 验证

```bash
cd /Users/kedeng/projects/stock-agent/mcp/market-lens
npm run build
npm run inspect
npm run smoke
npm run smoke:adapter
npm pack --dry-run
```

Live smoke：

```bash
MARKET_LENS_BACKEND_URL=http://127.0.0.1:8000/api \
MARKET_LENS_INVITE_CODE=beta_xxx \
npm run smoke:live
```

## 安全约束

- 不要 impersonate qinbafrank。
- 只有返回的 `kol_chunks` 可以被称为历史证据。
- 区分历史证据、实时市场数据和方法论推断。
- 不给直接买入、卖出、加仓、减仓指令。
- 不输出精确目标价。
