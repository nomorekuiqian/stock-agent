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
  frankStatus,
  runWorkflow,
  searchEvidence,
} from "./live.js";

const VERSION = "0.3.0";

const server = new Server(
  {
    name: "market-lens-mcp",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
    instructions: [
      "Market Lens MCP is a thin local adapter for TheMarketBrew's backend lens engine.",
      "The local package does not include qinbafrank methodology assets.",
      "Tools return backend context packs for the user's own agent to write the final answer.",
      "Set MARKET_LENS_BACKEND_URL and MARKET_LENS_INVITE_CODE for beta workflow access.",
    ].join("\n"),
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "frank_status",
      title: "Frank Lens Status",
      description: "Check local adapter configuration and backend beta status. Does not require an invite code.",
      inputSchema: {
        type: "object",
        properties: {
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or MARKET_LENS_PERSONA.",
          },
        },
      },
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_search_evidence",
      title: "Frank Evidence Search",
      description: "Search backend vector evidence for qinbafrank historical tweet chunks. Requires MARKET_LENS_INVITE_CODE.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Question, topic, ticker, or phrase to search.",
          },
          k: {
            type: "number",
            description: "Number of chunks to retrieve, 1-20. Defaults to 6.",
          },
          threshold: {
            type: "number",
            description: "Similarity threshold, 0-1. Defaults to 0.45.",
          },
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or MARKET_LENS_PERSONA.",
          },
        },
        required: ["query"],
      },
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_stock_diagnosis",
      title: "Frank Stock Diagnosis Context",
      description: "Return a backend context pack for judging a stock through Frank's valuation/earnings/logic lens. Requires MARKET_LENS_INVITE_CODE.",
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
            description: "Maximum evidence chunks, 1-12. Defaults to 6.",
          },
          include_market_data: {
            type: "boolean",
            description: "Whether backend should include market brief data. Defaults to true.",
          },
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or MARKET_LENS_PERSONA.",
          },
        },
        required: ["question", "ticker"],
      },
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_market_regime",
      title: "Frank Market Regime Context",
      description: "Return a backend context pack for judging market conditions through Frank's macro/risk lens. Requires MARKET_LENS_INVITE_CODE.",
      inputSchema: workflowSchema(false),
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_compare",
      title: "Frank Compare Context",
      description: "Return a backend context pack for comparing two or more tickers through Frank's framework. Requires MARKET_LENS_INVITE_CODE.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The user's comparison question.",
          },
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "Ticker symbols to compare.",
          },
          sector: {
            type: "string",
            description: "Optional sector key.",
          },
          evidence_limit: {
            type: "number",
            description: "Maximum evidence chunks, 1-12. Defaults to 6.",
          },
          include_market_data: {
            type: "boolean",
            description: "Whether backend should include market brief data. Defaults to true.",
          },
          persona: {
            type: "string",
            description: "Persona username. Defaults to qinbafrank or MARKET_LENS_PERSONA.",
          },
        },
        required: ["question", "tickers"],
      },
      annotations: readOnlyOpenWorld(),
    },
    {
      name: "frank_research_memo",
      title: "Frank Research Memo Context",
      description: "Return a backend context pack for a deeper research memo. Requires MARKET_LENS_INVITE_CODE.",
      inputSchema: workflowSchema(true),
      annotations: readOnlyOpenWorld(),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  try {
    switch (request.params.name) {
      case "frank_status":
        return jsonResponse(await frankStatus(args));
      case "frank_search_evidence":
        return jsonResponse(await searchEvidence(args));
      case "frank_stock_diagnosis":
        return jsonResponse(await runWorkflow("stock_diagnosis", args));
      case "frank_market_regime":
        return jsonResponse(await runWorkflow("market_regime", args));
      case "frank_compare":
        return jsonResponse(await runWorkflow("compare", args));
      case "frank_research_memo":
        return jsonResponse(await runWorkflow("research_memo", args));
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
      name: "frank-stock-diagnosis",
      title: "Frank Stock Diagnosis",
      description: "Ask the client agent to call frank_stock_diagnosis and write the final answer from the returned context pack.",
      arguments: [
        { name: "ticker", description: "Ticker symbol, for example NVDA.", required: true },
        { name: "question", description: "Stock question to answer.", required: true },
      ],
    },
    {
      name: "frank-market-regime",
      title: "Frank Market Regime",
      description: "Ask the client agent to call frank_market_regime and write the final answer from the returned context pack.",
      arguments: [
        { name: "question", description: "Market-regime question to answer.", required: false },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  const question = String(args.question || "").trim();
  if (request.params.name === "frank-stock-diagnosis") {
    const ticker = String(args.ticker || "").trim().toUpperCase();
    return promptResponse([
      `Question: ${question}`,
      `Ticker: ${ticker}`,
      "",
      "Call frank_stock_diagnosis with this ticker and question.",
      "Use the returned backend context pack as source material.",
      "Write the final answer in Chinese unless the user requested English.",
      "Separate direct Frank evidence, live market facts, and methodology inference.",
      "Avoid direct trading commands and exact price targets.",
    ]);
  }
  if (request.params.name === "frank-market-regime") {
    return promptResponse([
      `Question: ${question || "按 Frank 框架判断当前市场行情。"}`,
      "",
      "Call frank_market_regime for this question.",
      "Use the returned backend context pack as source material.",
      "Write the final answer in Chinese unless the user requested English.",
      "Separate direct Frank evidence, current market facts, and methodology inference.",
    ]);
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

function workflowSchema(questionRequired: boolean) {
  return {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The user's question.",
      },
      ticker: {
        type: "string",
        description: "Optional ticker symbol if the question is anchored to one stock.",
      },
      sector: {
        type: "string",
        description: "Optional sector key.",
      },
      evidence_limit: {
        type: "number",
        description: "Maximum evidence chunks, 1-12. Defaults to 6.",
      },
      include_market_data: {
        type: "boolean",
        description: "Whether backend should include market brief data. Defaults to true.",
      },
      persona: {
        type: "string",
        description: "Persona username. Defaults to qinbafrank or MARKET_LENS_PERSONA.",
      },
    },
    required: questionRequired ? ["question"] : [],
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
  process.stderr.write(`market-lens-mcp failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
