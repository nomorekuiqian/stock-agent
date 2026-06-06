# Frank Lens MCP

Frank Lens MCP 位于：

```text
mcp/frank-lens/
```

主要用户安装指南：

```text
mcp/frank-lens/README.md
```

## 产品形态

这个 package 是 qinbafrank 方法论和 KOL 投研上下文的 MCP adapter，不是独立聊天 Agent。

```text
用户 Agent -> Frank Lens MCP -> methodology / vector evidence / market brief / workflow briefing
```

用户自己的 Agent 使用自己的模型和 token 生成最终回答。MCP 返回 context pack 或 narrative briefing，不代表 qinbafrank 本人发言，也不构成投资建议。

## 两种模式

### Offline

Offline 工具只读取打包在 package 内的 markdown 方法论资产，不需要 backend、数据库或 API key：

- `frank_list_lenses`
- `frank_get_methodology`
- `frank_search_evidence`
- `frank_get_ticker_lens`
- `frank_get_sector_lens`
- `frank_build_context`
- `frank_stock_diagnosis`
- `frank_market_regime`

打包资产来自：

```text
backend/app/features/twitter/methodologies/qinbafrank/
```

当前覆盖：

- `core`: 1
- `framework`: 6
- `macro`: 1
- `sector`: 7
- `ticker`: 33

### Live

Live 工具通过 `FRANK_LENS_BACKEND_URL` 调用 Stock Agent backend。默认地址：

```text
http://127.0.0.1:8000/api
```

Live 工具：

- `frank_live_status`
- `frank_live_search_evidence`
- `frank_live_market_brief`
- `frank_live_build_context`
- `frank_live_stock_diagnosis`
- `frank_live_market_regime`
- `frank_live_chat`

Live backend endpoints：

```text
GET  /api/kol_research/personas/{username}/profile
POST /api/kol_research/personas/{username}/mcp/search
POST /api/kol_research/personas/{username}/mcp/market-brief
POST /api/kol_research/personas/{username}/mcp/context
POST /api/kol_research/chat
```

`frank_live_chat` 需要 `FRANK_LENS_BEARER_TOKEN`，因为 `/api/kol_research/chat` 是用户认证 endpoint。其他 live context endpoints 是 public read MVP，但正式化前应接入 auth、rate limit 和 usage metering。

## MVP Workflows

当前优先做两个 workflow：

- 判断股票：`frank_stock_diagnosis` / `frank_live_stock_diagnosis`
- 判断市场行情：`frank_market_regime` / `frank_live_market_regime`

这两个 workflow 返回 markdown briefing，而不是结构化 context schema。它们只负责给下游 Agent 提供 Frank 方法论视角、证据线索、实时数据摘要和回答边界；最终 Agent 可以自由组织表达。

结构化上下文仍由 `frank_build_context` / `frank_live_build_context` 提供，适合需要机器可读字段的调用方。

## 本地运行

先启动 backend：

```bash
cd /Users/kedeng/projects/stock-agent-frank-mcp/backend
set -a
source /Users/kedeng/projects/stock-agent/backend/.env
set +a
/Users/kedeng/projects/stock-agent/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

再构建和验证 MCP：

```bash
cd /Users/kedeng/projects/stock-agent-frank-mcp/mcp/frank-lens
npm install
npm run build
npm run inspect
npm run smoke
FRANK_LENS_BACKEND_URL=http://127.0.0.1:8000/api npm run smoke:live
```

模拟用户安装：

```bash
npm pack
TMP_PREFIX=/tmp/frank-lens-mcp-install
rm -rf "$TMP_PREFIX"
npm install --prefix "$TMP_PREFIX" -g ./themarketbrew-frank-lens-mcp-0.2.0.tgz
FRANK_LENS_MCP_BIN="$TMP_PREFIX/bin/frank-lens-mcp" npm run smoke
FRANK_LENS_BACKEND_URL=http://127.0.0.1:8000/api \
  FRANK_LENS_MCP_BIN="$TMP_PREFIX/bin/frank-lens-mcp" \
  npm run smoke:live
```

## 数据来源

- Offline search: 本地 markdown 方法论和 Evidence Map tweet IDs。
- Live vector evidence: backend `vector_chunks`，过滤 `source_type=kol_tweet` 和 `metadata.author_username=username`。
- Live market brief: 复用 `shared.data_tools.briefs`。stock / peer / industry 主要来自 FMP；macro brief 读取后端宏观缓存，该缓存由现有 FRED/FMP 数据管道维护。

## 安全约束

- 不要 impersonate qinbafrank。
- 只有返回的 evidence IDs / chunks 可以被称为历史证据。
- 区分历史证据、实时市场数据和方法论推断。
- 不给直接买入、卖出、加仓、减仓指令。
- 不输出精确目标价。
