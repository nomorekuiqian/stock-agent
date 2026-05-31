# KOL Persona Research Agent — 博主投研 Agent

> Status: Draft — pending review
> Updated: 2026-05-20
> Supersedes: 原 `kol-chat-agent` 方案。当前路径是**独立博主投研 agent + 退役 `/kol-chat`**。
> Related: `backend/app/features/screener/research_agent.py`, `backend/app/features/vector/`, `backend/app/features/twitter/methodologies/qinbafrank/`, `docs/reference/vector-rag-pipeline.md`

## 决策摘要

| 维度 | 决定 |
|---|---|
| 架构 | **两个独立 agent**：中性 `/research`（不动）+ 博主投研 agent（新建） |
| 不走 | 同一 agent 加 persona overlay（if/else 撒到 base instruction / schema / tools / navigation） |
| Skill 机制 | ADK 原生 `google.adk.skills` + `SkillToolset`（1.29.0 已支持） |
| UI | 复用 `/research` 双栏 UI，顶部 PersonaSelector 决定调哪个 agent 的 endpoint |
| 数据真相源 | `methodologies/qinbafrank/*.md` 进 ADK Skill；`*.yaml` 留作 evidence/audit |
| 退役 | `/kol-chat` UI 入口、`methodology_chat.py`、`live_context.py`、`/api/twitter/methodology-chat*` 端点已删除 |

## 目标

让前端 PersonaSelector 选中 `@qinbafrank` 后，调用博主投研 agent。该 agent：

1. **Enable `search_kol_tweets` RAG 工具**：检索博主历史推文片段（`features.vector` + `source_type=kol_tweet`）
2. **方法论作为博主的"思维框架"**：`_orchestrator.md` / `overview.md` / `principles-falsifiability.md` 拼进 `Agent.instruction`；`lens-*.md` 通过 `SkillToolset` 按需触发
3. **用户用博主方法论投研**：完整 `research_tools`（行情/新闻/财报/宏观/早晚报）+ KOL 视角
4. **用博主历史观点佐证想法**：答案带 `[#N]` 引用编号 + 折叠面板展示原推文

## 非目标

- **不动中性 `/research` agent**：`RESEARCH_AGENT_INSTRUCTION` / `research_tools` / `ResearchAgentOutput` 保持现状
- **不重写 vector / data_tools 底层**：复用 `features.vector` 和 `shared/data_tools/`
- **不在同一 agent 里做 if persona then else 分支**：演化压力混杂是这次重新拆分的核心动因
- **不开放运行时 persona 注册**：本期只支持 `qinbafrank`；新增 KOL 走 PR + 蒸馏完整流程
- **不做 token-level streaming**：保留 SSE 状态事件 + `tool_call_start/end`，外加 `skill_activated` 事件
- **不在博主 agent 里塞 `output_schema`**（暂定）：参考前期实验，ADK 的 `output_schema + tools` 在 Gemini 上不稳；走 markdown 输出，前端按需 parse navigate hint

## 上游依赖

- **`google.adk` 1.29.0**：本地 venv 已验证 `from google.adk.skills import load_skill_from_dir` / `from google.adk.tools.skill_toolset import SkillToolset` 可用。注意 ADK 启动时 `[EXPERIMENTAL] FeatureName.PLUGGABLE_AUTH` 提示与 skills 无关；skills 模块本身是否标 experimental 需在 Phase 0 spike 时确认 ADK changelog
- **`features.vector`**（PR #17 已 merge）：`/api/vector/search` + `source_type=kol_tweet` filter
- **`scripts/index_kol_tweets.py`**：KOL 推文入向量库（需先跑 backfill）
- **`methodologies/qinbafrank/`** 已有内容：
  - `_orchestrator.md`（type: master-router）/ `overview.md`（type: identity-anchor）/ `principles-falsifiability.md`（type: cross-cutting）→ 始终注入 agent instruction
  - `lens-stock-analysis.md` / `lens-macro.md` / `lens-ai-infrastructure.md` / `lens-crypto.md` → 转 ADK Skill，挂 `SkillToolset`
  - `*.yaml`（机器蒸馏）→ 留作 evidence 召回种子 + eval 校验，**不进 prompt**
- **`features.screener.research_agent.research_tools`**：博主 agent 复用此工具列表（subset 或全部）；本 plan **不修改** `research_agent.py`

## 架构

### 两个独立 Agent，共享 UI 和数据层

```
Agent A — 中性 /research（现状，不动）
├── instruction: RESEARCH_AGENT_INSTRUCTION（友好向导，所有人格写死）
├── tools:       research_tools
├── output:      ResearchAgentOutput（强 schema + navigate）
└── endpoint:    POST /api/research/chat[/stream]

Agent B — 博主投研 agent（本 plan 新建）
├── instruction: orchestrator.body + overview.body + principles-*.body（拼接，始终在）
├── tools:       research_tools 子集 + search_kol_tweets + SkillToolset(lens-*.md)
├── output:      markdown 文本 + 后处理提取 navigate hint（暂定）
└── endpoint:    POST /api/kol_research/chat[/stream]

共享层
├── shared/kol_persona/      # Persona 加载 + skill 转换 + search_kol_tweets
├── shared/data_tools/       # 行情/新闻/财报/宏观，A B 共用
├── shared/llm_metering/     # meter() callback，A B 共用
└── features/vector/         # KOL 推文 RAG，A 不调，B 调
```

### Methodology 真相源：.md → ADK Skill，YAML 留作 evidence

| 文件 | 角色 | 注入方式 |
|---|---|---|
| `_orchestrator.md` | 主控路由 + 5 条铁律 | **拼到 `Agent.instruction`**（始终在） |
| `overview.md` | 人格画像 + 信念 + 标志性表达 | **拼到 `Agent.instruction`**（始终在） |
| `principles-falsifiability.md` | "强信念必带可证伪锚" cross-cutting | **拼到 `Agent.instruction`**（始终在） |
| `lens-stock-analysis.md` / `lens-macro.md` / `lens-ai-infrastructure.md` / `lens-crypto.md` | 按主题切的视角 | **转 ADK Skill**：metadata（name + description）启动时进 system prompt，body 由 LLM 触发后加载 |
| `<category>.yaml` | 机器蒸馏，evidence-grounded | **不进 prompt**：给 `search_kol_tweets` 召回背书 quote、给 eval pipeline 跑校验、给前端 citation 链回原推文 |

**为什么 orchestrator/overview/principles 不做成 Skill**：它们 frontmatter 的 `when_to_use` 字段明确写"始终加载"。ADK Skill 是 trigger-based（L1 metadata 暴露给 LLM，LLM 决定是否加载 L2 body），把"始终加载"的内容做成 skill 是逼 LLM 每次都触发——不如直接拼 instruction，省一次 trigger 决策 + 保证一致性。

**为什么 lens-* 做成 Skill**：它们天然是 trigger-based（用户问个股就触发 stock-analysis、问宏观就触发 macro），完全契合 ADK Skill 的 Progressive Disclosure 模型。

### Always-on instruction 模板

```python
# backend/app/features/kol_research/agent.py
def build_persona_instruction(persona: Persona) -> str:
    return f"""You are a market analyst who thinks with @{persona.username}'s public methodology.
**You are NOT @{persona.username}**. Never claim to be the analyst himself.

# Master Orchestrator
{persona.orchestrator.body}

# Identity Anchor
{persona.overview.body}

# Cross-cutting Principles
{chr(10).join(p.body for p in persona.cross_cutting)}

# Tool usage
- Lens skills (stock-analysis / macro / ai-infrastructure / crypto) auto-trigger when relevant
- Call `search_kol_tweets(query=..., author_username="{persona.username}")` to retrieve the analyst's prior takes
- Cite retrieved chunks with [#N] inline, attribute author + date
- Lens framework is the criterion; search_kol_tweets is the evidence
- When framework and retrieval conflict, surface the disagreement in your answer
- When data is missing, say "需要补充" — never fabricate
"""
```

### `shared/kol_persona/` 模块详设

```
backend/app/shared/kol_persona/
├── __init__.py
├── registry.py    # Persona 加载（.md 全集 + .yaml evidence 副本）
├── skills.py      # .md 文件 → google.adk.skills.models.Skill 对象
├── tools.py       # search_kol_tweets（薄包 features.vector.service.search）
└── models.py      # Persona / PersonaSummary / PersonaChunkResult
```

**注意：没有 `prompt.py` 也没有 `router.py`**。原 plan 的"应用层路由 + 静态拼 prompt"方案被 ADK SkillToolset 取代：lens 选择由 LLM 看 L1 metadata 决定，不再写关键词路由表。

```python
# skills.py
from google.adk.skills import load_skill_from_dir, models

def lens_to_adk_skill(lens_path: Path) -> models.Skill:
    """把 lens-*.md 转 ADK Skill。
    .md 当前 frontmatter 用 name + analyst + type + when_to_use；
    需要适配成 ADK/Agent Skill spec 要求的 name + description。
    """
    parsed = parse_md_with_frontmatter(lens_path)
    return models.Skill(
        frontmatter=models.Frontmatter(
            name=parsed.frontmatter["name"],  # 须 lowercase + hyphen，符合 spec
            description=parsed.frontmatter.get("when_to_use", ""),  # spec 要求 < 1024 chars
            metadata={"source_type": parsed.frontmatter.get("type")},
        ),
        instructions=parsed.body,
        resources=None,  # 我们 .md 暂不用 references/scripts
    )

def load_persona_skills(persona_dir: Path) -> list[models.Skill]:
    return [lens_to_adk_skill(p) for p in persona_dir.glob("lens-*.md")]
```

```python
# tools.py
_persona_chunks_buffer: ContextVar[list[VectorChunkResult]] = ContextVar(...)

async def search_kol_tweets(query: str, author_username: str, k: int = 6) -> str:
    """检索指定 KOL 的历史推文片段。返回 markdown，带 [#N] 引用编号。
    Use when answering questions about specific stocks / sectors / events to retrieve the analyst's prior takes.
    """
    resp = await vector_service.search(VectorSearchRequest(
        query=query, top_k=k,
        filters=VectorSearchFilters(
            source_types=["kol_tweet"],
            metadata={"author_username": author_username},
        ),
    ))
    buf = _persona_chunks_buffer.get()
    if buf is not None:
        buf.extend(resp.results)
    return _format_chunks_for_llm(resp.results)
```

### 博主投研 agent 模块

```
backend/app/features/kol_research/
├── __init__.py
├── agent.py        # 构造 LlmAgent + SkillToolset + tools
├── router.py       # /api/kol_research/* 端点
├── db.py           # 复用 research_conversations 表（加 agent_kind 列区分）
└── models.py       # KolResearchRequest / KolResearchResponse
```

```python
# agent.py 骨架
from google.adk.agents import LlmAgent
from google.adk.tools.skill_toolset import SkillToolset
from app.shared.kol_persona.registry import get_persona
from app.shared.kol_persona.skills import load_persona_skills
from app.shared.kol_persona.tools import search_kol_tweets
from app.features.screener.research_agent import research_tools
from app.shared.llm_metering import meter

MODEL = "gemini-3.5-flash"
USERNAME = "qinbafrank"

def build_kol_research_agent() -> LlmAgent:
    persona = get_persona(USERNAME)
    skill_toolset = SkillToolset(
        skills=load_persona_skills(persona.dir),
        additional_tools=[],  # 通过 tools= 直接挂，不绕道
    )
    return LlmAgent(
        name="kol_research_agent",
        model=MODEL,
        instruction=build_persona_instruction(persona),
        tools=[
            skill_toolset,
            search_kol_tweets,
            *research_tools_subset_for_kol(),  # 从 research_tools 挑能用的
        ],
        before_tool_callback=_before_tool_callback,
        after_tool_callback=_after_tool_callback,
        after_model_callback=meter("kol_research", model=MODEL),
    )
```

`research_tools_subset_for_kol()` 是单独定义的子集，**不直接复用全集**——例如 `execute_screener` 这种"撒大网选股票"动作和博主"沿产业链顺藤摸瓜"思路冲突，可以剔掉；具体子集在 Phase 2 实施时定。

## 待验证（Spike 任务，Phase 0 必须做完才能进 Phase 1）

ADK SkillToolset 是新机制，本地 1.29.0 装了但实战未验证。以下 5 个集成点必须在 spike 阶段跑通，否则后续 phase 设计可能要返工：

1. **SkillToolset + `output_schema` 共存**：现有 `ResearchAgentOutput` 强 schema 是 ADK 已知不稳点；spike 验证 markdown 输出是否完全放弃 schema 还是可以部分用 ResponseSchema
2. **`before_tool_callback` / `after_tool_callback` 在 skill 激活时是否触发**：我们 SSE 进度事件依赖这两个 callback；如果 SkillToolset 黑盒掉了，需要找替代 hook（可能是 SkillToolset 自己的事件、或 Agent.events 流）
3. **Skill body 加载是显式 tool call 还是隐式**：影响 SSE 事件设计——如果 LLM 通过显式 tool call 触发 skill，可以发 `skill_activated` 事件；如果隐式，需要 hook ADK 内部
4. **`search_kol_tweets` 工具与 SkillToolset 同时挂 `tools=[]` 的兼容性**：是否会有 tool 名冲突 / 行为干扰
5. **Vector metadata filter 对 `author_username` 是否真下推到 RPC**（前期遗留问题，未验证）

**Spike 交付物**：补一个临时 prototype（路径在实施时确定；旧 spike 脚本已清理，不再作为当前交付物引用），跑一个完整对话：用户问"NVDA 财报怎么看" → LLM 触发 lens-stock-analysis + lens-ai-infrastructure → 调 search_kol_tweets → 出答案。脚本输出每个 ADK 内部事件 + 命中 chunks + 答案。

## 实施阶段

### Phase 0：数据 + Spike（一次性，硬卡点）

- [ ] 跑 `scripts/index_kol_tweets.py --authors qinbafrank` 入向量库（先 `--dry-run` 看 quality 过滤后剩多少）
- [ ] 补一个临时 spike prototype 验证上述 5 个集成点；记录每个点是否阻塞，决定 Phase 2 实施细节
- [ ] 必要时给 ADK 提 issue / 找 workaround

### Phase 1：`shared/kol_persona/` 模块

- [ ] `registry.py`：`Persona` / `PersonaSummary` 模型；扫 `methodologies/<username>/` 加载所有 .md + .yaml
- [ ] `skills.py`：`load_persona_skills(persona_dir)` → `list[models.Skill]`；frontmatter 字段适配（我们当前 .md 的 `name + analyst + type + when_to_use` → spec 的 `name + description + metadata`）
- [ ] `tools.py`：`search_kol_tweets`（薄包 `features.vector.service.search`），contextvar 收集 chunks
- [ ] `models.py`：`PersonaChunkResult` 等
- [ ] 单测 `test_kol_persona_skills.py`（mock vector.search + 加载真实 .md）

### Phase 2：博主投研 agent

- [ ] `features/kol_research/agent.py`：用 SkillToolset + search_kol_tweets + research_tools_subset 构造 LlmAgent
- [ ] `research_tools_subset_for_kol()`：从 `research_tools` 挑能用的子集（剔除 `execute_screener` 等不符合博主风格的工具）
- [ ] `_before_tool_callback` / `_after_tool_callback`：复用 research_agent 的 SSE 事件 contextvar 模式；按 Phase 0 spike 结论调整
- [ ] `agent.guide()` / `agent.run_stream()`：模仿 `ResearchAgent.guide`，加 75s timeout、persona chunks 收集、错误降级

### Phase 3：端点 + 持久化

- [ ] `features/kol_research/router.py`：`/api/kol_research/chat`（unary）+ `/api/kol_research/chat/stream`（SSE）
- [ ] DB migration via `insforge-cli`：`research_conversations` 加 `agent_kind TEXT DEFAULT 'research'` 列（值：`research` / `kol_research`）
- [ ] 复用 `screener.conversation_db` 读写接口，按 `agent_kind` 区分
- [ ] `frontend/src/lib/api.ts`：`api.kolResearch.chatStream` / `conversations.*` 接口
- [ ] SSE 事件：`status` / `skill_activated`（如 spike 可行）/ `tool_call_start` / `tool_call_end` / `final`

### Phase 4：前端 PersonaSelector + UI 路由

- [ ] `frontend/src/app/research/_components/PersonaSelector.tsx`：挂 ChatPanel header，按钮"🎙️ 博主视角"
- [ ] 选中显示 chip `@qinbafrank` + ✕；切 persona 弹确认（"切换会开启新对话"）
- [ ] `researchReducer` state 加 `agent_kind: 'research' | 'kol_research'`
- [ ] `handleSend` 根据 `agent_kind` 调对应 endpoint
- [ ] Conversation 列表 / 重新加载从 `agent_kind` 字段恢复 selector 状态
- [ ] `ChatMessage` 渲染 `kol_chunks` 折叠面板：`[#1] @qinbafrank · 2026-04-12: "..."` 展开看原推文 + 跳转链接

### Phase 5：灰度

- [ ] Flag `kol_research_agent`：registry 注册 + `admin_default=True`
- [ ] 关闭时：前端 PersonaSelector 不渲染；后端 `/api/kol_research/*` 返 404
- [ ] Admin 试用 1 周，记录：工具调用次数 / chunks 命中率 / skill 触发分布 / 延迟 / 答案质量
- [ ] eval set 30+ case：覆盖个股 / 板块 / 宏观 / 加密 / 方法论 五类

### Phase 6：退役 `/kol-chat`

灰度全量后：

- [x] 前端 `/kol-chat` 页面删除；对话统一从 `/research?persona=qinbafrank` 和 `/kol/qinbafrank` 入口进入
- [x] 后端 `methodology_chat.py` / `live_context.py` 删除；`methodology_models.py` 保留给抽取流程使用
- [x] `features/twitter/router.py` 移除 `/api/twitter/methodology-chat*` 端点
- [ ] `kol_methodology_conversations` edge function 退役（或保留历史数据查询，不再写入）
- [x] 前端 `frontend/src/app/kol-chat/` 目录删除
- [ ] flag `kol_research_agent` 退役
- [ ] 更新 `.context.md` 和本 plan 状态为 Completed

## 风险

| 风险 | 缓解 |
|---|---|
| Phase 0 spike 发现 SkillToolset 与 output_schema / callback 冲突 | 这就是 spike 存在的意义；阻塞 → 回退到原 plan 的「应用层路由 + 静态拼 prompt」方案。两条路 fallback 完备 |
| ADK skills 模块本身是 experimental，API 不稳定 | Phase 0 spike 同时确认 ADK changelog 标记；如果是 experimental，pin google-adk 版本，升级前重测 |
| Skill 触发不准（lens-stock-analysis 在用户问宏观时也触发） | 反复打磨 lens 的 `description` 字段（spec 上限 1024 chars 充足）；spike 阶段写 10+ trigger case 验证 |
| 博主 agent 在没数据的话题上编造 | system prompt 已明示"需要补充"；eval 集设计无关话题 case |
| `methodologies/qinbafrank/*.md` frontmatter 字段不符合 ADK spec | Phase 1 适配函数把 `when_to_use` → `description`、`name` 改 lowercase+hyphen；spec validator 跑一遍 |
| 两个 agent 演化分歧大到 `shared/kol_persona/` 也撑不住 | 接受。`shared/kol_persona/` 边界明确（只管 Persona 加载 + RAG tool），不掺 instruction 拼装；如果未来 KOL agent B 演化出独立工具集，那是 B 的 internal，不上 shared |
| `/kol-chat` 退役时旧用户 conversation 数据丢失 | Phase 6 前先把 `kol_methodology_conversations` 数据迁移到 `research_conversations`（带 `agent_kind=kol_research`），保留历史 |
| LLM 成本 | flash 比 pro 便宜 ~10x；instruction 里 orchestrator+overview+principles ~3K tokens 是 static，prompt cache 命中；skill body 触发后 +1-2K |
| Vector backfill 数据漂移 | 接 cron 跟随 KOL fetch 每日 / 每小时增量入库（独立任务，不在本 plan 范围） |

## Eval

上线前必须：

- [ ] 30+ case eval set（个股 / 板块 / 宏观 / 加密 / 方法论 五类）
- [ ] **中性 `/research` vs 博主 agent 同 prompt 对比**：答案视角差异、`search_kol_tweets` 调用率、skill 触发分布、与方法论 lens 的一致性、延迟（P95 ≤ 30s）
- [ ] **博主 agent 内部诚实度**：无 RAG 命中时是否乖乖说"需要补充"、是否冒充博主本人发言（人工抽检）
- [ ] Admin 试用 1 周，每日 5 条样本人工评分

## 替代方案考虑（why not）

### 方案 ②：同一 agent + persona overlay

排除原因：

- `RESEARCH_AGENT_INSTRUCTION` 第一段就把人格写死（"friendly stock research guide ... NEVER use financial jargon"），与 qinbafrank 风格直接冲突；做 overlay 必须把 base 抽干为中性，但抽干后中性体验也降级
- `output_schema` / `tools` / `navigation` 都需要按 persona 分歧，if/else 会撒到 base instruction / build_prompt / output 解析 / SSE 事件 各处
- 演化压力混杂：中性 agent 优化"覆盖更多场景 + 小白友好"，博主 agent 优化"还原博主思维 + 维护 lens"，挤一起互相拖累
- Eval 不独立：调一个会带歪另一个

### 方案 ③：继续维护 `/kol-chat`（已放弃）

排除原因：

- `/kol-chat` 是 ChatGPT 风格轻聊 UI，没有 panel / navigation，与"博主投研"产品形态不匹配（用户讨论 NVDA 时需要右侧出现股票面板）
- 维持两个 KOL agent（`/kol-chat` 轻聊 + `/research` overlay 深度）是工程冗余
- 砍掉 `/kol-chat`、用 `/research` UI + persona selector 一站式触达，产品形态更干净

### 方案 ④：换 SDK（Claude Agent SDK / OpenAI Agents SDK）

排除原因：

- ADK 1.29.0 原生支持 SkillToolset，跟 Anthropic / agentskills.io spec 是同一份 SKILL.md 协议
- 换 SDK = 换 LLM provider + 重写整套 runtime（tools / metering / streaming / output_schema / callbacks），代价不该为 skill 这一个 feature 付
- 保留 future option：未来 KOL persona 多到需要给多个独立 agent 系统共享时，把 `shared/kol_persona/` 服务化为 MCP server，让任意 SDK 通过 `get_prompt()` 消费

## 相关计划

- `kol-chat-live-context-streaming.md` — 旧 `/kol-chat` 实施记录
- `kol-methodology-distillation.md` — 方法论蒸馏总计划（YAML 真相源由它产出）
- `vector-rag-pipeline.md` (`docs/reference/`) — 通用 vector 模块设计
- `screener/.context.md` — 中性 `/research` agent 现状（本 plan 不动它）
