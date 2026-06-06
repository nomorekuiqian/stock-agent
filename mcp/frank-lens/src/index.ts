#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  buildFrankContext,
  buildMarketRegime,
  buildStockDiagnosis,
  getMethodology,
  getSectorLens,
  getTickerLens,
  listLenses,
  searchEvidence,
} from "./methodology.js";
import {
  liveBuildContext,
  liveMarketBrief,
  liveMarketRegime,
  liveSearchEvidence,
  liveStatus,
  liveStockDiagnosis,
} from "./live.js";

const VERSION = "0.2.0";

const server = new Server(
  {
    name: "frank-lens-mcp",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
    instructions: [
      "Frank Lens MCP exposes qinbafrank methodology lenses, live vector evidence, and market data context.",
      "Offline tools read packaged methodology assets. Live tools call FRANK_LENS_BACKEND_URL, default http://127.0.0.1:8000/api.",
      "Responses are context packs for the user's own agent. They are not investment advice and do not represent qinbafrank.",
    ].join("\n"),
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "frank_list_lenses",
      title: "List Frank Lenses",
      description: "List packaged qinbafrank methodology lenses by layer, including core, framework, macro, sector, and ticker playbooks.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "frank_get_methodology",
      title: "Get Frank Methodology",
      description: "Read a packaged Frank methodology lens. Use key with layer for a specific lens, or omit key to list lenses in that layer.",
      inputSchema: {
        type: "object",
        properties: {
          layer: {
            type: "string",
            enum: ["core", "framework", "macro", "sector", "ticker"],
            description: "Methodology layer to inspect.",
          },
          key: {
            type: "string",
            description: "Lens key, for example operating-system, ask-about-stock, ai-infrastructure, macro-regime, or NVDA.",
          },
          include_body: {
            type: "boolean",
            description: "Whether to include the full markdown body. Defaults to true for specific lens reads.",
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "frank_search_evidence",
      title: "Search Frank Evidence",
      description: "Search the local packaged Frank methodology markdown and return matching snippets plus Evidence Map tweet IDs.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Topic, ticker, phrase, or question to search.",
          },
          limit: {
            type: "number",
            description: "Maximum results, 1-20. Defaults to 6.",
          },
          layer: {
            type: "array",
            items: {
              type: "string",
              enum: ["core", "framework", "macro", "sector", "ticker"],
            },
            description: "Optional layers to search.",
          },
        },
        required: ["query"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "frank_get_ticker_lens",
      title: "Get Frank Ticker Lens",
      description: "Return a structured Frank lens for a ticker, including coverage, positioning, checks, falsifiers, terminology, and Evidence Map tweet IDs.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description: "Ticker symbol, for example NVDA, MU, HOOD, COIN, PLTR, TSLA, or AVGO.",
          },
        },
        required: ["ticker"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "frank_get_sector_lens",
      title: "Get Frank Sector Lens",
      description: "Return a structured Frank sector lens, including variables, mechanism, support signals, weakening signals, falsifiers, and Evidence Map tweet IDs.",
      inputSchema: {
        type: "object",
        properties: {
          sector: {
            type: "string",
            description: "Sector key, for example ai-infrastructure, crypto-stablecoin-rwa, defense-and-space, software-ai-disruption, semiconductor-memory-hbm, power-and-physical-ai, or fintech-brokerage.",
          },
        },
        required: ["sector"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "frank_build_context",
      title: "Build Frank Context Pack",
      description: "Build an agent-readable Frank context pack for a user question by selecting core, framework, macro, sector, ticker, and evidence snippets.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The user's question.",
          },
          ticker: {
            type: "string",
            description: "Optional ticker symbol to force a ticker lens.",
          },
          sector: {
            type: "string",
            description: "Optional sector key to force a sector lens.",
          },
          evidence_limit: {
            type: "number",
            description: "Maximum local evidence hits, 1-12. Defaults to 6.",
          },
        },
        required: ["question"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "frank_stock_diagnosis",
      title: "Frank Stock Diagnosis Brief",
      description: "Build a loose narrative briefing for judging a stock through Frank's framework. Returns text, not a rigid structured context schema.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The user's stock question.",
          },
          ticker: {
            type: "string",
            description: "Ticker symbol, for example NVDA.",
          },
          sector: {
            type: "string",
            description: "Optional sector key to force a sector lens.",
          },
          evidence_limit: {
            type: "number",
            description: "Maximum local evidence hits, 1-12. Defaults to 6.",
          },
        },
        required: ["question", "ticker"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "frank_market_regime",
      title: "Frank Market Regime Brief",
      description: "Build a loose narrative briefing for judging market conditions through Frank's macro/risk framework. Returns text, not a rigid structured context schema.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The user's market-regime question. Defaults to a generic market-regime prompt if omitted.",
          },
          ticker: {
            type: "string",
            description: "Optional ticker symbol if the market question is anchored to one stock.",
          },
          sector: {
            type: "string",
            description: "Optional sector key if the market question is sector-specific.",
          },
          evidence_limit: {
            type: "number",
            description: "Maximum local evidence hits, 1-12. Defaults to 6.",
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "frank_live_status",
      title: "Frank Live Backend Status",
      description: "Check whether the configured Stock Agent backend is reachable for live Frank Lens tools.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "frank_live_search_evidence",
      title: "Live Frank Vector Search",
      description: "Search live vector_chunks for qinbafrank tweet evidence through the configured backend.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Question, topic, ticker, or phrase to search in the live KOL vector DB.",
          },
          k: {
            type: "number",
            description: "Number of chunks to retrieve, 1-20. Defaults to 6.",
          },
          threshold: {
            type: "number",
            description: "Similarity threshold, 0-1. Defaults to 0.45 for tweet retrieval.",
          },
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or FRANK_LENS_PERSONA.",
          },
        },
        required: ["query"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "frank_live_market_brief",
      title: "Live Market Brief",
      description: "Fetch the same brief data used by the website KOL agent: stock, peer, macro, or industry brief.",
      inputSchema: {
        type: "object",
        properties: {
          brief_type: {
            type: "string",
            enum: ["stock", "peer", "macro", "industry"],
            description: "Brief type. stock/peer/industry require symbol; macro reads macro cache.",
          },
          symbol: {
            type: "string",
            description: "Ticker symbol for stock, peer, or industry brief.",
          },
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or FRANK_LENS_PERSONA.",
          },
        },
        required: ["brief_type"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "frank_live_build_context",
      title: "Live Frank Context Pack",
      description: "Build a live Frank context pack by combining packaged methodology, live vector evidence, and optional market data.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The user's question.",
          },
          ticker: {
            type: "string",
            description: "Optional ticker symbol to force stock data and ticker lens.",
          },
          sector: {
            type: "string",
            description: "Optional sector key.",
          },
          evidence_limit: {
            type: "number",
            description: "Maximum live evidence chunks, 1-12. Defaults to 6.",
          },
          include_market_data: {
            type: "boolean",
            description: "Whether backend should include brief market data. Defaults to true.",
          },
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or FRANK_LENS_PERSONA.",
          },
        },
        required: ["question"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "frank_live_stock_diagnosis",
      title: "Live Frank Stock Diagnosis Brief",
      description: "Build a loose stock-diagnosis briefing with packaged Frank methodology plus live vector evidence and optional market data.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The user's stock question.",
          },
          ticker: {
            type: "string",
            description: "Ticker symbol, for example NVDA.",
          },
          sector: {
            type: "string",
            description: "Optional sector key.",
          },
          evidence_limit: {
            type: "number",
            description: "Maximum live evidence chunks, 1-12. Defaults to 6.",
          },
          include_market_data: {
            type: "boolean",
            description: "Whether backend should include brief market data. Defaults to true.",
          },
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or FRANK_LENS_PERSONA.",
          },
        },
        required: ["question", "ticker"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "frank_live_market_regime",
      title: "Live Frank Market Regime Brief",
      description: "Build a loose market-regime briefing with packaged Frank methodology plus live vector evidence and optional market data.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The user's market-regime question. Defaults to a generic market-regime prompt if omitted.",
          },
          ticker: {
            type: "string",
            description: "Optional ticker symbol if the market question is anchored to one stock.",
          },
          sector: {
            type: "string",
            description: "Optional sector key.",
          },
          evidence_limit: {
            type: "number",
            description: "Maximum live evidence chunks, 1-12. Defaults to 6.",
          },
          include_market_data: {
            type: "boolean",
            description: "Whether backend should include brief market data. Defaults to true.",
          },
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or FRANK_LENS_PERSONA.",
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  try {
    switch (request.params.name) {
      case "frank_list_lenses":
        return jsonResponse(listLenses());
      case "frank_get_methodology":
        return jsonResponse(getMethodology(args));
      case "frank_search_evidence":
        return jsonResponse(searchEvidence(args));
      case "frank_get_ticker_lens":
        return jsonResponse(getTickerLens(args));
      case "frank_get_sector_lens":
        return jsonResponse(getSectorLens(args));
      case "frank_build_context":
        return jsonResponse(buildFrankContext(args));
      case "frank_stock_diagnosis":
        return textResponse(buildStockDiagnosis(args));
      case "frank_market_regime":
        return textResponse(buildMarketRegime(args));
      case "frank_live_status":
        return jsonResponse(await liveStatus());
      case "frank_live_search_evidence":
        return jsonResponse(await liveSearchEvidence(args));
      case "frank_live_market_brief":
        return jsonResponse(await liveMarketBrief(args));
      case "frank_live_build_context":
        return jsonResponse(await liveBuildContext(args));
      case "frank_live_stock_diagnosis":
        return textResponse(await liveStockDiagnosis(args));
      case "frank_live_market_regime":
        return textResponse(await liveMarketRegime(args));
      default:
        return errorResponse(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "frank-stock-lens",
      title: "Frank Stock Lens",
      description: "Ask the client agent to answer a stock question using a loose Frank Lens briefing and citation discipline.",
      arguments: [
        {
          name: "ticker",
          description: "Ticker symbol, for example NVDA.",
          required: true,
        },
        {
          name: "question",
          description: "Stock question to answer.",
          required: true,
        },
      ],
    },
    {
      name: "frank-stock-diagnosis",
      title: "Frank Stock Diagnosis",
      description: "Ask the client agent to judge a stock using the loose Frank stock-diagnosis workflow.",
      arguments: [
        {
          name: "ticker",
          description: "Ticker symbol, for example NVDA.",
          required: true,
        },
        {
          name: "question",
          description: "Stock question to answer.",
          required: true,
        },
      ],
    },
    {
      name: "frank-market-regime",
      title: "Frank Market Regime",
      description: "Ask the client agent to judge market conditions using the loose Frank market-regime workflow.",
      arguments: [
        {
          name: "question",
          description: "Market-regime question to answer.",
          required: false,
        },
      ],
    },
    {
      name: "frank-methodology-lens",
      title: "Frank Methodology Lens",
      description: "Ask the client agent to explain a concept through Frank's distilled methodology.",
      arguments: [
        {
          name: "question",
          description: "Methodology or market-framework question.",
          required: true,
        },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  const question = String(args.question || "").trim();
  if (request.params.name === "frank-stock-lens" || request.params.name === "frank-stock-diagnosis") {
    const ticker = String(args.ticker || "").trim().toUpperCase();
    return {
      description: "Use Frank Lens MCP to answer a stock question with a loose diagnosis briefing.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Question: ${question}`,
              `Ticker: ${ticker}`,
              "",
              "Prefer frank_live_stock_diagnosis with this ticker and question when the live backend is available; otherwise call frank_stock_diagnosis.",
              "Use the returned briefing as lens material, not as a mandatory answer template.",
              "Then answer in Chinese unless the user requested English.",
              "Separate direct Frank evidence from methodology inference and avoid direct trading instructions.",
            ].join("\n"),
          },
        },
      ],
    };
  }
  if (request.params.name === "frank-market-regime") {
    return {
      description: "Use Frank Lens MCP to answer a market-regime question with a loose briefing.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Question: ${question || "按 Frank 框架判断当前市场行情。"}`,
              "",
              "Prefer frank_live_market_regime when the live backend is available; otherwise call frank_market_regime.",
              "Use the returned briefing as lens material, not as a mandatory answer template.",
              "Then answer in Chinese unless the user requested English.",
              "Separate direct Frank evidence, current market facts, and methodology inference.",
            ].join("\n"),
          },
        },
      ],
    };
  }
  if (request.params.name === "frank-methodology-lens") {
    return {
      description: "Use Frank Lens MCP to explain a methodology question.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Question: ${question}`,
              "",
              "First call frank_build_context for this question.",
              "Explain the reusable framework plainly, and cite only evidence IDs returned by the MCP context.",
            ].join("\n"),
          },
        },
      ],
    };
  }
  return {
    description: `Unknown prompt: ${request.params.name}`,
    messages: [],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function jsonResponse(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function textResponse(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

function errorResponse(message: string) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

main().catch((error) => {
  process.stderr.write(`frank-lens-mcp failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
