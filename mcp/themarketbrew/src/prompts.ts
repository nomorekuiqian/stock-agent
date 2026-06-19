type PromptDefinition = {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
};

export const PROMPTS: PromptDefinition[] = [
  {
    name: "themarketbrew-stock-diagnosis",
    title: "TheMarketBrew Stock Diagnosis",
    description: "Retrieve persona context and market data, then ask the caller's agent to write a stock diagnosis.",
    arguments: [
      { name: "persona", description: "Optional persona username. If absent, backend selects by lens coverage.", required: false },
      { name: "ticker", description: "Ticker symbol, for example NVDA.", required: true },
      { name: "question", description: "Stock question to answer.", required: true },
    ],
  },
  {
    name: "themarketbrew-topic-research",
    title: "TheMarketBrew Topic Research",
    description: "Retrieve persona context and optional market data for a topic question.",
    arguments: [
      { name: "persona", description: "Optional persona username. If absent, backend selects by lens coverage.", required: false },
      { name: "question", description: "Topic, industry, rule, market pattern, or method question.", required: true },
    ],
  },
];

export function getPrompt(name: string, args: Record<string, string | undefined>) {
  const persona = (args.persona || "").trim();
  const question = (args.question || "").trim();
  const ticker = (args.ticker || "").trim().toUpperCase();

  if (name === "themarketbrew-stock-diagnosis") {
    return promptResponse([
      persona ? `Persona: ${persona}` : "Persona: not specified. Let themarketbrew_persona_context select by lens coverage.",
      `Question: ${question}`,
      `Ticker: ${ticker}`,
      "",
      "Call themarketbrew_discovery if you have not already inspected available personas and data sections.",
      "Call themarketbrew_persona_context with the ticker and question. It returns methodology, selected lenses, historical evidence, and answer discipline.",
      "Call themarketbrew_market_data with data_type=brief or data_type=stock for current facts. Use stock_sections only when specific sections are needed.",
      "Write the final answer with your own model. Separate methodology, direct historical evidence, live/current facts, and inference.",
      "Do not impersonate a persona, issue direct trading commands, or give exact price targets.",
    ]);
  }

  if (name === "themarketbrew-topic-research") {
    return promptResponse([
      persona ? `Persona: ${persona}` : "Persona: not specified. Let themarketbrew_persona_context select by lens coverage.",
      `Question: ${question}`,
      "",
      "Call themarketbrew_discovery if you have not already inspected available personas and data sections.",
      "Call themarketbrew_persona_context for methodology, lens context, and historical evidence.",
      "For macro/current-market questions, call themarketbrew_market_data with data_type=market. For recent events, use data_type=news.",
      "Write the final answer from returned context only; label methodology versus direct evidence and current facts.",
    ]);
  }

  return {
    description: `Unknown prompt: ${name}`,
    messages: [],
  };
}

function promptResponse(lines: string[]) {
  return {
    description: "Use TheMarketBrew OKX Context MCP backend context.",
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: lines.join("\n"),
        },
      },
    ],
  };
}
