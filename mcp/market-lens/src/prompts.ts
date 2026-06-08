type PromptDefinition = {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
};

export const PROMPTS: PromptDefinition[] = [
  {
    name: "market-lens-stock-diagnosis",
    title: "Market Lens Stock Diagnosis",
    description: "Ask the client agent to retrieve the relevant persona lenses/evidence and write a stock diagnosis.",
    arguments: [
      { name: "persona", description: "Persona username, for example qinbafrank.", required: false },
      { name: "ticker", description: "Ticker symbol, for example NVDA.", required: true },
      { name: "question", description: "Stock question to answer.", required: true },
    ],
  },
  {
    name: "market-lens-topic-research",
    title: "Market Lens Topic Research",
    description: "Ask the client agent to search distilled material and evidence before answering a topic question.",
    arguments: [
      { name: "persona", description: "Persona username, for example qinbafrank.", required: false },
      { name: "question", description: "Topic, industry, rule, market pattern, or method question.", required: true },
    ],
  },
  {
    name: "frank-stock-diagnosis",
    title: "Frank Stock Diagnosis (Legacy)",
    description: "Compatibility prompt for qinbafrank stock diagnosis.",
    arguments: [
      { name: "ticker", description: "Ticker symbol, for example NVDA.", required: true },
      { name: "question", description: "Stock question to answer.", required: true },
    ],
  },
  {
    name: "frank-market-regime",
    title: "Frank Market Regime (Legacy)",
    description: "Compatibility prompt for qinbafrank market-regime questions.",
    arguments: [
      { name: "question", description: "Market-regime question to answer.", required: false },
    ],
  },
];

export function getPrompt(name: string, args: Record<string, string | undefined>) {
  const persona = (args.persona || "qinbafrank").trim() || "qinbafrank";
  const question = (args.question || "").trim();
  const ticker = (args.ticker || "").trim().toUpperCase();

  if (name === "market-lens-stock-diagnosis") {
    return promptResponse([
      `Persona: ${persona}`,
      `Question: ${question}`,
      `Ticker: ${ticker}`,
      "",
      "Call market_lens_get_lens for the ticker lens if covered, and market_lens_search_lenses if the exact lens is unclear.",
      "Call market_lens_search_evidence or market_lens_get_evidence_by_ids when direct historical evidence is needed.",
      "Use market_lens_stock_diagnosis when you need a composed backend context pack with market facts.",
      "Write the final answer in Chinese unless the user requested English.",
      "Separate distilled methodology, direct historical evidence, live/current facts, and inference.",
      "Avoid direct trading commands and exact price targets.",
    ]);
  }

  if (name === "market-lens-topic-research") {
    return promptResponse([
      `Persona: ${persona}`,
      `Question: ${question}`,
      "",
      "Call market_lens_search_lenses to find relevant distilled material.",
      "Then call market_lens_get_lens for the most relevant core/framework/macro/sector/ticker lens.",
      "Use Evidence Map tweet IDs or market_lens_search_evidence only when direct historical posts are needed.",
      "Write the final answer from returned context only; label methodology versus direct evidence.",
    ]);
  }

  if (name === "frank-stock-diagnosis") {
    return promptResponse([
      "Persona: qinbafrank",
      `Question: ${question}`,
      `Ticker: ${ticker}`,
      "",
      "Prefer market_lens_stock_diagnosis with persona qinbafrank, or frank_stock_diagnosis for legacy clients.",
      "Use the returned backend context pack as source material.",
      "Separate direct Frank evidence, live market facts, and methodology inference.",
      "Avoid direct trading commands and exact price targets.",
    ]);
  }

  if (name === "frank-market-regime") {
    return promptResponse([
      "Persona: qinbafrank",
      `Question: ${question || "按 Frank 框架判断当前市场行情。"}`,
      "",
      "Prefer market_lens_market_regime with persona qinbafrank, or frank_market_regime for legacy clients.",
      "Use returned context as source material.",
      "Separate direct Frank evidence, current market facts, and methodology inference.",
    ]);
  }

  return {
    description: `Unknown prompt: ${name}`,
    messages: [],
  };
}

function promptResponse(lines: string[]) {
  return {
    description: "Use Market Lens MCP backend context.",
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
