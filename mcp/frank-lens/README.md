# Frank Lens MCP

Frank Lens MCP 是一个可安装的 MCP server，用来把 qinbafrank 的方法论、证据检索和市场数据上下文开放给用户自己的 Agent。

它有两种运行模式：

- `offline`: 只读取 package 里打包好的 Frank 方法论 markdown。无需 backend、无需数据库、无需 API key。
- `live`: 通过 `FRANK_LENS_BACKEND_URL` 调用 Stock Agent backend，实时检索 `vector_chunks` 里的 Frank 推文证据，并复用网站 KOL agent 的 stock / peer / industry / macro brief tools。

最终回答仍由用户自己的 Agent 使用自己的模型和 token 生成。本 MCP 返回的是 context pack 或 narrative briefing，不是 qinbafrank 本人发言，也不构成投资建议。

## 基本原理

MCP server 本质上是一个通过 stdio 收发 JSON-RPC 的工具进程：

```text
用户自己的 Agent / MCP Client
  -> 启动 frank-lens-mcp 进程
  -> 发送 tools/list 和 tools/call
  -> MCP 返回 Frank methodology / vector evidence / market brief / workflow briefing
  -> 用户 Agent 用自己的模型生成最终回答
```

所以 `frank-lens-mcp` 不是普通 CLI。你直接运行它时，它会等待 stdin 里的 MCP JSON-RPC 消息，不会显示常规 help 页面。

## 是否需要本地 backend

如果只使用离线工具，不需要：

- `frank_list_lenses`
- `frank_get_methodology`
- `frank_search_evidence`
- `frank_get_ticker_lens`
- `frank_get_sector_lens`
- `frank_build_context`
- `frank_stock_diagnosis`
- `frank_market_regime`

如果使用 live 工具，需要本地或远端 backend：

- `frank_live_status`
- `frank_live_search_evidence`
- `frank_live_market_brief`
- `frank_live_build_context`
- `frank_live_stock_diagnosis`
- `frank_live_market_regime`

默认 backend 地址是：

```text
http://127.0.0.1:8000/api
```

可以通过环境变量覆盖：

```bash
export FRANK_LENS_BACKEND_URL=http://127.0.0.1:8000/api
export FRANK_LENS_PERSONA=qinbafrank
```

## 从当前仓库安装

```bash
cd /Users/kedeng/projects/stock-agent-frank-mcp/mcp/frank-lens
npm install
npm run build
npm install -g .
```

确认 binary 已存在：

```bash
which frank-lens-mcp
```

## 从 tarball 安装

这种方式最接近发布后的用户安装流程。

```bash
cd /Users/kedeng/projects/stock-agent-frank-mcp/mcp/frank-lens
npm pack
npm install -g ./themarketbrew-frank-lens-mcp-0.2.0.tgz
```

如果只想临时安装到 `/tmp`：

```bash
TMP_PREFIX=/tmp/frank-lens-mcp-install
rm -rf "$TMP_PREFIX"
npm install --prefix "$TMP_PREFIX" -g ./themarketbrew-frank-lens-mcp-0.2.0.tgz
```

## MCP Client 配置

如果已经全局安装：

```json
{
  "mcpServers": {
    "frank-lens": {
      "command": "frank-lens-mcp",
      "args": [],
      "env": {
        "FRANK_LENS_BACKEND_URL": "http://127.0.0.1:8000/api",
        "FRANK_LENS_PERSONA": "qinbafrank"
      }
    }
  }
}
```

如果不想全局安装，可以直接指向构建后的文件：

```json
{
  "mcpServers": {
    "frank-lens": {
      "command": "node",
      "args": [
        "/Users/kedeng/projects/stock-agent-frank-mcp/mcp/frank-lens/dist/index.js"
      ],
      "env": {
        "FRANK_LENS_BACKEND_URL": "http://127.0.0.1:8000/api",
        "FRANK_LENS_PERSONA": "qinbafrank"
      }
    }
  }
}
```

修改 MCP Client 配置后，需要重启客户端。

## 本地启动 backend

live 模式需要 backend 已经能访问数据库、FMP/FRED/OpenAI 等环境变量。当前 worktree 没有自己的 `backend/venv` 时，可以复用原项目 venv。

在项目根目录运行：

```bash
cd /Users/kedeng/projects/stock-agent-frank-mcp/backend
set -a
source /Users/kedeng/projects/stock-agent/backend/.env
set +a
/Users/kedeng/projects/stock-agent/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

确认 backend 已启动：

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/kol_research/personas/qinbafrank/profile
```

## 验证安装

源码目录里的离线检查：

```bash
cd /Users/kedeng/projects/stock-agent-frank-mcp/mcp/frank-lens
npm run build
npm run inspect
npm run smoke
```

源码目录里的 live 检查：

```bash
FRANK_LENS_BACKEND_URL=http://127.0.0.1:8000/api npm run smoke:live
```

验证已经安装好的 binary：

```bash
FRANK_LENS_MCP_BIN="$(npm prefix -g)/bin/frank-lens-mcp" npm run smoke
FRANK_LENS_BACKEND_URL=http://127.0.0.1:8000/api \
  FRANK_LENS_MCP_BIN="$(npm prefix -g)/bin/frank-lens-mcp" \
  npm run smoke:live
```

验证临时 prefix 安装：

```bash
TMP_PREFIX=/tmp/frank-lens-mcp-install
FRANK_LENS_MCP_BIN="$TMP_PREFIX/bin/frank-lens-mcp" npm run smoke
FRANK_LENS_BACKEND_URL=http://127.0.0.1:8000/api \
  FRANK_LENS_MCP_BIN="$TMP_PREFIX/bin/frank-lens-mcp" \
  npm run smoke:live
```

## 示例调用

### 判断股票

优先使用 `frank_live_stock_diagnosis`。它返回的是可读 briefing，不是固定结构化 schema：

```json
{
  "question": "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
  "ticker": "NVDA",
  "evidence_limit": 6,
  "include_market_data": true
}
```

backend 不可用时，用离线版 `frank_stock_diagnosis`：

```json
{
  "question": "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
  "ticker": "NVDA"
}
```

### 判断市场行情

优先使用 `frank_live_market_regime`：

```json
{
  "question": "按 Frank 框架判断当前市场行情。",
  "evidence_limit": 6,
  "include_market_data": true
}
```

backend 不可用时，用离线版 `frank_market_regime`。这个 workflow 会把市场行情先拆成流动性/利率、盈利预期、行业叙事、逻辑破坏等变量，但不会强制最终 Agent 按固定表格输出。

### 通用 context pack

如果调用方确实需要结构化 context，继续使用 `frank_live_build_context`：

```json
{
  "question": "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
  "ticker": "NVDA",
  "evidence_limit": 6,
  "include_market_data": true
}
```

只查实时推文证据：

```json
{
  "query": "NVDA AI capex RPO 打脸条件",
  "k": 5
}
```

只查市场 brief：

```json
{
  "brief_type": "stock",
  "symbol": "NVDA"
}
```

查宏观 brief：

```json
{
  "brief_type": "macro"
}
```

## 当前限制

- Live 模式依赖 backend 环境变量和数据库；backend 没跑时，只有 offline 工具可用。
- `frank_live_search_evidence` 会触发 embedding/vector search 成本，正式商业化前应加 auth、rate limit 和 usage metering。
- `frank_live_market_brief` 的 stock / peer / industry brief 主要来自 FMP；macro brief 读取后端宏观缓存，缓存由现有 FRED/FMP 数据管道维护。
- 所有结果都应区分三层：历史证据、实时市场数据、方法论推断。
