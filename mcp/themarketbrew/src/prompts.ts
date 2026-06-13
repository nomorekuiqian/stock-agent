type PromptDefinition = {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
};

export const PROMPTS: PromptDefinition[] = [
  {
    name: "themarketbrew-stock-diagnosis",
    title: "Market Lens Stock Diagnosis",
    description: "Ask the client agent to retrieve the relevant persona lenses/evidence and write a stock diagnosis.",
    arguments: [
      { name: "persona", description: "Optional persona username. If absent, choose one from market_lens_personas based on query and coverage.", required: false },
      { name: "ticker", description: "Ticker symbol, for example NVDA.", required: true },
      { name: "question", description: "Stock question to answer.", required: true },
    ],
  },
  {
    name: "themarketbrew-topic-research",
    title: "Market Lens Topic Research",
    description: "Ask the client agent to search distilled material and evidence before answering a topic question.",
    arguments: [
      { name: "persona", description: "Optional persona username. If absent, choose one from market_lens_personas based on query and coverage.", required: false },
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
      persona
        ? `Persona: ${persona}`
        : "Persona: not specified. First call market_lens_personas, choose the best persona for this ticker/question based on methodology and lens coverage, then pass persona explicitly.",
      `Question: ${question}`,
      `Ticker: ${ticker}`,
      "",
      "If any tool returns auth_required, call market_lens_login and ask the user to approve the TheMarketBrew account authorization, then poll market_lens_auth_status with device_code.",
      "For current facts, call market_lens_get_brief first. Use market_lens_get_stock_data only when you need specific sections such as technical, forward_valuation, transcript, insider_trading, or press_releases.",
      "Call market_lens_get_lens for the ticker lens if covered, and market_lens_search_lenses if the exact lens is unclear.",
      "Call market_lens_search_evidence or market_lens_get_evidence_by_ids when direct historical evidence is needed.",
      "Use market_lens_stock_diagnosis when you need a composed backend context pack with persona methodology, evidence, and data_context/news_context.",
      "Write the final answer in Chinese unless the user requested English.",
      "Separate distilled methodology, direct historical evidence, live/current facts, and inference.",
      "Avoid direct trading commands and exact price targets.",
    ]);
  }

  if (name === "themarketbrew-topic-research") {
    return promptResponse([
      persona
        ? `Persona: ${persona}`
        : "Persona: not specified. First call market_lens_personas, choose the best persona for this topic/question based on methodology and lens coverage, then pass persona explicitly.",
      `Question: ${question}`,
      "",
      "If any tool returns auth_required, call market_lens_login and ask the user to approve the TheMarketBrew account authorization, then poll market_lens_auth_status with device_code.",
      "For macro/current-market questions, use market_lens_get_market_data. For recent events, use market_lens_get_news.",
      "Call market_lens_search_lenses to find relevant distilled material.",
      "Then call market_lens_get_lens for the most relevant core/framework/macro/sector/ticker lens.",
      "Use Evidence Map tweet IDs or market_lens_search_evidence only when direct historical posts are needed.",
      "Write the final answer from returned context only; label methodology versus direct evidence.",
    ]);
  }

  return {
    description: `Unknown prompt: ${name}`,
    messages: [],
  };
}

function promptResponse(lines: string[]) {
  return {
    description: "Use TheMarketBrew MCP backend context.",
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
