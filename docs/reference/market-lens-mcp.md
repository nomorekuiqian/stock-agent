# TheMarketBrew MCP

TheMarketBrew MCP 位于：

```text
mcp/themarketbrew/
```

## 产品形态

当前采用 backend-first 形态：

```text
用户 Agent
  -> 本地 NPM MCP adapter
  -> TheMarketBrew backend
  -> persona workflow engine / assets / vector DB / market data
  -> context pack
  -> 用户 Agent 自己写最终回答
```

本地 NPM 包只是薄 adapter，不再打包完整 persona 蒸馏资产。核心 assets、
ticker/sector playbook、Evidence Map 和 workflow 都在 backend。客户端应先
查看可用 persona 和物料覆盖，再根据用户问题选择 persona 并在后续工具调用里显式传入。
除 `market_lens_status` 这类诊断外，内容、数据和 workflow 工具都要求用户用
TheMarketBrew 账号授权本地 MCP 客户端。

## 用户安装

推荐入口是让用户把这段 prompt 发给自己的 agent，让 agent 自动配置本机 MCP：

```text
请帮我安装 TheMarketBrew MCP。

配置要求：
- MCP server 名称：themarketbrew
- NPM 包：themarketbrew
- 启动命令：npx -y themarketbrew
- THEMARKETBREW_BACKEND_URL=https://stock-agent-production.up.railway.app/api

请根据当前环境选择安装方式：
1. 如果是 Codex，优先使用 `codex mcp add themarketbrew ...`。
2. 如果是 Claude Code，优先使用 `claude mcp add themarketbrew -s user ...`。
3. 如果是 Claude Desktop，请写入 Claude Desktop 的 MCP 配置文件：
   - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
   - Windows: %APPDATA%\Claude\claude_desktop_config.json
4. 如果是 Cursor，请写入 ~/.cursor/mcp.json。

安装后请验证：
- MCP 配置里 command 是 npx
- args 是 ["-y", "themarketbrew"]
- env 包含 THEMARKETBREW_BACKEND_URL；不要默认写死 persona
- 如果当前客户端已经能刷新 MCP，请调用 market_lens_status 检查连接
- 如果返回 auth_required，请调用 market_lens_login，打开返回的验证链接，用 TheMarketBrew 账号登录并批准授权
- 授权后调用 market_lens_auth_status 完成 MCP token 写入
- 如果不能刷新，请告诉我需要重启客户端，然后让我重启后调用 market_lens_status
```

手动安装时，直接用 `npx` 运行发布包，不要求全局安装。

Codex：

```bash
codex mcp add themarketbrew --env THEMARKETBREW_BACKEND_URL=https://stock-agent-production.up.railway.app/api -- npx -y themarketbrew
```

Claude Code：

```bash
claude mcp add themarketbrew -s user -e THEMARKETBREW_BACKEND_URL=https://stock-agent-production.up.railway.app/api -- npx -y themarketbrew
```

Claude Desktop：

```bash
node -e 'const fs=require("fs"),os=require("os"),path=require("path");const file=process.platform==="win32"?path.join(process.env.APPDATA,"Claude","claude_desktop_config.json"):path.join(os.homedir(),"Library/Application Support/Claude/claude_desktop_config.json");fs.mkdirSync(path.dirname(file),{recursive:true});const cfg=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")||"{}"):{};cfg.mcpServers={...(cfg.mcpServers||{}),themarketbrew:{command:"npx",args:["-y","themarketbrew"],env:{THEMARKETBREW_BACKEND_URL:"https://stock-agent-production.up.railway.app/api"}}};fs.writeFileSync(file,JSON.stringify(cfg,null,2)+"\n");console.log("Installed themarketbrew in "+file);'
```

Cursor：

```bash
node -e 'const fs=require("fs"),os=require("os"),path=require("path");const file=path.join(os.homedir(),".cursor","mcp.json");fs.mkdirSync(path.dirname(file),{recursive:true});const cfg=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")||"{}"):{};cfg.mcpServers={...(cfg.mcpServers||{}),themarketbrew:{command:"npx",args:["-y","themarketbrew"],env:{THEMARKETBREW_BACKEND_URL:"https://stock-agent-production.up.railway.app/api"}}};fs.writeFileSync(file,JSON.stringify(cfg,null,2)+"\n");console.log("Installed themarketbrew in "+file);'
```

MCP Client 手动配置：

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

TheMarketBrew MCP 安装配置默认只需要 backend URL。不要在安装配置里写死 persona，让
Agent 登录后先调用 `market_lens_personas`，再根据 query 和物料覆盖选择 persona。
`THEMARKETBREW_PERSONA` 仍可作为兼容/固定默认值使用，但只应在某个客户端或工作区
明确要绑定一个 persona 时设置。`MARKET_LENS_BACKEND_URL` 和 `MARKET_LENS_PERSONA`
env 仍作为兼容 fallback。

账号授权走浏览器/device flow：

1. `market_lens_login` 调后端创建 device code，返回验证链接和 user code。
2. 用户在 `/mcp/authorize` 登录 TheMarketBrew 账号并批准该 user code。
3. MCP 客户端调用 `market_lens_auth_status` 轮询 token；成功后 token 写入
   `~/.themarketbrew/mcp-auth.json`，或 `THEMARKETBREW_AUTH_FILE` 指定的位置。
4. 后续 content/data/workflow tools 自动带 `Authorization: Bearer <mcp_token>`。

不要让 MCP 客户端索要 TheMarketBrew 邮箱密码，也不要复制浏览器 cookie 到 MCP 配置。

## Tools

主工具是 persona-neutral 的 `market_lens_*`。当用户没有指定 persona 时，应先调用
`market_lens_personas` 选择，再通过 `persona` 参数传给后续工具：

- `market_lens_status`：检查 adapter/backend 状态；未固定 persona 时返回路由提示。
- `market_lens_login`：启动浏览器/device 登录授权；需要 TheMarketBrew 账号。
- `market_lens_auth_status`：检查本地 token；传入 `device_code` 时轮询并保存 MCP token。
- `market_lens_logout`：撤销当前 MCP token 并删除本地 auth cache。
- `market_lens_data_catalog`：列出可用 data tools、section 名、限制和 freshness 策略。
- `market_lens_get_brief`：取 stock / peer / macro / industry 粗粒度 brief；默认先调用它做当前事实入口。
- `market_lens_get_stock_data`：按 section 取单只股票的 quote、profile、fundamentals、forward/historical valuation、technical、news、earnings calendar、price history、earnings data、transcript、insider trading、press releases、market overview。
- `market_lens_get_market_data`：按 section 取 market overview、macro brief/risk/liquidity/sentiment、economic calendar、earnings calendar、morning report、weekly report、Twitter digest。
- `market_lens_get_news`：取带来源的近期 news，可覆盖 stock、market、press releases、morning report、Twitter digest 或 all。
- `market_lens_personas`：列出可用 persona、蒸馏物料数量和 capability。
- `market_lens_list_lenses`：返回 `core/framework/macro/sector/ticker` lens index。
- `market_lens_get_lens`：返回单个完整蒸馏 lens、sections、metadata、Evidence Map ids。
- `market_lens_search_lenses`：在全部蒸馏物料里搜索 topic/rule/ticker/phrase。
- `market_lens_search_evidence`：语义检索历史推文 chunks。
- `market_lens_get_evidence_by_ids`：根据 Evidence Map tweet IDs 取原始推文。
- `market_lens_build_context`：开放问题的混合 context pack。
- `market_lens_stock_diagnosis`：个股诊断 context pack。
- `market_lens_market_regime`：市场/宏观环境 context pack。
- `market_lens_compare`：多标的比较 context pack。
- `market_lens_research_memo`：深度 memo context pack。

Material、evidence、context、workflow tools 都通过 backend URL 调用。
除 `market_lens_status` 和登录启动/轮询外，所有内容与数据工具都需要 MCP token。

## Backend Endpoints

```text
POST /api/kol_research/mcp/auth/device/start
POST /api/kol_research/mcp/auth/device/token
POST /api/kol_research/mcp/auth/device/authorize
GET  /api/kol_research/mcp/auth/status
POST /api/kol_research/mcp/auth/revoke
GET  /api/kol_research/mcp/data/catalog
POST /api/kol_research/mcp/data/brief
POST /api/kol_research/mcp/data/stock
POST /api/kol_research/mcp/data/market
POST /api/kol_research/mcp/data/news
GET  /api/kol_research/mcp/personas
GET  /api/kol_research/personas/{username}/mcp/status
GET  /api/kol_research/personas/{username}/mcp/lenses
GET  /api/kol_research/personas/{username}/mcp/lenses/{lens_type}/{lens_id}
POST /api/kol_research/personas/{username}/mcp/lenses/search
POST /api/kol_research/personas/{username}/mcp/evidence/by-ids
POST /api/kol_research/personas/{username}/mcp/search
POST /api/kol_research/personas/{username}/mcp/market-brief
POST /api/kol_research/personas/{username}/mcp/context
POST /api/kol_research/personas/{username}/mcp/workflow
```

`/mcp/status` 和 auth start/token polling 是公开诊断/登录辅助；`/mcp/auth/device/authorize`
要求网站 Bearer token；persona/material/evidence/data/context/workflow endpoints 要求
MCP bearer token。

Material endpoints 由 `mcp_materials.py` 驱动。它为每个 persona 解析一个独立
material root，然后扫描 `core|framework|macro|sector|ticker`。Frank 使用自己的
正式 methodology root；Serenity 使用自己的正式 methodology root
`features/twitter/methodologies/aleabitoreddit`。
不能在某个 persona 缺 lens 时回退到另一个 persona 的物料。

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

### Local / CI

```bash
cd /Users/kedeng/projects/stock-agent/mcp/themarketbrew
npm run build
npm run inspect
npm run smoke
npm run smoke:adapter
npm pack --dry-run
```

Backend targeted tests:

```bash
cd /Users/kedeng/projects/stock-agent
backend/venv/bin/pytest backend/tests/test_themarketbrew_mcp.py -q
```

这组验证覆盖：

- tool surface：只有 `market_lens_*` 主工具出现在 `tools/list`，不得再暴露 `frank_*` aliases。
- material completeness：`market_lens_list_lenses` 数量必须等于
  `core/framework/macro/sector/ticker` 下所有 markdown 文件数量。
- persona isolation：`qinbafrank` 和 `aleabitoreddit` 都必须出现在
  `market_lens_personas`，且 Serenity 的 `ticker/SIVE`、`sector/photonics-and-cpo`
  和 workflow `methodology_context.selected_lenses` 必须来自 Serenity 自己的
  material root，不得含 Frank 专用框架词。
- material retrieval：`market_lens_get_lens` 必须返回完整 `full_body`、
  parsed `sections`、metadata 和 Evidence Map tweet IDs。
- material search：`market_lens_search_lenses` 必须能跨 layer 找到相关 lens。
- evidence bridge：`market_lens_get_evidence_by_ids` 必须能把 Evidence Map ids
  交给 cockpit reader 取原始推文。
- account gate：除 status 和登录辅助外，材料、证据、data 和 workflow endpoints
  都必须在无 MCP token 时返回 `auth_required`。
- data plane：`market_lens_data_catalog` 和四个 data tool schemas 必须出现在 `tools/list`，
  mock adapter smoke 必须验证登录后请求带 MCP bearer token。
- package boundary：`npm pack --dry-run` 不能包含完整 methodology assets。

Live smoke：

```bash
THEMARKETBREW_BACKEND_URL=http://127.0.0.1:8000/api \
npm run smoke:live
```

## 安全约束

- 不要 impersonate 所选 persona。
- 只有返回的 `kol_chunks` 可以被称为历史证据。
- 区分历史证据、实时市场数据和方法论推断。
- 不给直接买入、卖出、加仓、减仓指令。
- 不输出精确目标价。
