#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(packageDir, "dist", "index.js");
const installedBin = process.env.FRANK_LENS_MCP_BIN;
const child = installedBin
  ? spawn(installedBin, [], {
      cwd: packageDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    })
  : spawn(process.execPath, [serverPath], {
      cwd: packageDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
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

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

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
      if (message.error) {
        reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
      } else {
        resolve(message.result);
      }
    });
  });
}

function notify(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function parseToolText(result) {
  const text = result?.content?.[0]?.text;
  if (!text) {
    throw new Error("Tool result did not include text content");
  }
  return JSON.parse(text);
}

try {
  await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: {
      name: "frank-lens-live-smoke-test",
      version: "0.2.0",
    },
  });
  notify("notifications/initialized");

  const toolList = await send("tools/list", {});
  const toolNames = toolList.tools.map((tool) => tool.name);
  for (const required of [
    "frank_live_status",
    "frank_live_search_evidence",
    "frank_live_market_brief",
    "frank_live_build_context",
    "frank_live_stock_diagnosis",
    "frank_live_market_regime",
  ]) {
    if (!toolNames.includes(required)) {
      throw new Error(`${required} missing from tools/list`);
    }
  }

  const status = parseToolText(await send("tools/call", {
    name: "frank_live_status",
    arguments: {},
  }));
  if (!status.ok) {
    throw new Error("frank_live_status did not return ok=true");
  }

  const search = parseToolText(await send("tools/call", {
    name: "frank_live_search_evidence",
    arguments: {
      query: "NVDA AI capex RPO 打脸条件",
      k: 3,
    },
  }));
  if (!Array.isArray(search.chunks)) {
    throw new Error("frank_live_search_evidence did not return chunks array");
  }

  const market = parseToolText(await send("tools/call", {
    name: "frank_live_market_brief",
    arguments: {
      brief_type: "stock",
      symbol: "NVDA",
    },
  }));
  if (market.brief_type !== "stock") {
    throw new Error(`Expected stock brief, got ${market.brief_type}`);
  }

  const macro = parseToolText(await send("tools/call", {
    name: "frank_live_market_brief",
    arguments: {
      brief_type: "macro",
    },
  }));
  if (macro.brief_type !== "macro") {
    throw new Error(`Expected macro brief, got ${macro.brief_type}`);
  }

  const context = parseToolText(await send("tools/call", {
    name: "frank_live_build_context",
    arguments: {
      question: "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
      ticker: "NVDA",
      evidence_limit: 3,
      include_market_data: true,
    },
  }));
  if (context.mode !== "live") {
    throw new Error(`Expected context mode=live, got ${context.mode}`);
  }

  const stockDiagnosis = await send("tools/call", {
    name: "frank_live_stock_diagnosis",
    arguments: {
      question: "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
      ticker: "NVDA",
      evidence_limit: 3,
      include_market_data: true,
    },
  });
  const stockDiagnosisText = stockDiagnosis.content[0].text;
  if (!stockDiagnosisText.includes("Frank Stock Diagnosis Brief") || !stockDiagnosisText.includes("Live backend notes")) {
    throw new Error("frank_live_stock_diagnosis did not return the expected narrative briefing text");
  }

  const marketRegime = await send("tools/call", {
    name: "frank_live_market_regime",
    arguments: {
      question: "按 Frank 框架判断当前市场行情。",
      evidence_limit: 3,
      include_market_data: true,
    },
  });
  const marketRegimeText = marketRegime.content[0].text;
  if (!marketRegimeText.includes("Frank Market Regime Brief") || !marketRegimeText.includes("Live backend notes")) {
    throw new Error("frank_live_market_regime did not return the expected narrative briefing text");
  }

  console.log(JSON.stringify({
    ok: true,
    backend: status.backend_url,
    toolCount: toolNames.length,
    liveEvidenceCount: search.count,
    marketBriefType: market.brief_type,
    macroBriefType: macro.brief_type,
    liveContextChunks: context.live_context?.kol_chunks?.length ?? 0,
    stockDiagnosisChars: stockDiagnosisText.length,
    marketRegimeChars: marketRegimeText.length,
  }, null, 2));
} finally {
  child.kill();
}
