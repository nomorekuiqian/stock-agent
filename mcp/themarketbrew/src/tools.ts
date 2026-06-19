import {
  discovery,
  marketData,
  personaContext,
} from "./live.js";

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
};

const LENS_TYPES = ["core", "framework", "macro", "sector", "ticker"];
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
    name: "themarketbrew_discovery",
    title: "TheMarketBrew Discovery",
    description: [
      "Discover available TheMarketBrew context tools, personas, data sections, payment/auth model, limits, and routing guidance.",
      "Call first before deciding which persona or data sections to request.",
      "This is a free metadata/capability endpoint.",
    ].join(" "),
    inputSchema: objectSchema({}),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "themarketbrew_persona_context",
    title: "TheMarketBrew Persona Context",
    description: [
      "Return selected persona methodology, lens context, historical Evidence Map posts, and optional vector corpus evidence.",
      "Use for questions such as how a blogger/persona historically thinks about a stock, sector, market regime, or thesis.",
      "This returns context only; the calling agent writes the final answer with its own model.",
    ].join(" "),
    inputSchema: objectSchema({
      question: { type: "string", description: "The user's research question." },
      persona: {
        type: "string",
        description: "Optional persona username. If omitted, backend selects by lens coverage and query fit.",
      },
      ticker: { type: "string", description: "Optional primary ticker, for example NVDA." },
      tickers: { type: "array", items: { type: "string" }, description: "Optional ticker list for comparison or broad context." },
      sector: { type: "string", description: "Optional sector, theme, or lens key." },
      lens_types: {
        type: "array",
        items: { type: "string", enum: LENS_TYPES },
        description: "Optional material layer filters. Omit to search all layers.",
      },
      lens_limit: { type: "number", description: "Maximum selected lenses, 1-12. Defaults to 6." },
      evidence_limit: { type: "number", description: "Maximum vector evidence chunks, 0-12. Defaults to 6." },
      include_lens_body: { type: "boolean", description: "Include full distilled lens markdown. Defaults to true." },
      include_evidence_map: { type: "boolean", description: "Hydrate Evidence Map tweet IDs. Defaults to true." },
      include_vector_evidence: { type: "boolean", description: "Search indexed historical evidence chunks. Defaults to true." },
      language: { type: "string", enum: ["zh", "en", "auto"], description: "Preferred response language hint for the caller." },
    }, ["question"]),
    annotations: readOnlyOpenWorld(),
  },
  {
    name: "themarketbrew_market_data",
    title: "TheMarketBrew Market Data",
    description: [
      "Return stock, macro, calendar, report, or news data through one aggregated tool.",
      "Use data_type=catalog to discover sections, data_type=brief for compressed stock/peer/macro/industry facts, data_type=stock for exact ticker sections, data_type=market for macro/report sections, and data_type=news for recent events.",
      "This returns data envelopes and section-level errors, not investment advice.",
    ].join(" "),
    inputSchema: objectSchema({
      data_type: {
        type: "string",
        enum: ["catalog", "brief", "stock", "market", "news"],
        description: "Which data operation to perform. Defaults to catalog.",
      },
      symbol: { type: "string", description: "Primary ticker for brief/stock/news requests." },
      symbols: { type: "array", items: { type: "string" }, description: "Optional ticker list." },
      brief_type: {
        type: "string",
        enum: ["stock", "peer", "macro", "industry"],
        description: "Brief type when data_type=brief. stock/peer/industry require symbol.",
      },
      stock_sections: {
        type: "array",
        items: { type: "string", enum: STOCK_DATA_SECTIONS },
        description: "Sections when data_type=stock. Omit for quote/profile/fundamentals/news.",
      },
      market_sections: {
        type: "array",
        items: { type: "string", enum: MARKET_DATA_SECTIONS },
        description: "Sections when data_type=market. Omit for market_overview/macro_brief/sentiment.",
      },
      news_scope: {
        type: "string",
        enum: ["stock", "market", "press_releases", "twitter_digest", "morning_report", "all"],
        description: "News source scope when data_type=news. Defaults to all.",
      },
      days: { type: "number", description: "Lookback/calendar horizon in days, 1-30. Defaults to 7." },
      history_days: { type: "number", description: "Price history lookback, 5-1825. Defaults to 365." },
      year: { type: "number", description: "Fiscal year for transcript." },
      quarter: { type: "number", description: "Fiscal quarter for transcript, 1-4." },
      limit: { type: "number", description: "Section item limit, 1-100. Defaults to 30." },
    }),
    annotations: readOnlyOpenWorld(),
  },
];

export async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "themarketbrew_discovery":
      return discovery(args);
    case "themarketbrew_persona_context":
      return personaContext(args);
    case "themarketbrew_market_data":
      return marketData(args);
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

function readOnlyOpenWorld() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
}
