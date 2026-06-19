#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getPrompt, PROMPTS } from "./prompts.js";
import { callTool, TOOLS } from "./tools.js";

const VERSION = "0.6.0";

const server = new Server(
  {
    name: "themarketbrew",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
    instructions: [
      "TheMarketBrew MCP is a thin adapter for the OKX-facing TheMarketBrew context service.",
      "The local package does not include full persona methodology assets and does not require TheMarketBrew account login.",
      "Use themarketbrew_discovery first, then themarketbrew_persona_context for methodology/evidence or themarketbrew_market_data for facts.",
      "The tools return context and data only; the caller's agent writes the final answer with its own model.",
      "Paid HTTP endpoints may return HTTP 402 when protected by OKX x402 middleware or reverse proxy.",
      "Set THEMARKETBREW_BACKEND_URL or OKX_MCP_BACKEND_URL to the backend /api base URL.",
    ].join("\n"),
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  try {
    return jsonResponse(await callTool(request.params.name, args));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS,
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  return getPrompt(request.params.name, {
    persona: typeof args.persona === "string" ? args.persona : undefined,
    question: typeof args.question === "string" ? args.question : undefined,
    ticker: typeof args.ticker === "string" ? args.ticker : undefined,
  });
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
  process.stderr.write(`themarketbrew failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
