#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(packageDir, "dist", "index.js");
const installedBin = process.env.FRANK_LENS_MCP_BIN;
const child = installedBin
  ? spawn(installedBin, [], { cwd: packageDir, stdio: ["pipe", "pipe", "pipe"], env: process.env })
  : spawn(process.execPath, [serverPath], { cwd: packageDir, stdio: ["pipe", "pipe", "pipe"], env: process.env });

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

function send(method, params, timeoutMs = 120000) {
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
  const text = result?.content?.[0]?.text;
  if (!text) throw new Error("Tool result did not include text content");
  return JSON.parse(text);
}

try {
  await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "frank-lens-live-smoke-test", version: "0.3.0" },
  });
  notify("notifications/initialized");

  const toolList = await send("tools/list", {});
  const toolNames = toolList.tools.map((tool) => tool.name);
  for (const required of [
    "frank_status",
    "frank_search_evidence",
    "frank_stock_diagnosis",
    "frank_market_regime",
  ]) {
    if (!toolNames.includes(required)) throw new Error(`${required} missing from tools/list`);
  }

  const status = parseTool(await send("tools/call", { name: "frank_status", arguments: {} }));
  if (!status.ok) {
    throw new Error(`frank_status failed: ${JSON.stringify(status)}`);
  }

  const search = parseTool(await send("tools/call", {
    name: "frank_search_evidence",
    arguments: { query: "NVDA AI capex RPO 打脸条件", k: 3 },
  }));
  if (!Array.isArray(search.chunks)) {
    throw new Error("frank_search_evidence did not return chunks array");
  }

  const stock = parseTool(await send("tools/call", {
    name: "frank_stock_diagnosis",
    arguments: {
      question: "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
      ticker: "NVDA",
      evidence_limit: 3,
      include_market_data: true,
    },
  }));
  if (stock.workflow !== "stock_diagnosis" || !Array.isArray(stock.kol_chunks)) {
    throw new Error("frank_stock_diagnosis did not return workflow context pack");
  }

  const market = parseTool(await send("tools/call", {
    name: "frank_market_regime",
    arguments: {
      question: "按 Frank 框架判断当前市场行情。",
      evidence_limit: 3,
      include_market_data: true,
    },
  }));
  if (market.workflow !== "market_regime" || !Array.isArray(market.kol_chunks)) {
    throw new Error("frank_market_regime did not return workflow context pack");
  }

  console.log(JSON.stringify({
    ok: true,
    backend: status.adapter?.backend_url,
    toolCount: toolNames.length,
    liveEvidenceCount: search.count,
    stockWorkflow: stock.workflow,
    marketWorkflow: market.workflow,
  }, null, 2));
} finally {
  child.kill();
}
