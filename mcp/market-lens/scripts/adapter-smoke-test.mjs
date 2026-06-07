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
    calls.push({
      method: req.method,
      url: req.url,
      invite: req.headers["x-frank-lens-invite-code"] || null,
      body,
    });
    res.setHeader("Content-Type", "application/json");

    if (req.url.includes("/mcp/status")) {
      res.end(JSON.stringify({
        ok: true,
        persona_username: "qinbafrank",
        mode: "backend_first_beta",
        beta: { access: req.headers["x-frank-lens-invite-code"] ? "valid" : "missing" },
      }));
      return;
    }

    if (!req.headers["x-frank-lens-invite-code"]) {
      res.statusCode = 401;
      res.end(JSON.stringify({ detail: "invite_code_required" }));
      return;
    }

    if (req.url.includes("/mcp/search")) {
      res.end(JSON.stringify({
        persona_username: "qinbafrank",
        query: body.query,
        retrieval_mode: "vector_chunks",
        count: 1,
        chunks: [{ content: "mock evidence", citation_index: 1 }],
      }));
      return;
    }

    if (req.url.includes("/mcp/workflow")) {
      res.end(JSON.stringify({
        persona_username: "qinbafrank",
        workflow: body.workflow,
        question: body.question,
        ticker: body.ticker,
        tickers: body.tickers || [],
        retrieval_mode: "vector_chunks",
        market_data_mode: "brief_tools",
        kol_chunks: [{ content: "mock evidence", citation_index: 1 }],
        market_context: [],
        methodology_context: { workflow: body.workflow },
        answer_discipline: ["Do not impersonate qinbafrank."],
        suggested_answer_shape: ["User agent writes final answer."],
        beta: { access: "valid", invite_code_id: "mock" },
        share_url: null,
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
    MARKET_LENS_BACKEND_URL: `http://127.0.0.1:${port}/api`,
    MARKET_LENS_INVITE_CODE: "BETA_TEST",
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
    clientInfo: { name: "market-lens-adapter-smoke-test", version: "0.3.0" },
  });
  notify("notifications/initialized");

  parseTool(await send("tools/call", { name: "frank_status", arguments: {} }));
  parseTool(await send("tools/call", {
    name: "frank_search_evidence",
    arguments: { query: "NVDA capex", k: 2 },
  }));
  parseTool(await send("tools/call", {
    name: "frank_stock_diagnosis",
    arguments: { question: "NVDA 是杀估值还是杀逻辑？", ticker: "NVDA" },
  }));
  parseTool(await send("tools/call", {
    name: "frank_market_regime",
    arguments: { question: "按 Frank 框架判断当前市场行情。" },
  }));
  parseTool(await send("tools/call", {
    name: "frank_compare",
    arguments: { question: "NVDA 和 AVGO 只能留一只？", tickers: ["NVDA", "AVGO"] },
  }));
  parseTool(await send("tools/call", {
    name: "frank_research_memo",
    arguments: { question: "帮我研究 CRWV 的产业逻辑。", ticker: "CRWV" },
  }));

  const protectedCalls = calls.filter((call) => call.url.includes("/mcp/search") || call.url.includes("/mcp/workflow"));
  if (protectedCalls.some((call) => call.invite !== "BETA_TEST")) {
    throw new Error("Protected backend calls did not include invite code");
  }
  const workflows = protectedCalls
    .map((call) => call.body.workflow)
    .filter(Boolean)
    .sort();

  console.log(JSON.stringify({
    ok: true,
    backendCalls: calls.length,
    workflows,
    searchCalled: protectedCalls.some((call) => call.url.includes("/mcp/search")),
  }, null, 2));
} finally {
  child.kill();
  mock.close();
}
