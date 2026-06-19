# TheMarketBrew OKX Context MCP

TheMarketBrew MCP connects an external agent to TheMarketBrew's persona
methodology, historical evidence, and market data.

This package is a thin stdio adapter for the OKX-facing backend surface. It
does not ship methodology assets, does not ask for a TheMarketBrew account, and
does not generate final answers. Your agent calls the tools, receives context
and data, then writes the final analysis with its own model.

```text
Your AI client
  -> TheMarketBrew MCP adapter
  -> /api/okx-mcp/*
  -> persona context + evidence + market data
  -> your agent writes the final answer
```

## Tools

The adapter exposes three tools:

- `themarketbrew_discovery` — free capability discovery: personas, data
  sections, limits, pricing/auth model, and routing guidance.
- `themarketbrew_persona_context` — persona methodology, selected lenses,
  Evidence Map posts, and optional vector evidence for a question.
- `themarketbrew_market_data` — one aggregated data tool for catalog, brief,
  stock sections, market/macro sections, and news.

`persona_context` and `market_data` may return HTTP 402 payloads when the
backend is protected by OKX x402 middleware or reverse proxy. In OKX Agentic
Wallet flows, the wallet should pay and retry automatically.

## Configuration

```text
THEMARKETBREW_BACKEND_URL=https://stock-agent-production.up.railway.app/api
```

`OKX_MCP_BACKEND_URL` and legacy `MARKET_LENS_BACKEND_URL` are also accepted as
fallbacks. The URL must point to the backend `/api` base.

## Install Prompt

Give this to your local agent:

```text
请帮我安装 TheMarketBrew OKX Context MCP。

目标：
- MCP server 名称：themarketbrew
- NPM 包：themarketbrew
- 启动方式：npx -y themarketbrew
- Backend URL：https://stock-agent-production.up.railway.app/api

安装后请验证：
- MCP server 能连接成功。
- tools/list 只暴露 themarketbrew_discovery、themarketbrew_persona_context、themarketbrew_market_data。
- 调用 themarketbrew_discovery 检查 backend 连接和 persona/data capability。

注意：
- 不需要 TheMarketBrew 账号登录。
- 不要索要 TheMarketBrew 密码、cookie 或 token。
- 如果 paid endpoint 返回 402，请把 payment_required payload 保留给 OKX/钱包流程处理。
```

## Example Prompts

```text
请使用 TheMarketBrew MCP 分析 NVDA。
先调用 discovery，再调用 persona_context 和 market_data。
请区分方法论、历史证据、当前市场事实和推断。
```

```text
请比较 NVDA、AVGO 和 MRVL 在 AI capex 链条里的位置。
用 persona_context 找历史框架，用 market_data 补当前估值/财务/新闻。
```

```text
请研究 CPO、silicon photonics 和 optical interconnect。
如果 backend 认为 Serenity/aleabitoreddit 更匹配，可以让它自动选择 persona。
```

## Validation

Run from `mcp/themarketbrew`:

```bash
npm run build
npm run inspect
npm run smoke
npm run smoke:adapter
```

Live backend validation:

```bash
THEMARKETBREW_BACKEND_URL=http://127.0.0.1:8000/api npm run smoke:live
```

## Safety

TheMarketBrew MCP is for market research and context retrieval only. It is not
investment advice, a trading system, or a broker. Do not present historical
persona material as current advice, and do not issue direct buy/sell/add/reduce
instructions or exact price targets.
