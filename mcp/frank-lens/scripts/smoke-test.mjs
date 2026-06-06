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
    })
  : spawn(process.execPath, [serverPath], {
      cwd: packageDir,
      stdio: ["pipe", "pipe", "pipe"],
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

function send(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 5000);
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

try {
  await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: {
      name: "frank-lens-smoke-test",
      version: "0.1.0",
    },
  });
  notify("notifications/initialized");

  const toolList = await send("tools/list", {});
  const toolNames = toolList.tools.map((tool) => tool.name);
  for (const required of ["frank_build_context", "frank_stock_diagnosis", "frank_market_regime"]) {
    if (!toolNames.includes(required)) {
      throw new Error(`${required} missing from tools/list: ${toolNames.join(", ")}`);
    }
  }

  const tickerLens = await send("tools/call", {
    name: "frank_get_ticker_lens",
    arguments: { ticker: "NVDA" },
  });
  const parsedTickerLens = JSON.parse(tickerLens.content[0].text);
  if (parsedTickerLens.coverage !== "high") {
    throw new Error(`Expected NVDA coverage=high, got ${parsedTickerLens.coverage}`);
  }

  const context = await send("tools/call", {
    name: "frank_build_context",
    arguments: {
      question: "按 Frank 框架看 NVDA 是杀估值、杀业绩还是杀逻辑？",
      ticker: "NVDA",
    },
  });
  const parsedContext = JSON.parse(context.content[0].text);
  if (!parsedContext.selected_lenses.some((lens) => lens.key === "NVDA")) {
    throw new Error("Expected frank_build_context to select ticker lens NVDA");
  }

  const diagnosis = await send("tools/call", {
    name: "frank_stock_diagnosis",
    arguments: {
      question: "按 Frank 框架看 NVDA 是杀估值、杀业绩还是杀逻辑？",
      ticker: "NVDA",
    },
  });
  const diagnosisText = diagnosis.content[0].text;
  if (!diagnosisText.includes("Frank Stock Diagnosis Brief") || !diagnosisText.includes("Ticker: NVDA")) {
    throw new Error("frank_stock_diagnosis did not return the expected narrative briefing text");
  }

  const marketRegime = await send("tools/call", {
    name: "frank_market_regime",
    arguments: {
      question: "按 Frank 框架判断当前市场行情。",
    },
  });
  const marketRegimeText = marketRegime.content[0].text;
  if (!marketRegimeText.includes("Frank Market Regime Brief")) {
    throw new Error("frank_market_regime did not return the expected narrative briefing text");
  }

  console.log(JSON.stringify({
    ok: true,
    toolCount: toolNames.length,
    called: ["tools/list", "frank_get_ticker_lens", "frank_build_context", "frank_stock_diagnosis", "frank_market_regime"],
    selectedLenses: parsedContext.selected_lenses.map((lens) => `${lens.layer}/${lens.key}`),
    stockDiagnosisChars: diagnosisText.length,
    marketRegimeChars: marketRegimeText.length,
  }, null, 2));
} finally {
  child.kill();
}
