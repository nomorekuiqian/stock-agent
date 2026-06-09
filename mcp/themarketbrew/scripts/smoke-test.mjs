#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(packageDir, "dist", "index.js");
const installedBin = process.env.THEMARKETBREW_MCP_BIN || process.env.MARKET_LENS_MCP_BIN;
const child = installedBin
  ? spawn(installedBin, [], { cwd: packageDir, stdio: ["pipe", "pipe", "pipe"] })
  : spawn(process.execPath, [serverPath], { cwd: packageDir, stdio: ["pipe", "pipe", "pipe"] });

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

try {
  await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "themarketbrew-smoke-test", version: "0.5.0" },
  });
  notify("notifications/initialized");

  const toolList = await send("tools/list", {});
  const toolNames = toolList.tools.map((tool) => tool.name);
  const required = [
    "market_lens_status",
    "market_lens_personas",
    "market_lens_list_lenses",
    "market_lens_get_lens",
    "market_lens_search_lenses",
    "market_lens_search_evidence",
    "market_lens_get_evidence_by_ids",
    "market_lens_build_context",
    "market_lens_stock_diagnosis",
    "market_lens_market_regime",
    "market_lens_compare",
    "market_lens_research_memo",
  ];
  for (const name of required) {
    if (!toolNames.includes(name)) throw new Error(`${name} missing from tools/list`);
  }
  for (const name of toolNames) {
    if (name.startsWith("frank_")) throw new Error(`Frank-specific tool still exposed: ${name}`);
  }

  const status = await send("tools/call", { name: "market_lens_status", arguments: {} });
  const parsedStatus = JSON.parse(status.content[0].text);
  if (typeof parsedStatus.adapter?.backend_url !== "string") {
    throw new Error("market_lens_status did not return adapter backend_url");
  }

  console.log(JSON.stringify({
    ok: true,
    mode: "thin-adapter",
    toolCount: toolNames.length,
    tools: toolNames,
    statusOk: parsedStatus.ok,
  }, null, 2));
} finally {
  child.kill();
}
