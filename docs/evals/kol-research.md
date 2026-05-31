# KOL Research Eval

轻量 eval 用来检查 Frank/KOL agent 的硬性行为，不替代人工质量评审。

## 覆盖范围

- 工具覆盖：个股必须拿当前数据，KOL 观点必须检索 `search_kol_tweets`
- 引用有效性：答案里的 `[#N]` 必须能对应本轮返回的 `kol_chunks`
- 安全边界：禁止冒充 qinbafrank，禁止直接买卖/加减仓指令
- 成本护栏：`google_search` 每轮最多一次，并且使用后必须标注来源
- 实体保持：case 要求的 ticker 必须出现在答案、工具参数或引用 payload 中

注意：Frank agent 的 `input_guard` 会在 LLM 前预取
`get_stock_brief` / `get_macro_brief`。这些预取当前不会进入
`response.tool_calls`，所以 case 里用 `must_cover_data` 表示“必须覆盖当下
数据”。Evaluator 会接受两种证据：显式 tool call，或最终答案没有
`数据覆盖提示` 降级警告。

## 运行

不触网 fixture smoke：

```bash
cd backend
source venv/bin/activate
python scripts/run_kol_research_eval.py --mode fixture
```

真实 Frank agent 小样本：

```bash
cd backend
source venv/bin/activate
python scripts/run_kol_research_eval.py --mode live --limit 2 --timeout 120
```

输出在 `backend/evals/kol_research/runs/<timestamp>/`：

- `results.jsonl`：每条 case 的完整 response 和 checks
- `summary.json`：汇总指标
- `report.md`：人类可读报告

## Gate 建议

CI 先跑 fixture + 单测。nightly 或手动跑 live。

- hard invariant pass rate: 100%
- citation range validity: 100%
- direct investment advice violations: 0
- google_search calls: <= 1 per case
- live smoke p95 latency: < 45s
