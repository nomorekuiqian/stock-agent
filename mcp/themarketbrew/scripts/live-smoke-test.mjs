#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(packageDir, "dist", "index.js");
const installedBin = process.env.THEMARKETBREW_MCP_BIN || process.env.MARKET_LENS_MCP_BIN;
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
    clientInfo: { name: "themarketbrew-live-smoke-test", version: "0.6.0" },
  });
  notify("notifications/initialized");

  const toolList = await send("tools/list", {});
  const toolNames = toolList.tools.map((tool) => tool.name).sort();
  const required = [
    "themarketbrew_discovery",
    "themarketbrew_market_data",
    "themarketbrew_persona_context",
  ].sort();
  if (JSON.stringify(toolNames) !== JSON.stringify(required)) {
    throw new Error(`Unexpected tools/list: ${JSON.stringify(toolNames)}`);
  }

  const discovery = parseTool(await send("tools/call", { name: "themarketbrew_discovery", arguments: {} }));
  if (!discovery.ok || !Array.isArray(discovery.data?.personas)) {
    throw new Error(`discovery failed: ${JSON.stringify(discovery).slice(0, 500)}`);
  }

  const catalog = parseTool(await send("tools/call", {
    name: "themarketbrew_market_data",
    arguments: { data_type: "catalog" },
  }));
  if (catalog.payment_required) {
    console.log(JSON.stringify({
      ok: true,
      backend: process.env.THEMARKETBREW_BACKEND_URL || process.env.OKX_MCP_BACKEND_URL || "default",
      toolCount: toolNames.length,
      discoveryPersonas: discovery.data.personas.length,
      paidEndpointVerified: true,
      note: "market_data returned 402; OKX wallet/payment retry is expected in marketplace flows.",
    }, null, 2));
  } else {
    if (!catalog.ok) throw new Error(`catalog failed: ${JSON.stringify(catalog).slice(0, 500)}`);
    const persona = parseTool(await send("tools/call", {
      name: "themarketbrew_persona_context",
      arguments: {
        question: "NVDA AI capex 框架怎么看？",
        ticker: "NVDA",
        include_evidence_map: false,
        include_vector_evidence: false,
      },
    }));
    if (!persona.ok && !persona.payment_required) {
      throw new Error(`persona_context failed: ${JSON.stringify(persona).slice(0, 500)}`);
    }
    console.log(JSON.stringify({
      ok: true,
      backend: process.env.THEMARKETBREW_BACKEND_URL || process.env.OKX_MCP_BACKEND_URL || "default",
      toolCount: toolNames.length,
      discoveryPersonas: discovery.data.personas.length,
      catalogOk: catalog.ok,
      personaMode: persona.payment_required ? "paid_402" : "context_returned",
    }, null, 2));
  }
} finally {
  child.kill();
}
