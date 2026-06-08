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

const VERSION = "0.4.0";

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
      "The local package does not include full persona methodology assets.",
      "Use market_lens_* tools as the primary persona-neutral tool surface.",
      "Legacy frank_* tools remain compatibility aliases for qinbafrank.",
      "Material tools return distilled lens context; evidence tools return historical posts; workflow tools return composed backend context packs.",
      "Set MARKET_LENS_BACKEND_URL and MARKET_LENS_INVITE_CODE for beta workflow/material access.",
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
  process.stderr.write(`market-lens-mcp failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
