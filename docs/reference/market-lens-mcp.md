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

推荐入口是让用户把这段 prompt 发给自己的 agent，让 agent 自动配置本机 MCP：

```text
请帮我安装 Market Lens MCP。

配置要求：
- MCP server 名称：market-lens
- NPM 包：@themarketbrew/market-lens-mcp
- 启动命令：npx -y @themarketbrew/market-lens-mcp
- MARKET_LENS_BACKEND_URL=https://stock-agent-production.up.railway.app/api
- MARKET_LENS_PERSONA=qinbafrank

请先向我索取 MARKET_LENS_INVITE_CODE。这个邀请码是敏感信息：
- 不要把邀请码打印到聊天记录里
- 不要提交到 git
- 不要写入项目源码
- 只写入本机 MCP 客户端配置

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
- env 包含 MARKET_LENS_BACKEND_URL、MARKET_LENS_INVITE_CODE、MARKET_LENS_PERSONA
- 如果当前客户端已经能刷新 MCP，请调用 market_lens_status 检查连接
- 如果不能刷新，请告诉我需要重启客户端，然后让我重启后调用 market_lens_status
```

手动安装时，直接用 `npx` 运行发布包，不要求全局安装。

Codex：

```bash
codex mcp add market-lens --env MARKET_LENS_BACKEND_URL=https://stock-agent-production.up.railway.app/api --env MARKET_LENS_INVITE_CODE=YOUR_INVITE_CODE --env MARKET_LENS_PERSONA=qinbafrank -- npx -y @themarketbrew/market-lens-mcp
```

Claude Code：

```bash
claude mcp add market-lens -s user -e MARKET_LENS_BACKEND_URL=https://stock-agent-production.up.railway.app/api -e MARKET_LENS_INVITE_CODE=YOUR_INVITE_CODE -e MARKET_LENS_PERSONA=qinbafrank -- npx -y @themarketbrew/market-lens-mcp
```

Claude Desktop：

```bash
INVITE_CODE=YOUR_INVITE_CODE node -e 'const fs=require("fs"),os=require("os"),path=require("path");const file=process.platform==="win32"?path.join(process.env.APPDATA,"Claude","claude_desktop_config.json"):path.join(os.homedir(),"Library/Application Support/Claude/claude_desktop_config.json");fs.mkdirSync(path.dirname(file),{recursive:true});const cfg=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")||"{}"):{};cfg.mcpServers={...(cfg.mcpServers||{}),"market-lens":{command:"npx",args:["-y","@themarketbrew/market-lens-mcp"],env:{MARKET_LENS_BACKEND_URL:"https://stock-agent-production.up.railway.app/api",MARKET_LENS_INVITE_CODE:process.env.INVITE_CODE,MARKET_LENS_PERSONA:"qinbafrank"}}};fs.writeFileSync(file,JSON.stringify(cfg,null,2)+"\n");console.log("Installed market-lens in "+file);'
```

Cursor：

```bash
INVITE_CODE=YOUR_INVITE_CODE node -e 'const fs=require("fs"),os=require("os"),path=require("path");const file=path.join(os.homedir(),".cursor","mcp.json");fs.mkdirSync(path.dirname(file),{recursive:true});const cfg=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")||"{}"):{};cfg.mcpServers={...(cfg.mcpServers||{}),"market-lens":{command:"npx",args:["-y","@themarketbrew/market-lens-mcp"],env:{MARKET_LENS_BACKEND_URL:"https://stock-agent-production.up.railway.app/api",MARKET_LENS_INVITE_CODE:process.env.INVITE_CODE,MARKET_LENS_PERSONA:"qinbafrank"}}};fs.writeFileSync(file,JSON.stringify(cfg,null,2)+"\n");console.log("Installed market-lens in "+file);'
```

MCP Client 手动配置：

```json
{
  "mcpServers": {
    "market-lens": {
      "command": "npx",
      "args": ["-y", "@themarketbrew/market-lens-mcp"],
      "env": {
        "MARKET_LENS_BACKEND_URL": "https://stock-agent-production.up.railway.app/api",
        "MARKET_LENS_INVITE_CODE": "YOUR_INVITE_CODE",
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

主工具是 persona-neutral 的 `market_lens_*`，通过 `persona` 参数切换博主：

- `market_lens_status`：检查 adapter/backend/invite/persona 状态。
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

兼容别名仍保留，固定 `persona=qinbafrank`：

- `frank_status`
- `frank_search_evidence`
- `frank_stock_diagnosis`
- `frank_market_regime`
- `frank_compare`
- `frank_research_memo`

`market_lens_status` 和 `market_lens_personas` 可以无邀请码调用。Material、
evidence、context、workflow tools 需要 `MARKET_LENS_INVITE_CODE`。

## Backend Endpoints

```text
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

Material endpoints 由 `mcp_materials.py` 驱动，按
`features/twitter/methodologies/{persona}/core|framework|macro|sector|ticker`
扫描文件。接入新 persona 的最低门槛是新增同结构目录；这样
`market_lens_personas` / `list_lenses` / `get_lens` / `search_lenses` 可以先
工作，workflow 能力再通过 persona capability 逐步接入。

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
cd /Users/kedeng/projects/stock-agent/mcp/market-lens
npm run build
npm run inspect
npm run smoke
npm run smoke:adapter
npm pack --dry-run
```

Backend targeted tests:

```bash
cd /Users/kedeng/projects/stock-agent/backend
source venv/bin/activate
python -m pytest tests/test_frank_lens_mcp_beta.py -v
python -c "from app.main import app; print('FastAPI app loaded OK'); print(len(app.routes))"
```

这组验证覆盖：

- tool surface：`market_lens_*` 主工具和 `frank_*` legacy aliases 都出现在 `tools/list`。
- material completeness：`market_lens_list_lenses` 数量必须等于
  `core/framework/macro/sector/ticker` 下所有 markdown 文件数量。
- material retrieval：`market_lens_get_lens` 必须返回完整 `full_body`、
  parsed `sections`、metadata 和 Evidence Map tweet IDs。
- material search：`market_lens_search_lenses` 必须能跨 layer 找到相关 lens。
- evidence bridge：`market_lens_get_evidence_by_ids` 必须能把 Evidence Map ids
  交给 cockpit reader 取原始推文。
- access control：缺 invite 返回 401；无效 invite 返回 403；有
  `allowed_personas` / `allowed_workflows` 时必须强制 scope。
- package boundary：`npm pack --dry-run` 不能包含完整 methodology assets。

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
