import {
  authStatus,
  buildContext,
  dataCatalog,
  getEvidenceByIds,
  getBrief,
  getLens,
  getMarketData,
  getNews,
  getStockData,
  listLenses,
  listPersonas,
  login,
  logout,
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
  description: "Persona username. Choose it from market_lens_personas based on the user's query and lens coverage. If omitted, a configured THEMARKETBREW_PERSONA fallback is used only when explicitly set.",
};

const LENS_TYPE_PROPERTY = {
  type: "string",
  enum: ["core", "framework", "macro", "sector", "ticker"],
  description: "Distilled material layer to retrieve.",
};

const STOCK_DATA_SECTIONS = [
  "quote",
  "profile",
  "fundamentals",
  "forward_valuation",
  "historical_valuation",
  "technical",
  "news",
  "earnings_calendar",
  "price_history",
  "earnings_data",
  "transcript",
  "insider_trading",
  "press_releases",
  "market_overview",
];

const MARKET_DATA_SECTIONS = [
  "market_overview",
  "macro_brief",
  "macro_risk",
  "liquidity",
  "sentiment",
  "economic_calendar",
  "earnings_calendar",
  "morning_report",
  "weekly_report",
  "twitter_digest",
];

export const TOOLS: ToolDefinition[] = [
  {
    name: "market_lens_status",
    title: "Market Lens Status",
    description: [
      "Check local adapter configuration and backend status.",
      "Call first when diagnosing setup, backend connectivity, or available tool surface.",
      "If no persona is configured, returns available personas and routing guidance instead of pinning a default persona.",
    ].join(" "),
    inputSchema: objectSchema({ persona: PERSONA_PROPERTY }),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_login",
    title: "Market Lens Login",
    description: [
      "Authorize this MCP client with a TheMarketBrew account using a browser/device flow.",
      "Call when status or any content tool returns auth_required.",
      "The tool returns a verification URL and user code; after approving in the browser, call market_lens_auth_status with device_code.",
    ].join(" "),
    inputSchema: objectSchema({
      client_name: {
        type: "string",
        description: "Optional client/workspace label shown on the authorization screen.",
      },
      device_code: {
        type: "string",
        description: "Optional existing device_code to poll instead of starting a new login.",
      },
    }),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_auth_status",
    title: "Market Lens Auth Status",
    description: [
      "Check whether this MCP adapter has a valid TheMarketBrew account token.",
      "If device_code is provided, poll the browser/device authorization and store the MCP token when approved.",
    ].join(" "),
    inputSchema: objectSchema({
      device_code: {
        type: "string",
        description: "Device code returned by market_lens_login. Omit to check the currently stored token.",
      },
    }),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_logout",
    title: "Market Lens Logout",
    description: "Revoke the current TheMarketBrew MCP token and remove the local token cache.",
    inputSchema: objectSchema({}),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_data_catalog",
    title: "Market Lens Data Catalog",
    description: [
      "List TheMarketBrew backend data capabilities, section names, limits, freshness policies, and routing guidance.",
      "Call when deciding which data tool to use or when debugging account/tool availability.",
    ].join(" "),
    inputSchema: objectSchema({}),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_get_brief",
    title: "Market Lens Brief",
    description: [
      "Fetch a coarse-grained stock, peer, macro, or industry brief.",
      "Use this as the default current-facts entry point before asking for fine-grained sections.",
    ].join(" "),
    inputSchema: objectSchema({
      brief_type: {
        type: "string",
        enum: ["stock", "peer", "macro", "industry"],
        description: "Brief type. stock/peer/industry require symbol; macro does not.",
      },
      symbol: { type: "string", description: "Ticker symbol for stock/peer/industry brief." },
      symbols: {
        type: "array",
        items: { type: "string" },
        description: "Optional multi-symbol stock brief list. P0 max 5.",
      },
      include_market_data: {
        type: "boolean",
        description: "Compatibility flag; defaults to true.",
      },
    }, ["brief_type"]),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_get_stock_data",
    title: "Market Lens Stock Data",
    description: [
      "Fetch fine-grained data sections for one ticker.",
      "Use after get_brief when exact quote/profile/fundamentals/valuation/technical/news/earnings/transcript/insider/press data is needed.",
    ].join(" "),
    inputSchema: objectSchema({
      symbol: { type: "string", description: "Ticker symbol, for example NVDA." },
      sections: {
        type: "array",
        items: { type: "string", enum: STOCK_DATA_SECTIONS },
        description: "Stock data sections to fetch. Max 8.",
      },
      days: { type: "number", description: "News/calendar lookback in days, 1-30. Defaults to 7." },
      history_days: { type: "number", description: "Price history lookback, 5-1825. Defaults to 365." },
      year: { type: "number", description: "Fiscal year for transcript." },
      quarter: { type: "number", description: "Fiscal quarter for transcript, 1-4." },
      limit: { type: "number", description: "Section item limit, 1-100. Defaults to 30." },
    }, ["symbol", "sections"]),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_get_market_data",
    title: "Market Lens Market Data",
    description: [
      "Fetch market, macro, calendar, and report sections.",
      "Use for market regime, macro background, liquidity/risk/sentiment, economic calendar, morning/weekly reports, or Twitter digest context.",
    ].join(" "),
    inputSchema: objectSchema({
      sections: {
        type: "array",
        items: { type: "string", enum: MARKET_DATA_SECTIONS },
        description: "Market data sections to fetch. Max 8.",
      },
      days: { type: "number", description: "Calendar/news horizon in days, 1-30. Defaults to 14." },
    }, ["sections"]),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_get_news",
    title: "Market Lens News",
    description: [
      "Fetch source-attributed recent news from stock, market, press release, morning report, and Twitter digest sources.",
      "Use for recent events; combine with persona workflow when interpretation through a persona lens is needed.",
    ].join(" "),
    inputSchema: objectSchema({
      symbols: {
        type: "array",
        items: { type: "string" },
        description: "Optional ticker symbols. Max 10.",
      },
      scope: {
        type: "string",
        enum: ["stock", "market", "press_releases", "twitter_digest", "morning_report", "all"],
        description: "News source scope. Defaults to all.",
      },
      days: { type: "number", description: "Lookback days, 1-30. Defaults to 7." },
      limit: { type: "number", description: "Maximum returned items, 1-50. Defaults to 20." },
    }),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "market_lens_personas",
    title: "Market Lens Personas",
    description: [
      "List personas with distilled material available in the backend.",
      "Call before selecting a blogger/persona, especially when the user did not explicitly name one.",
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
      "Call after choosing a persona, when routing a broad question, discovering coverage, or choosing the exact lens_id for get_lens.",
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
      "Call after choosing a persona, when the user asks about a topic, phrase, market rule, industry, or ticker and you do not know the exact lens ID.",
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
      "Call after choosing a persona, when the final answer needs direct historical posts or citations beyond the distilled methodology lens.",
      "Returns vector-search tweet chunks with citation metadata.",
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
      "Call after choosing a persona, when the user question spans material lenses, historical evidence, and optional live market facts but does not fit a stricter workflow.",
      "Returns kol_chunks, market_context, ticker methodology summary, and answer discipline.",
    ].join(" "),
    inputSchema: workflowSchema(true),
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
    inputSchema: workflowSchema(false),
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
    inputSchema: workflowSchema(true),
    annotations: readOnlyOpenWorld(),
  },
];

export async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "market_lens_status":
      return marketLensStatus(args);
    case "market_lens_login":
      return login(args);
    case "market_lens_auth_status":
      return authStatus(args);
    case "market_lens_logout":
      return logout(args);
    case "market_lens_data_catalog":
      return dataCatalog(args);
    case "market_lens_get_brief":
      return getBrief(args);
    case "market_lens_get_stock_data":
      return getStockData(args);
    case "market_lens_get_market_data":
      return getMarketData(args);
    case "market_lens_get_news":
      return getNews(args);
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "object",
    properties,
    required,
  };
}

function workflowSchema(questionRequired: boolean) {
  return objectSchema({
    persona: PERSONA_PROPERTY,
    question: { type: "string", description: "The user's question." },
    ticker: { type: "string", description: "Optional ticker symbol if the question is anchored to one stock." },
    sector: { type: "string", description: "Optional sector or lens key." },
    evidence_limit: { type: "number", description: "Maximum evidence chunks, 1-12. Defaults to 6." },
    include_market_data: { type: "boolean", description: "Whether backend should include market brief data. Defaults to true." },
    data_sections: {
      type: "array",
      items: { type: "string" },
      description: "Optional explicit data sections, e.g. stock_brief, technical, news, macro_brief.",
    },
    news_days: { type: "number", description: "News/data lookback in days, 1-30. Defaults to 7." },
  }, questionRequired ? ["question"] : []);
}

function stockWorkflowSchema() {
  return objectSchema({
    persona: PERSONA_PROPERTY,
    question: { type: "string", description: "The user's stock question." },
    ticker: { type: "string", description: "Ticker symbol, for example NVDA." },
    sector: { type: "string", description: "Optional sector key." },
    evidence_limit: { type: "number", description: "Maximum evidence chunks, 1-12. Defaults to 6." },
    include_market_data: { type: "boolean", description: "Whether backend should include market brief data. Defaults to true." },
    data_sections: {
      type: "array",
      items: { type: "string" },
      description: "Optional explicit data sections, e.g. stock_brief, technical, news, macro_brief.",
    },
    news_days: { type: "number", description: "News/data lookback in days, 1-30. Defaults to 7." },
  }, ["question", "ticker"]);
}

function compareWorkflowSchema() {
  return objectSchema({
    persona: PERSONA_PROPERTY,
    question: { type: "string", description: "The user's comparison question." },
    tickers: { type: "array", items: { type: "string" }, description: "Ticker symbols to compare." },
    sector: { type: "string", description: "Optional sector key." },
    evidence_limit: { type: "number", description: "Maximum evidence chunks, 1-12. Defaults to 6." },
    include_market_data: { type: "boolean", description: "Whether backend should include market brief data. Defaults to true." },
    data_sections: {
      type: "array",
      items: { type: "string" },
      description: "Optional explicit data sections, e.g. stock_brief, peer_brief, news, macro_brief.",
    },
    news_days: { type: "number", description: "News/data lookback in days, 1-30. Defaults to 7." },
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
