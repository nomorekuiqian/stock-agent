#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(packageDir, "dist", "index.js");
const calls = [];

const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : {};
    calls.push({ method: req.method, url: req.url, body });
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url === "/api/okx-mcp/discovery") {
      res.end(JSON.stringify({
        ok: true,
        tool: "themarketbrew_discovery",
        data: {
          auth: { account_required: false, provider: "okx_x402" },
          personas: [{ username: "qinbafrank" }, { username: "aleabitoreddit" }],
          tools: {
            themarketbrew_discovery: {},
            themarketbrew_persona_context: {},
            themarketbrew_market_data: {},
          },
        },
      }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/okx-mcp/persona-context") {
      res.end(JSON.stringify({
        ok: true,
        tool: "themarketbrew_persona_context",
        request: body,
        data: {
          selected_persona: { username: body.persona || "qinbafrank" },
          selected_lenses: [{ lens_type: "ticker", lens_id: body.ticker || "NVDA" }],
          evidence_map_tweets: [],
          kol_chunks: [],
        },
        errors: [],
      }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/okx-mcp/market-data") {
      res.end(JSON.stringify({
        ok: true,
        tool: "themarketbrew_market_data",
        request: body,
        data: { ok: true, tool: body.data_type || "catalog", data: {} },
        errors: [],
      }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ detail: "not_found" }));
  });
});

await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const port = mock.address().port;
const child = spawn(process.execPath, [serverPath], {
  cwd: packageDir,
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    THEMARKETBREW_BACKEND_URL: `http://127.0.0.1:${port}/api`,
  },
});

let nextId = 1;
let buffer = "";
const pending = new Map();

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  while (buffer.includes("\n")) {
    const idx = buffer.indexOf("\n");
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});

child.stderr.on("data", (chunk) => process.stderr.write(chunk));

function send(method, params, timeoutMs = 5000) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, (message) => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
      else resolve(message.result);
    });
  });
}

function notify(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function parseTool(result) {
  return JSON.parse(result.content[0].text);
}

try {
  await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "themarketbrew-adapter-smoke-test", version: "0.6.0" },
  });
  notify("notifications/initialized");

  const discovery = parseTool(await send("tools/call", { name: "themarketbrew_discovery", arguments: {} }));
  if (!discovery.data?.personas?.length) throw new Error("discovery did not return personas");

  const persona = parseTool(await send("tools/call", {
    name: "themarketbrew_persona_context",
    arguments: { question: "NVDA 怎么看？", ticker: "NVDA", include_vector_evidence: false },
  }));
  if (persona.data?.selected_persona?.username !== "qinbafrank") {
    throw new Error("persona_context did not return selected_persona");
  }

  const catalog = parseTool(await send("tools/call", {
    name: "themarketbrew_market_data",
    arguments: { data_type: "catalog" },
  }));
  if (catalog.tool !== "themarketbrew_market_data") throw new Error("market_data catalog failed");

  const stock = parseTool(await send("tools/call", {
    name: "themarketbrew_market_data",
    arguments: { data_type: "stock", symbol: "NVDA", stock_sections: ["quote"] },
  }));
  if (stock.request?.symbol !== "NVDA") throw new Error("market_data stock request not forwarded");

  console.log(JSON.stringify({
    ok: true,
    backendCalls: calls.length,
    endpoints: calls.map((call) => `${call.method} ${call.url}`),
  }, null, 2));
} finally {
  child.kill();
  mock.close();
}
