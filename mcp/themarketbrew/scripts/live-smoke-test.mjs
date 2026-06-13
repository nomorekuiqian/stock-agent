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
    clientInfo: { name: "themarketbrew-live-smoke-test", version: "0.5.0" },
  });
  notify("notifications/initialized");

  const toolList = await send("tools/list", {});
  const toolNames = toolList.tools.map((tool) => tool.name);
  for (const required of [
    "market_lens_status",
    "market_lens_login",
    "market_lens_auth_status",
    "market_lens_logout",
    "market_lens_data_catalog",
    "market_lens_get_brief",
    "market_lens_get_stock_data",
    "market_lens_get_market_data",
    "market_lens_get_news",
    "market_lens_personas",
    "market_lens_list_lenses",
    "market_lens_get_lens",
    "market_lens_search_lenses",
    "market_lens_search_evidence",
    "market_lens_stock_diagnosis",
  ]) {
    if (!toolNames.includes(required)) throw new Error(`${required} missing from tools/list`);
  }
  for (const name of toolNames) {
    if (name.startsWith("frank_")) throw new Error(`Frank-specific tool still exposed: ${name}`);
  }

  const status = parseTool(await send("tools/call", { name: "market_lens_status", arguments: {} }));
  if (!status.ok) {
    throw new Error(`market_lens_status failed: ${JSON.stringify(status)}`);
  }
  if (!status.auth?.authenticated) {
    const personasWithoutAuth = parseTool(await send("tools/call", { name: "market_lens_personas", arguments: {} }));
    if (!personasWithoutAuth.auth_required) {
      throw new Error("market_lens_personas should require account auth without a token");
    }
    const catalogWithoutAuth = parseTool(await send("tools/call", { name: "market_lens_data_catalog", arguments: {} }));
    if (!catalogWithoutAuth.auth_required) {
      throw new Error("market_lens_data_catalog should require account auth without a token");
    }
    console.log(JSON.stringify({
      ok: true,
      backend: status.adapter?.backend_url,
      toolCount: toolNames.length,
      authenticated: false,
      gatedContentVerified: true,
      note: "Set THEMARKETBREW_ACCESS_TOKEN or run market_lens_login to run live content checks.",
    }, null, 2));
  } else {
    const personas = parseTool(await send("tools/call", { name: "market_lens_personas", arguments: {} }));
  if (!Array.isArray(personas.personas) || !personas.personas.some((persona) => persona.username === "aleabitoreddit")) {
    throw new Error("market_lens_personas did not return aleabitoreddit");
  }

  const lenses = parseTool(await send("tools/call", {
    name: "market_lens_list_lenses",
    arguments: { persona: "qinbafrank", lens_type: "ticker" },
  }));
  if (!Array.isArray(lenses.lenses) || !lenses.lenses.some((lens) => lens.lens_id === "NVDA")) {
    throw new Error("market_lens_list_lenses did not return NVDA ticker lens");
  }

  const nvdaLens = parseTool(await send("tools/call", {
    name: "market_lens_get_lens",
    arguments: { persona: "qinbafrank", lens_type: "ticker", lens_id: "NVDA" },
  }));
  if (!nvdaLens.full_body || !Array.isArray(nvdaLens.evidence_tweet_ids)) {
    throw new Error("market_lens_get_lens did not return full lens context");
  }

  const materialSearch = parseTool(await send("tools/call", {
    name: "market_lens_search_lenses",
    arguments: { persona: "qinbafrank", query: "Veto 打脸条件", limit: 3 },
  }));
  if (!Array.isArray(materialSearch.results)) {
    throw new Error("market_lens_search_lenses did not return results array");
  }

  const serenityLenses = parseTool(await send("tools/call", {
    name: "market_lens_list_lenses",
    arguments: { persona: "aleabitoreddit", lens_type: "ticker" },
  }));
  if (!Array.isArray(serenityLenses.lenses) || !serenityLenses.lenses.some((lens) => lens.lens_id === "SIVE")) {
    throw new Error("market_lens_list_lenses did not return Serenity SIVE ticker lens");
  }

  const siveLens = parseTool(await send("tools/call", {
    name: "market_lens_get_lens",
    arguments: { persona: "aleabitoreddit", lens_type: "ticker", lens_id: "SIVE" },
  }));
  if (!siveLens.full_body || !Array.isArray(siveLens.evidence_tweet_ids)) {
    throw new Error("market_lens_get_lens did not return Serenity SIVE full lens context");
  }

  const serenitySearch = parseTool(await send("tools/call", {
    name: "market_lens_search_lenses",
    arguments: { persona: "aleabitoreddit", query: "CPO SIVE", lens_types: ["sector", "ticker"], limit: 3 },
  }));
  if (!Array.isArray(serenitySearch.results) || serenitySearch.results.length < 1) {
    throw new Error("market_lens_search_lenses did not return Serenity material results");
  }

  const search = parseTool(await send("tools/call", {
    name: "market_lens_search_evidence",
    arguments: { persona: "qinbafrank", query: "NVDA AI capex RPO 打脸条件", k: 3 },
  }));
  if (!Array.isArray(search.chunks)) {
    throw new Error("market_lens_search_evidence did not return chunks array");
  }

  const stock = parseTool(await send("tools/call", {
    name: "market_lens_stock_diagnosis",
    arguments: {
      persona: "qinbafrank",
      question: "按所选 persona 的框架看 NVDA 这次回调应该如何归因？",
      ticker: "NVDA",
      evidence_limit: 3,
      include_market_data: true,
    },
  }));
  if (stock.workflow !== "stock_diagnosis" || !Array.isArray(stock.kol_chunks)) {
    throw new Error("market_lens_stock_diagnosis did not return workflow context pack");
  }

  const market = parseTool(await send("tools/call", {
    name: "market_lens_market_regime",
    arguments: {
      persona: "qinbafrank",
      question: "按所选 persona 的框架判断当前市场行情。",
      evidence_limit: 3,
      include_market_data: true,
    },
  }));
  if (market.workflow !== "market_regime" || !Array.isArray(market.kol_chunks)) {
    throw new Error("market_lens_market_regime did not return workflow context pack");
  }

  console.log(JSON.stringify({
    ok: true,
    backend: status.adapter?.backend_url,
    toolCount: toolNames.length,
    tickerLensCount: lenses.count,
    serenityTickerLensCount: serenityLenses.count,
    materialSearchCount: materialSearch.count,
    serenityMaterialSearchCount: serenitySearch.count,
    liveEvidenceCount: search.count,
    stockWorkflow: stock.workflow,
    marketWorkflow: market.workflow,
  }, null, 2));
  }
} finally {
  child.kill();
}
