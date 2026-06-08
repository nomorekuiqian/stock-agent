import {
  buildContext,
  getEvidenceByIds,
  getLens,
  listLenses,
  listPersonas,
  marketLensStatus,
  runWorkflow,
  searchEvidence,
  searchLenses,
} from "./live.js";

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
};

const PERSONA_PROPERTY = {
  type: "string",
  description: "Persona username. Defaults to MARKET_LENS_PERSONA or qinbafrank.",
};

const LENS_TYPE_PROPERTY = {
  type: "string",
  enum: ["core", "framework", "macro", "sector", "ticker"],
  description: "Distilled material layer to retrieve.",
};

export const TOOLS: ToolDefinition[] = [
  {
    name: "market_lens_status",
    title: "Market Lens Status",
    description: [
      "Check local adapter configuration and backend status for the selected persona.",
      "Call first when diagnosing setup, backend connectivity, invite status, or available tool surface.",
      "Returns adapter config, beta status, persona metadata, and tool names. Does not require an invite code.",
    ].join(" "),
    inputSchema: objectSchema({ persona: PERSONA_PROPERTY }),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_personas",
    title: "Market Lens Personas",
    description: [
      "List personas with distilled material available in the backend.",
      "Call before selecting a blogger/persona or when the user asks which lenses are available.",
      "Returns persona capability metadata, material lens counts, supported context tools, and supported workflows.",
    ].join(" "),
    inputSchema: objectSchema({}),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_list_lenses",
    title: "Market Lens Lens Index",
    description: [
      "List the distilled material index for one persona across core/framework/macro/sector/ticker layers.",
      "Call when routing a broad question, discovering coverage, or choosing the exact lens_id for get_lens.",
      "Returns index metadata only: lens IDs, descriptions, coverage, evidence counts, and call guidance.",
    ].join(" "),
    inputSchema: objectSchema({
      persona: PERSONA_PROPERTY,
      lens_type: {
        ...LENS_TYPE_PROPERTY,
        description: "Optional material layer filter. Omit to list all layers.",
      },
    }),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_get_lens",
    title: "Market Lens Full Lens",
    description: [
      "Retrieve one complete distilled material lens for a persona.",
      "Call when the user asks how a persona thinks about a stock, sector, market rule, framework, or macro regime.",
      "Returns full markdown body, parsed sections, metadata, Evidence Map tweet IDs, and guidance for how to use that context.",
    ].join(" "),
    inputSchema: objectSchema({
      persona: PERSONA_PROPERTY,
      lens_type: LENS_TYPE_PROPERTY,
      lens_id: {
        type: "string",
        description: "Lens ID, usually the markdown stem: NVDA, ai-infrastructure, ask-about-stock, operating-system.",
      },
    }, ["lens_type", "lens_id"]),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_search_lenses",
    title: "Market Lens Material Search",
    description: [
      "Search across all distilled material markdown for a persona.",
      "Call when the user asks about a topic, phrase, market rule, industry, or ticker and you do not know the exact lens ID.",
      "Returns ranked lens matches, snippets, metadata, Evidence Map tweet IDs, and optional full bodies.",
    ].join(" "),
    inputSchema: objectSchema({
      persona: PERSONA_PROPERTY,
      query: {
        type: "string",
        description: "Topic, ticker, phrase, rule, or question to search in distilled material.",
      },
      lens_types: {
        type: "array",
        items: LENS_TYPE_PROPERTY,
        description: "Optional layer filters. Omit to search all material layers.",
      },
      limit: {
        type: "number",
        description: "Maximum lens matches, 1-30. Defaults to 8.",
      },
      include_body: {
        type: "boolean",
        description: "Whether to include full lens bodies in search results. Defaults to false.",
      },
    }, ["query"]),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_search_evidence",
    title: "Market Lens Evidence Search",
    description: [
      "Semantic search over a persona's historical tweet evidence corpus.",
      "Call when the final answer needs direct historical posts or citations beyond the distilled methodology lens.",
      "Returns vector-search tweet chunks with citation metadata. Requires MARKET_LENS_INVITE_CODE.",
    ].join(" "),
    inputSchema: objectSchema({
      persona: PERSONA_PROPERTY,
      query: { type: "string", description: "Question, topic, ticker, or phrase to search in historical evidence." },
      k: { type: "number", description: "Number of chunks to retrieve, 1-20. Defaults to 6." },
      threshold: { type: "number", description: "Similarity threshold, 0-1. Defaults to 0.45." },
    }, ["query"]),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_get_evidence_by_ids",
    title: "Market Lens Evidence By IDs",
    description: [
      "Fetch original historical tweets referenced by a lens Evidence Map.",
      "Call after get_lens returns evidence_tweet_ids and the user needs the actual past posts behind the distilled rule.",
      "Returns full-text tweet evidence for requested IDs, preserving request order when found.",
    ].join(" "),
    inputSchema: objectSchema({
      persona: PERSONA_PROPERTY,
      tweet_ids: {
        type: "array",
        items: { type: "string" },
        description: "Tweet IDs from a lens Evidence Map. Maximum 30.",
      },
    }, ["tweet_ids"]),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_build_context",
    title: "Market Lens Build Context",
    description: [
      "Build a mixed context pack for an open-ended question.",
      "Call when the user question spans material lenses, historical evidence, and optional live market facts but does not fit a stricter workflow.",
      "Returns kol_chunks, market_context, ticker methodology summary, and answer discipline.",
    ].join(" "),
    inputSchema: workflowSchema(true, false),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_stock_diagnosis",
    title: "Market Lens Stock Diagnosis",
    description: [
      "Return a backend context pack for judging a stock through the selected persona's lens.",
      "Call for ticker-specific questions such as thesis, valuation/earnings/logic risk, pullbacks, falsifiers, or what the persona would watch.",
      "Returns historical evidence, market facts, methodology context, answer discipline, and suggested answer shape.",
    ].join(" "),
    inputSchema: stockWorkflowSchema(),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_market_regime",
    title: "Market Lens Market Regime",
    description: [
      "Return a backend context pack for broad market, macro, liquidity, policy, or risk-regime questions.",
      "Call when the user asks how the persona reads current market conditions or recurring market rules.",
      "Returns macro-relevant evidence, market facts when available, methodology context, and answer discipline.",
    ].join(" "),
    inputSchema: workflowSchema(false, false),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_compare",
    title: "Market Lens Compare",
    description: [
      "Return a context pack for comparing two or more tickers or opportunities through one persona.",
      "Call when the user asks which is more aligned with the persona's framework, which has stronger evidence, or asks to pick one.",
      "Returns comparison-oriented evidence, market facts, methodology context, and suggested answer shape.",
    ].join(" "),
    inputSchema: compareWorkflowSchema(),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_research_memo",
    title: "Market Lens Research Memo",
    description: [
      "Return a deeper context pack for a memo-style answer.",
      "Call when the user asks for a detailed research memo, thesis review, or multi-layer explanation.",
      "Returns evidence, market context, methodology context, risk/falsifier guidance, and suggested memo structure.",
    ].join(" "),
    inputSchema: workflowSchema(true, false),
    annotations: readOnlyOpenWorld(),
  },
  ...legacyFrankTools(),
];

export async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "market_lens_status":
      return marketLensStatus(args);
    case "market_lens_personas":
      return listPersonas(args);
    case "market_lens_list_lenses":
      return listLenses(args);
    case "market_lens_get_lens":
      return getLens(args);
    case "market_lens_search_lenses":
      return searchLenses(args);
    case "market_lens_search_evidence":
      return searchEvidence(args);
    case "market_lens_get_evidence_by_ids":
      return getEvidenceByIds(args);
    case "market_lens_build_context":
      return buildContext(args);
    case "market_lens_stock_diagnosis":
      return runWorkflow("stock_diagnosis", args);
    case "market_lens_market_regime":
      return runWorkflow("market_regime", args);
    case "market_lens_compare":
      return runWorkflow("compare", args);
    case "market_lens_research_memo":
      return runWorkflow("research_memo", args);
    case "frank_status":
      return marketLensStatus(withFrankPersona(args));
    case "frank_search_evidence":
      return searchEvidence(withFrankPersona(args));
    case "frank_stock_diagnosis":
      return runWorkflow("stock_diagnosis", withFrankPersona(args));
    case "frank_market_regime":
      return runWorkflow("market_regime", withFrankPersona(args));
    case "frank_compare":
      return runWorkflow("compare", withFrankPersona(args));
    case "frank_research_memo":
      return runWorkflow("research_memo", withFrankPersona(args));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function legacyFrankTools(): ToolDefinition[] {
  return [
    {
      name: "frank_status",
      title: "Frank Lens Status (Legacy)",
      description: "Compatibility alias for market_lens_status with persona fixed to qinbafrank. Prefer market_lens_status for new clients.",
      inputSchema: objectSchema({}),
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_search_evidence",
      title: "Frank Evidence Search (Legacy)",
      description: "Compatibility alias for market_lens_search_evidence with persona fixed to qinbafrank. Prefer market_lens_search_evidence.",
      inputSchema: objectSchema({
        query: { type: "string", description: "Question, topic, ticker, or phrase to search." },
        k: { type: "number", description: "Number of chunks to retrieve, 1-20. Defaults to 6." },
        threshold: { type: "number", description: "Similarity threshold, 0-1. Defaults to 0.45." },
      }, ["query"]),
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_stock_diagnosis",
      title: "Frank Stock Diagnosis Context (Legacy)",
      description: "Compatibility alias for market_lens_stock_diagnosis with persona fixed to qinbafrank. Prefer market_lens_stock_diagnosis.",
      inputSchema: stockWorkflowSchema(true),
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_market_regime",
      title: "Frank Market Regime Context (Legacy)",
      description: "Compatibility alias for market_lens_market_regime with persona fixed to qinbafrank. Prefer market_lens_market_regime.",
      inputSchema: workflowSchema(false, true),
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_compare",
      title: "Frank Compare Context (Legacy)",
      description: "Compatibility alias for market_lens_compare with persona fixed to qinbafrank. Prefer market_lens_compare.",
      inputSchema: compareWorkflowSchema(true),
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_research_memo",
      title: "Frank Research Memo Context (Legacy)",
      description: "Compatibility alias for market_lens_research_memo with persona fixed to qinbafrank. Prefer market_lens_research_memo.",
      inputSchema: workflowSchema(true, true),
      annotations: readOnlyOpenWorld(),
    },
  ];
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "object",
    properties,
    required,
  };
}

function workflowSchema(questionRequired: boolean, legacy: boolean) {
  return objectSchema({
    ...(legacy ? {} : { persona: PERSONA_PROPERTY }),
    question: { type: "string", description: "The user's question." },
    ticker: { type: "string", description: "Optional ticker symbol if the question is anchored to one stock." },
    sector: { type: "string", description: "Optional sector or lens key." },
    evidence_limit: { type: "number", description: "Maximum evidence chunks, 1-12. Defaults to 6." },
    include_market_data: { type: "boolean", description: "Whether backend should include market brief data. Defaults to true." },
  }, questionRequired ? ["question"] : []);
}

function stockWorkflowSchema(legacy = false) {
  return objectSchema({
    ...(legacy ? {} : { persona: PERSONA_PROPERTY }),
    question: { type: "string", description: "The user's stock question." },
    ticker: { type: "string", description: "Ticker symbol, for example NVDA." },
    sector: { type: "string", description: "Optional sector key." },
    evidence_limit: { type: "number", description: "Maximum evidence chunks, 1-12. Defaults to 6." },
    include_market_data: { type: "boolean", description: "Whether backend should include market brief data. Defaults to true." },
  }, ["question", "ticker"]);
}

function compareWorkflowSchema(legacy = false) {
  return objectSchema({
    ...(legacy ? {} : { persona: PERSONA_PROPERTY }),
    question: { type: "string", description: "The user's comparison question." },
    tickers: { type: "array", items: { type: "string" }, description: "Ticker symbols to compare." },
    sector: { type: "string", description: "Optional sector key." },
    evidence_limit: { type: "number", description: "Maximum evidence chunks, 1-12. Defaults to 6." },
    include_market_data: { type: "boolean", description: "Whether backend should include market brief data. Defaults to true." },
  }, ["question", "tickers"]);
}

function readOnlyOpenWorld() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
}

function withFrankPersona(args: Record<string, unknown>) {
  return { ...args, persona: "qinbafrank" };
}
