#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(packageDir, "dist", "index.js");
const authFile = path.join(packageDir, ".tmp-smoke-mcp-auth.json");
const calls = [];

function personaFromUrl(url) {
  const match = url.match(/\/personas\/([^/]+)\/mcp\//);
  return match ? decodeURIComponent(match[1]) : "qinbafrank";
}

const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : {};
    calls.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization || "",
      body,
    });
    res.setHeader("Content-Type", "application/json");

    if (req.url.includes("/mcp/auth/device/start")) {
      res.end(JSON.stringify({
        ok: true,
        status: "authorization_pending",
        device_code: "mock-device-code",
        user_code: "ABCD-EFGH",
        verification_url: "http://127.0.0.1/mock-authorize",
        poll_interval_s: 1,
      }));
      return;
    }

    if (req.url.includes("/mcp/auth/device/token")) {
      res.end(JSON.stringify({
        ok: true,
        status: "authorized",
        mcp_token: "mock-mcp-token",
        token_type: "Bearer",
        expires_at: "2099-01-01T00:00:00Z",
        scopes: ["mcp:persona", "mcp:data"],
      }));
      return;
    }

    if (req.url.includes("/mcp/auth/status")) {
      res.end(JSON.stringify({
        ok: true,
        authenticated: true,
        user_id: "user-123",
        scopes: ["mcp:persona", "mcp:data"],
      }));
      return;
    }

    if (req.url.includes("/mcp/auth/revoke")) {
      res.end(JSON.stringify({
        ok: true,
        revoked: true,
      }));
      return;
    }

    if (req.url.includes("/mcp/data/catalog")) {
      res.end(JSON.stringify({
        ok: true,
        tool: "data_catalog",
        data: { tools: { market_lens_get_brief: {}, market_lens_get_stock_data: {} } },
      }));
      return;
    }

    if (req.url.includes("/mcp/data/brief")) {
      res.end(JSON.stringify({
        ok: true,
        tool: "brief",
        request: body,
        data: { briefs: [{ brief_type: body.brief_type, symbol: body.symbol, payload: {} }] },
        errors: [],
      }));
      return;
    }

    if (req.url.includes("/mcp/data/stock")) {
      res.end(JSON.stringify({
        ok: true,
        tool: "stock_data",
        request: body,
        data: { symbol: body.symbol, sections: { quote: {} } },
        errors: [],
      }));
      return;
    }

    if (req.url.includes("/mcp/data/market")) {
      res.end(JSON.stringify({
        ok: true,
        tool: "market_data",
        request: body,
        data: { sections: { market_overview: {} } },
        errors: [],
      }));
      return;
    }

    if (req.url.includes("/mcp/data/news")) {
      res.end(JSON.stringify({
        ok: true,
        tool: "news",
        request: body,
        data: { news: [], count: 0 },
        errors: [],
      }));
      return;
    }

    if (req.url.includes("/mcp/status")) {
      const persona = personaFromUrl(req.url);
      res.end(JSON.stringify({
        ok: true,
        persona_username: persona,
        mode: "backend_first",
      }));
      return;
    }

    if (req.url.includes("/kol_research/mcp/personas")) {
      res.end(JSON.stringify({
        ok: true,
        default_persona: "qinbafrank",
        personas: [
          {
            username: "qinbafrank",
            lens_counts: { core: 1, framework: 6, macro: 1, sector: 7, ticker: 33 },
            supported_context: ["list_lenses", "get_lens", "search_lenses"],
            supported_workflows: ["stock_diagnosis", "market_regime", "compare", "research_memo"],
          },
          {
            username: "aleabitoreddit",
            display_name: "Serenity",
            lens_counts: { core: 1, framework: 7, macro: 1, sector: 9, ticker: 36 },
            supported_context: ["list_lenses", "get_lens", "search_lenses"],
            supported_workflows: ["stock_diagnosis", "market_regime", "compare", "research_memo"],
          },
        ],
      }));
      return;
    }

    if (req.url.includes("/mcp/lenses/search")) {
      const persona = personaFromUrl(req.url);
      res.end(JSON.stringify({
        persona_username: persona,
        query: body.query,
        count: 1,
        results: [
          persona === "aleabitoreddit"
            ? {
              lens_type: "ticker",
              lens_id: "SIVE",
              title: "Ticker: SIVE",
              snippet: "CPO laser chokepoint",
              evidence_tweet_ids: ["1972016308662513748"],
            }
            : {
              lens_type: "framework",
              lens_id: "ask-about-stock",
              title: "Framework: 用户在问个股",
              snippet: "mock lens snippet",
              evidence_tweet_ids: ["123"],
            },
        ],
      }));
      return;
    }

    if (req.url.includes("/mcp/lenses/ticker/SIVE")) {
      res.end(JSON.stringify({
        persona_username: "aleabitoreddit",
        lens_type: "ticker",
        lens_id: "SIVE",
        title: "Ticker: SIVE",
        full_body: "mock Serenity full body\n## Evidence Map\n(id: 1972016308662513748)",
        evidence_tweet_ids: ["1972016308662513748"],
      }));
      return;
    }

    if (req.url.includes("/mcp/lenses/ticker/NVDA")) {
      res.end(JSON.stringify({
        persona_username: "qinbafrank",
        lens_type: "ticker",
        lens_id: "NVDA",
        title: "Ticker: NVDA",
        full_body: "mock full body\n## Evidence Map\n`123`",
        evidence_tweet_ids: ["123"],
      }));
      return;
    }

    if (req.url.includes("/mcp/lenses")) {
      const persona = personaFromUrl(req.url);
      res.end(JSON.stringify({
        persona_username: persona,
        count: 1,
        lenses: [
          persona === "aleabitoreddit"
            ? {
              lens_type: "ticker",
              lens_id: "SIVE",
              title: "Ticker: SIVE",
              evidence_tweet_id_count: 1,
            }
            : {
              lens_type: "ticker",
              lens_id: "NVDA",
              title: "Ticker: NVDA",
              evidence_tweet_id_count: 1,
            },
        ],
      }));
      return;
    }

    if (req.url.includes("/mcp/evidence/by-ids")) {
      const persona = personaFromUrl(req.url);
      res.end(JSON.stringify({
        persona_username: persona,
        tweet_ids: body.tweet_ids,
        tweets: [
          persona === "aleabitoreddit"
            ? { id: "1972016308662513748", text: "Serenity historical post" }
            : { id: "123", text: "historical post" },
        ],
      }));
      return;
    }

    if (req.url.includes("/mcp/context")) {
      const persona = personaFromUrl(req.url);
      res.end(JSON.stringify({
        persona_username: persona,
        question: body.question,
        kol_chunks: [],
        market_context: [],
        answer_discipline: ["Do not impersonate."],
      }));
      return;
    }

    if (req.url.includes("/mcp/search")) {
      const persona = personaFromUrl(req.url);
      res.end(JSON.stringify({
        persona_username: persona,
        query: body.query,
        retrieval_mode: "vector_chunks",
        count: 1,
        chunks: [{ content: "mock evidence", citation_index: 1 }],
      }));
      return;
    }

    if (req.url.includes("/mcp/workflow")) {
      const persona = personaFromUrl(req.url);
      res.end(JSON.stringify({
        persona_username: persona,
        workflow: body.workflow,
        question: body.question,
        ticker: body.ticker,
        tickers: body.tickers || [],
        retrieval_mode: "vector_chunks",
        market_data_mode: "brief_tools",
        kol_chunks: [{ content: "mock evidence", citation_index: 1 }],
        market_context: [],
        methodology_context: {
          workflow: body.workflow,
          selected_lenses: persona === "aleabitoreddit" ? [{ lens_type: "ticker", lens_id: "SIVE" }] : [],
        },
        answer_discipline: ["Do not impersonate the selected persona."],
        suggested_answer_shape: ["User agent writes final answer."],
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
    THEMARKETBREW_BACKEND_URL: `http://127.0.0.1:${port}/api`,
    THEMARKETBREW_AUTH_FILE: authFile,
    THEMARKETBREW_ACCESS_TOKEN: "",
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
  fs.rmSync(authFile, { force: true });
  await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "themarketbrew-adapter-smoke-test", version: "0.5.0" },
  });
  notify("notifications/initialized");

  parseTool(await send("tools/call", { name: "market_lens_status", arguments: {} }));
  const login = parseTool(await send("tools/call", {
    name: "market_lens_login",
    arguments: { client_name: "adapter smoke" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_auth_status",
    arguments: { device_code: login.device_code },
  }));
  parseTool(await send("tools/call", { name: "market_lens_data_catalog", arguments: {} }));
  parseTool(await send("tools/call", {
    name: "market_lens_get_brief",
    arguments: { brief_type: "stock", symbol: "NVDA" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_get_stock_data",
    arguments: { symbol: "NVDA", sections: ["quote"] },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_get_market_data",
    arguments: { sections: ["market_overview"] },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_get_news",
    arguments: { symbols: ["NVDA"], scope: "stock" },
  }));
  parseTool(await send("tools/call", { name: "market_lens_personas", arguments: {} }));
  parseTool(await send("tools/call", {
    name: "market_lens_list_lenses",
    arguments: { persona: "qinbafrank", lens_type: "ticker" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_get_lens",
    arguments: { persona: "qinbafrank", lens_type: "ticker", lens_id: "NVDA" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_search_lenses",
    arguments: { persona: "qinbafrank", query: "Veto", lens_types: ["framework"] },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_get_evidence_by_ids",
    arguments: { persona: "qinbafrank", tweet_ids: ["123"] },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_search_evidence",
    arguments: { persona: "qinbafrank", query: "NVDA capex", k: 2 },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_build_context",
    arguments: { persona: "qinbafrank", question: "NVDA 怎么看？", ticker: "NVDA" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_stock_diagnosis",
    arguments: { persona: "qinbafrank", question: "NVDA 是杀估值还是杀逻辑？", ticker: "NVDA" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_market_regime",
    arguments: { persona: "qinbafrank", question: "按所选 persona 的框架判断当前市场行情。" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_compare",
    arguments: { persona: "qinbafrank", question: "NVDA 和 AVGO 只能留一只？", tickers: ["NVDA", "AVGO"] },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_research_memo",
    arguments: { persona: "qinbafrank", question: "帮我研究 CRWV 的产业逻辑。", ticker: "CRWV" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_list_lenses",
    arguments: { persona: "aleabitoreddit", lens_type: "ticker" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_get_lens",
    arguments: { persona: "aleabitoreddit", lens_type: "ticker", lens_id: "SIVE" },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_search_lenses",
    arguments: { persona: "aleabitoreddit", query: "CPO SIVE", lens_types: ["sector", "ticker"] },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_get_evidence_by_ids",
    arguments: { persona: "aleabitoreddit", tweet_ids: ["1972016308662513748"] },
  }));
  parseTool(await send("tools/call", {
    name: "market_lens_stock_diagnosis",
    arguments: { persona: "aleabitoreddit", question: "SIVE 的验证窗口怎么看？", ticker: "SIVE" },
  }));
  parseTool(await send("tools/call", { name: "market_lens_logout", arguments: {} }));
  const backendCalls = calls.filter((call) => (
    call.url.includes("/mcp/search")
    || call.url.includes("/mcp/workflow")
    || call.url.includes("/mcp/lenses")
    || call.url.includes("/mcp/evidence")
    || call.url.includes("/mcp/context")
    || call.url.includes("/mcp/data")
    || call.url.includes("/mcp/auth")
  ));
  const workflows = backendCalls
    .map((call) => call.body.workflow)
    .filter(Boolean)
    .sort();

  console.log(JSON.stringify({
    ok: true,
    backendCalls: calls.length,
    authHeaderCalls: calls.filter((call) => call.authorization === "Bearer mock-mcp-token").length,
    serenityCalls: calls.filter((call) => call.url.includes("/personas/aleabitoreddit/")).length,
    workflows,
    searchCalled: backendCalls.some((call) => call.url.includes("/mcp/search")),
  }, null, 2));
} finally {
  child.kill();
  mock.close();
  fs.rmSync(authFile, { force: true });
}
