# Frank Agent Readable Framework Engineering Plan

> Status: In Progress
> Related: `backend/app/features/kol_research/.context.md`, `backend/app/features/twitter/.context.md`, `frontend/src/app/kol/.context.md`, `docs/plans/active/qinbafrank-skill-distillation.md`, `docs/plans/active/kol-research-context-mgmt.md`
> Vision: 产品策略.md > 帮用户把数据变成判断，而不是堆积信息；KOL agent 要让用户通俗理解 Frank 的框架，并用这个框架看市场问题。

## 目标

把 qinbafrank KOL agent 从“资料库召回 + 固定四段模板”升级成“Frank 框架的白话判断助手”：用户能听懂它为什么这样看，也能感到回答确实沿着 Frank 的产业链、三杀、风险等级、打脸条件和能力圈原则在推理。

## 现状

当前运行时链路：

```text
backend/app/features/kol_research/agent.py
  -> _build_instruction()
  -> build_always_on_instruction(persona)
       core/operating-system.md + macro/macro-regime.md always-on
  -> _SKILL_TOOL_USAGE_RULES
       强制工具顺序 + 强制四段输出
  -> SkillToolset
       framework/*.md + sector/*.md + ticker/*.md lazy load
  -> search_kol_tweets + brief tools
  -> final sanitizer
```

关键问题：

1. `agent.py` 的 `_SKILL_TOOL_USAGE_RULES` 仍硬性要求所有问题输出 `结论 / Frank 过往观点 / 现状 / 总结` 四段。
2. 6 个 `framework/ask-about-*.md` 文件也都写着“必须放进统一四段骨架”，和 system prompt 互相强化。
3. 现有 eval `backend/evals/kol_research/cases.yaml` 把四段标题作为 hard requirement，所以自动化验收会保护模板，而不是保护可读性和 Frank 味。
4. `sector/` 和 `ticker/` content skill 内容很有价值，但写法偏投研笔记；agent 容易复述术语，如“产业逻辑未证伪”“杀估值”“RPO”“Capex”“高贝塔”，而不是先翻译成普通用户能理解的问题。
5. `ticker/` skill 中的“升级条件 / 加仓信号 / 减风险条件”等措辞容易把 agent 带向投顾式语言，虽然 sanitizer 已做部分替换，但源头仍会影响生成。
6. harness 现在能记录 `activated_skills` 和 `tool_calls`，但没有评估“加载的 skill 是否真的进入回答逻辑”，也没有评估“回答是否白话、是否尊重用户格式”。

已有优势：

1. `core/operating-system.md` 的底层框架很强：产业逻辑、三杀、风险分级、能力圈、Veto、打脸条件都已经蒸馏出来。
2. `sector/` 和 `ticker/` playbook 能提供非常具体的判断坐标，例如 AI 基建看 token 消耗、Mag4 capex、RPO、HBM、电力瓶颈；NVDA 看 Blackwell/Rubin、数据中心增速、毛利率、中美管控。
3. `input_guard.py` 已经能 deterministic 解析 ticker / macro intent，并预取 obvious data。
4. `search_kol_tweets` 已经能从向量库实时检索 Frank 历史推文，并提供 `[ #N ]` 风格的 citation 约束。

## 设计原则

### 1. 分清三层职责

```text
harness / system prompt = 决定流程、证据纪律、安全边界、响应模式
framework skill         = 决定某类问题该怎么思考、怎么组织答案
content skill           = 提供 Frank 对某板块/标的的判断坐标，不直接规定最终文案
```

framework skill 不能再承担“所有问题固定四段”的职责；content skill 不能再像可以直接复制的投研笔记。

### 2. 用户格式优先

如果用户说“只答两句”“只选一只”“用表格”“不要展开”，最终回答必须优先遵守用户格式。框架只决定内部推理，不覆盖用户明确的输出要求。

### 3. 白话先于术语

专业术语可以出现，但必须先用普通话讲机制：

```text
不好：这是健康杀估值，产业逻辑未被证伪。
更好：公司故事本身还没坏，市场只是觉得前面涨贵了；这在 Frank 框架里更像“杀估值”，不是“杀逻辑”。
```

### 4. 让用户看到 Frank 的判断路径

回答里要出现 Frank 式的“先问什么”：

```text
这题 Frank 不会先看 PE。他会先问：需求有没有断？大客户还砸不砸钱？瓶颈是不是还在这家公司手里？什么数据会说明原来的故事错了？
```

这比直接输出“结论 + 现状 + 总结”更能让用户感到 agent 在用 Frank 框架。

### 5. 历史观点、当前事实、方法论推断必须分开

仍然保留现有证据纪律：

- Frank 历史观点只能来自 `search_kol_tweets`。
- 当前事实只能来自 `prefetched_data`、brief tools、report tools 或明确标注的 web search。
- 如果没有直接历史观点，必须说“Frank 未直接覆盖，只能按方法论推断”。

## Harness 改造计划

### H1. 增加 Response Mode 层，但不做新工具

不要新增独立工具或新的 ADK skill router。直接在 `agent.py` prompt 里引入轻量 response mode 规则，让现有 framework skill 负责具体问题类型。

建议模式：

| Mode | 触发 | 输出要求 |
|---|---|---|
| `direct_short` | 用户要求两句/三点/只答一只/快速看法 | 1 个短结论 + 1-3 个原因；可不使用四段标题 |
| `normal_explain` | 默认“怎么看/是否还成立/利好利空” | 先白话结论，再讲 Frank 会看哪几个问题，再给历史观点和当下数据 |
| `deep_research` | 用户要求深度、详细、展开、对比表 | 可结构化、多段、必要时表格 |
| `method_teach` | 用户问概念/方法论 | 类比和术语翻译优先，不强制当前数据 |
| `latest_take` | 用户问最新观点/最近怎么看 | 核心是最近历史观点 + 是否有当下数据变化；不强行套“过往观点/现状/总结” |
| `no_coverage` | RAG 无直接覆盖或标的弱覆盖 | 直接说明覆盖不足，然后退到 sector/core 方法论 |

实现点：

- 修改 `_SKILL_TOOL_USAGE_RULES` 中“统一回答骨架”部分，改成“默认回答策略 + 用户格式优先”。
- 保留工具顺序、citation、安全和数据覆盖规则。
- 去掉“散户短问也要四段”“用户可见标题只能使用 4 个固定标题”等硬约束。

### H2. 让 input_guard 输出 intent hints

`input_guard.py` 现在只判断 stock / macro / news / URL。后续可以增加轻量字段，不需要 LLM：

```json
{
  "response_hints": {
    "requested_brevity": true,
    "requested_choice": true,
    "requested_table": false,
    "question_shape": "compare | latest | method | stock | sector | macro | veto"
  }
}
```

作用：

- system prompt 能明确看到“用户要求短答/二选一”，减少被 framework skill 拉回长模板。
- eval 可以验证短答请求是否真的短。

### H3. 输出后处理只做安全清理，不做风格补救

现有 `_sanitize_user_facing_markdown()` 可以保留，但目标是把问题前移到 prompt 和 skill：

- 保留：coverage 替换、citation 修复、交易语言降级、代码反引号清理。
- 不新增大量文风正则；否则会变成“生成错误，再靠 sanitizer 缝补”。

### H4. Tool / skill usage trace 增加质量信号

在 response payload 或 eval fixture 中继续记录：

- `activated_skills`
- `tool_calls`
- `kol_chunks`

新增 eval 侧使用这些字段判断：

- 是否加载了正确 framework skill。
- 是否加载了相关 content skill。
- 是否在回答中使用了 content skill 的“判断坐标”，而不是只引用历史推文。

不一定要新增生产字段；优先在 eval 层读取现有 response。

## System Prompt 改造计划

### S1. 重写 `_SKILL_TOOL_USAGE_RULES` 的输出部分

保留：

- 工具调用顺序。
- `search_kol_tweets` citation 纪律。
- brief tool 当前事实要求。
- google search escape hatch。
- 不冒充本人。
- 不给买卖指令。
- 数据不足要降级。

删除或降级：

- “最终答案默认必须使用 4 个用户可见标题”。
- “散户短问也要四段”。
- “用户可见标题只能使用四段固定标题”。
- “每个 framework 必须塞进四段里”。

新增：

```text
# 回答模式选择
先判断用户要的是短答、普通解释、深度研究、方法教学、最新观点、还是未覆盖澄清。
用户明确格式优先于默认框架。

# 默认回答顺序
1. 先给白话结论。
2. 再说 Frank 会先看哪几个问题。
3. 再区分历史观点和当下事实。
4. 最后给确认/打脸信号。

# 白话要求
每出现一个专业词，都要把它翻译成普通投资者能理解的机制。
不要把 framework 标签直接当标题。
```

### S2. 增加“Frank 框架可感知”的表达规则

回答必须至少满足其中 2 个：

- 明确指出 Frank 会优先看的变量，而不是普通分析师会看的变量。
- 把问题放进三杀：杀估值 / 杀业绩 / 杀逻辑。
- 给出一个可证伪条件。
- 说明它处在产业链哪一层、瓶颈在哪里。
- 说明这是不是能力圈内问题 / 是否触发 Veto。

### S3. 增加术语翻译纪律

在 system prompt 中加入小型翻译表，保证高频概念不直接裸奔：

| 术语 | 用户可见解释 |
|---|---|
| 杀估值 | 公司故事没坏，市场只是嫌贵 |
| 杀业绩 | 公司数字开始变差，订单/利润/增长不如预期 |
| 杀逻辑 | 原来相信的产业故事被证伪 |
| RPO | 已签但还没交付、未来可能转成收入的订单 |
| Capex | 大客户愿不愿意继续掏钱建基础设施 |
| 流动性 | 市场里愿意追风险资产的钱是不是变多 |
| 打脸条件 | 什么事实出现后，原来的判断必须认错 |

注意：system prompt 只放最常用术语；每个 sector/ticker skill 还要有自己的白话表。

## Framework Skill 改造计划

### F1. 统一 framework skill 新模板

每个 `framework/*.md` 改成：

```md
## 适用问题

## 用户真正想知道什么

## Frank 会先问的 3 个白话问题

## 必须完成的动作
- 要不要 load content skill
- 要不要 search_kol_tweets
- 要不要 data brief

## 默认回答形态

## 用户要求简短时

## 术语翻译

## 禁止做的

## 退出路由
```

不再写“必须放进统一四段骨架”。

### F2. `ask-about-stock`

重点让 agent 回答：

```text
这只股票在 Frank 框架里是哪条产业链的哪一环？
现在问题是估值太贵、业绩变坏，还是产业故事变了？
Frank 会看哪 2-4 个数据来确认？
什么信号出现就说明原来的看法要下修？
```

短答形态：

```text
一句结论 + 三个判断点：
1. 故事有没有坏
2. 当前数据支持/削弱什么
3. 接下来最该盯什么
```

### F3. `ask-to-compare`

必须支持用户明确要求“只选一个”。

默认比较维度：

- 谁更靠近产业瓶颈。
- 谁的需求更能被订单/客户支出验证。
- 谁的估值压力更容易转成杀逻辑。
- 谁的打脸条件更清楚。

输出可以给条件化选择：

```text
如果按 Frank 的“确定性优先”，A 更强；如果按弹性，B 更大。但用户问只能留一只时，必须直接回答哪一只更贴近 Frank 框架。
```

### F4. `ask-about-sector`

回答不要先铺概念，要先画产业链：

```text
上游瓶颈是什么？
钱从谁那里来？
谁最容易捕获价值？
瓶颈有没有迁移？
```

默认输出：

- 白话结论。
- 产业链 3-5 层。
- 当前瓶颈。
- 支持/打脸信号。

### F5. `ask-about-macro`

回答要把宏观翻译成资产影响：

```text
这件事会让市场里的钱更松还是更紧？
会压估值、压盈利，还是改变产业逻辑？
对 AI/crypto/高估值成长股的传导路径是什么？
```

保留风险等级：小级别、中级别、大级别，但必须解释成普通用户语言。

### F6. `ask-about-method`

不强制历史/现状结构。方法论问题的目标是教会用户使用框架：

- 先用一句话解释概念。
- 用一个市场例子。
- 说明 Frank 为什么在意。
- 给用户一个可复用的判断 checklist。

### F7. `ask-about-veto`

重点是解释 Frank 为什么不碰，而不是展开投研：

- meme / all in / 做空 / 低估烂公司分别触发哪个 Veto。
- 普通用户容易误解在哪里。
- 如果要继续研究，应该退回哪个更稳的问题。

### F8. 可选新增 `ask-about-latest`

如果后续要正式支持“Frank 最新观点是什么”，建议新增 framework skill，而不是塞进 stock/macro。

职责：

- 先检索最近相关推文。
- 明确区分“最近直接表态”和“按旧框架推断”。
- 如果最近没讲，直接说没有最近直接观点。
- 不强制四段。

## Content Skill 改造计划

### C1. content skill 不再写输出模板

`sector/` 和 `ticker/` 只提供判断坐标，不规定最终回答结构。

新模板：

```md
## 适用问题

## 一句话定位
这只票/板块在 Frank 框架里是什么位置。

## Frank 会先看什么
3-5 个关键变量，每个变量必须有白话解释。

## 这些变量怎么连接
用因果链讲清楚，不堆术语。

## 支持信号

## 削弱信号

## 打脸条件

## 常见误读

## 用户可见术语翻译

## Evidence Map

## 与其他 skill 协同
```

### C2. 每个 content skill 增加“白话判断问题”

例如 `sector/ai-infrastructure.md`：

```text
不要先说 Capex/RPO/HBM。
先说：AI 这条链的核心问题是，大厂继续花钱建算力，最终能不能变成真实收入；瓶颈现在卡在 GPU、HBM、电力还是网络。
```

例如 `ticker/NVDA.md`：

```text
Frank 看 NVDA 不是先看 PE，而是先看：算力需求有没有断，Blackwell/Rubin 出货有没有掉链子，大客户 capex 有没有缩，毛利率有没有被成本吃掉。
```

### C3. 每个指标都要有用户翻译

格式：

```md
- RPO：已签但还没交付的订单。它说明客户不是口头说想买，而是已经把未来需求写进合同。
- Capex：大客户愿不愿意继续掏钱建 AI 基建。只要他们还在花钱，上游算力链就还有需求支撑。
```

### C4. 清理投顾式措辞

在 ticker skill 源头替换：

- “加仓信号” -> “thesis 强化信号”
- “减风险条件” -> “风险复核信号”
- “已持有/未持有怎么看” -> “不同持仓状态下该观察什么”
- “回补/建仓窗口” -> “重新评估窗口”

### C5. 增加“Frank 味表达，但不冒充本人”

允许保留方法论风格：

- “拿不住 = 不够了解”
- “强信念必须有打脸条件”
- “别用一个宏大叙事替代数据验证”
- “先问产业故事有没有坏，再问估值贵不贵”

禁止：

- “Frank 现在建议买/卖”
- “Frank 一定会认为”
- “这就是 Frank 最新观点”，除非 RAG 召回近期直接观点。

## Eval / Harness 验收计划

### E1. 改造 deterministic eval

`backend/evals/kol_research/cases.yaml`：

- 移除全局 `required_sections: 结论 / Frank 过往观点 / 现状 / 总结`。
- 改成按 case 声明 `allowed_modes` / `expected_shape`。
- 增加短答、二选一、latest、method、no coverage case。

示例：

```yaml
- id: frank_compare_pick_one_short
  message: "NVDA 和 AVGO 只能留一只，按 Frank 框架只答一只和两句原因。"
  expected:
    response_mode: direct_short
    max_chars: 220
    must_call:
      - search_kol_tweets
    must_cover_data:
      - get_stock_brief:NVDA
      - get_stock_brief:AVGO
    answer_should_include_any:
      - NVDA
      - AVGO
    forbidden_sections:
      - Frank 过往观点
      - 现状
      - 总结
```

### E2. evaluator 增加可读性约束

`backend/evals/kol_research/evaluator.py` 增加 soft/hard checks：

- `max_chars` / `min_chars`
- `forbidden_sections`
- `must_include_any`
- `must_not_include_terms`，如裸 `coverage`、`parent_sector`、`marker`
- `jargon_requires_translation`：如果出现 `RPO` / `Capex` / `杀估值`，附近必须有解释词。
- `respects_brevity`：短答 case 不允许超过指定字符数。

### E3. 增加人工 rubric eval

LLM 或人工评审维度：

| 维度 | 标准 |
|---|---|
| 通俗度 | 普通用户不用投研背景也能懂 |
| Frank 框架感 | 能看出三杀、产业链、打脸条件、风险等级等框架 |
| 证据纪律 | 历史观点、当前事实、方法论推断分开 |
| 用户意图服从 | 用户要短答/二选一/表格时没有被模板覆盖 |
| 非投顾安全 | 不给直接买卖指令，不冒充本人 |

### E4. fixture 更新策略

- 先跑 fixture eval 确认 deterministic checks。
- 再跑 live eval 小集：stock / compare / sector / macro / method / no coverage / latest。
- 记录样本到 `backend/evals/kol_research/runs/`，人工复盘 10-20 条。

## 实施步骤

1. [x] 新增/更新 eval case schema：支持 response mode、max_chars、forbidden_sections、jargon translation 等检查。
2. [x] 修改 `evaluator.py`，让自动化验收不再硬保四段模板。
3. [x] 修改 `input_guard.py`，增加轻量 `response_hints`，先覆盖 brevity / choice / table / latest / method。
4. [x] 重写 `agent.py` 的 `_SKILL_TOOL_USAGE_RULES` 输出规则：从“统一四段”改成“response mode + 用户格式优先 + 白话框架”。
5. [x] 重写 6 个 framework skill，移除四段骨架，加入“用户真正想知道什么 / Frank 先问什么 / 短答形态 / 术语翻译”。
6. [x] 先改 1 个 sector skill 作为样板：`sector/ai-infrastructure.md`。
7. [x] 先改 3 个高频 ticker skill 作为样板：`ticker/NVDA.md`、`ticker/AMD.md`、`ticker/TSLA.md`。
8. [x] 跑 fixture eval + targeted unit tests，修正 deterministic 失败。
9. [ ] 跑 live eval 小集，人工评估回答是否更通俗、更有 Frank 框架感。
10. [ ] 批量迁移剩余 sector / ticker skill 到新模板。
11. [ ] 更新 `backend/app/features/kol_research/.context.md`，记录新 answer framework 和 eval 规则。

## 验证命令

```bash
cd backend
source venv/bin/activate
pytest tests/test_kol_research_eval.py tests/test_kol_research_input_guard.py tests/test_kol_persona_skill_unit.py -q
python scripts/run_kol_research_eval.py --mode fixture
python scripts/run_kol_research_eval.py --mode live --limit 8 --timeout 120
```

## 验收标准

1. 短答请求不再输出固定四段。
2. “只选一只”类问题能直接给出条件化选择，而不是回避。
3. 方法论问题不再强塞“现状”段，而是用白话解释 + checklist。
4. 个股/板块问题能明确体现 Frank 的框架：产业链位置、三杀分类、打脸条件、风险等级至少出现两个。
5. 专业术语出现时有普通解释。
6. 历史观点和当下事实分开，不把旧推文里的“现在”当作今天。
7. 不冒充 Frank，不输出直接买卖建议。
8. eval 不再以四段标题为核心指标，而以工具覆盖、引用合法、格式服从、可读性和安全为核心指标。

## 待定问题

1. `ask-about-latest` 是否现在就新增，还是先靠 `response_hints.question_shape=latest` + 现有 framework 处理。
2. 是否需要把 “response mode” 写进 final response payload，便于前端和 eval 观察。
3. 是否要引入 LLM-as-judge 做“Frank 味 / 通俗度”评分，还是先人工 review 20 条样本。
4. content skill 批量迁移时，是否优先只改 high coverage ticker，弱覆盖 ticker 继续保持 marker。
