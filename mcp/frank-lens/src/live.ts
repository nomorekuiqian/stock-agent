import { buildFrankContext, buildMarketRegime, buildStockDiagnosis } from "./methodology.js";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000/api";
const DEFAULT_PERSONA = "qinbafrank";

export function liveConfig() {
  return {
    backend_url: normalizedBackendUrl(),
    persona: process.env.FRANK_LENS_PERSONA || DEFAULT_PERSONA,
    has_bearer_token: Boolean(process.env.FRANK_LENS_BEARER_TOKEN),
  };
}

export async function liveStatus() {
  const config = liveConfig();
  const profile = await getJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/profile`);
  return {
    ...config,
    ok: true,
    profile,
  };
}

export async function liveSearchEvidence(args: Record<string, unknown>) {
  const query = stringArg(args, "query");
  if (!query) {
    throw new Error("query is required.");
  }
  const persona = stringArg(args, "persona") || liveConfig().persona;
  const k = boundedNumberArg(args, "k", 6, 1, 20);
  const threshold = boundedFloatArg(args, "threshold", 0.45, 0, 1);
  return postJson(`/kol_research/personas/${encodeURIComponent(persona)}/mcp/search`, {
    query,
    k,
    threshold,
  });
}

export async function liveMarketBrief(args: Record<string, unknown>) {
  const persona = stringArg(args, "persona") || liveConfig().persona;
  const briefType = stringArg(args, "brief_type") || "stock";
  const symbol = stringArg(args, "symbol").toUpperCase();
  return postJson(`/kol_research/personas/${encodeURIComponent(persona)}/mcp/market-brief`, {
    brief_type: briefType,
    symbol: symbol || null,
  });
}

export async function liveBuildContext(args: Record<string, unknown>) {
  const question = stringArg(args, "question");
  if (!question) {
    throw new Error("question is required.");
  }
  const persona = stringArg(args, "persona") || liveConfig().persona;
  const ticker = stringArg(args, "ticker").toUpperCase();
  const sector = stringArg(args, "sector");
  const evidenceLimit = boundedNumberArg(args, "evidence_limit", 6, 1, 12);
  const includeMarketData = booleanArg(args, "include_market_data", true);
  const offline_context = buildFrankContext({
    question,
    ticker,
    sector,
    evidence_limit: evidenceLimit,
  });
  const live_context = await postJson(`/kol_research/personas/${encodeURIComponent(persona)}/mcp/context`, {
    question,
    ticker: ticker || null,
    sector: sector || null,
    evidence_limit: evidenceLimit,
    include_market_data: includeMarketData,
  });

  return {
    mode: "live",
    backend: liveConfig(),
    offline_context,
    live_context,
  };
}

export async function liveStockDiagnosis(args: Record<string, unknown>) {
  const question = stringArg(args, "question");
  if (!question) {
    throw new Error("question is required.");
  }
  const ticker = stringArg(args, "ticker").toUpperCase();
  if (!ticker) {
    throw new Error("ticker is required.");
  }
  const persona = stringArg(args, "persona") || liveConfig().persona;
  const sector = stringArg(args, "sector");
  const evidenceLimit = boundedNumberArg(args, "evidence_limit", 6, 1, 12);
  const includeMarketData = booleanArg(args, "include_market_data", true);

  const offlineBriefing = buildStockDiagnosis({
    question,
    ticker,
    sector,
    evidence_limit: evidenceLimit,
  });
  const liveContext = await postJson(`/kol_research/personas/${encodeURIComponent(persona)}/mcp/context`, {
    question,
    ticker,
    sector: sector || null,
    evidence_limit: evidenceLimit,
    include_market_data: includeMarketData,
  });

  return [
    offlineBriefing,
    "",
    "## Live backend notes",
    `Backend: ${liveConfig().backend_url}`,
    `Persona: ${persona}`,
    "",
    formatLiveContextForBrief(liveContext),
  ].join("\n").trim();
}

export async function liveMarketRegime(args: Record<string, unknown>) {
  const question = stringArg(args, "question") || "按 Frank 框架判断当前市场行情。";
  const persona = stringArg(args, "persona") || liveConfig().persona;
  const ticker = stringArg(args, "ticker").toUpperCase();
  const sector = stringArg(args, "sector");
  const evidenceLimit = boundedNumberArg(args, "evidence_limit", 6, 1, 12);
  const includeMarketData = booleanArg(args, "include_market_data", true);

  const offlineBriefing = buildMarketRegime({
    question,
    ticker,
    sector,
    evidence_limit: evidenceLimit,
  });
  const liveContext = await postJson(`/kol_research/personas/${encodeURIComponent(persona)}/mcp/context`, {
    question,
    ticker: ticker || null,
    sector: sector || null,
    evidence_limit: evidenceLimit,
    include_market_data: includeMarketData,
  });

  return [
    offlineBriefing,
    "",
    "## Live backend notes",
    `Backend: ${liveConfig().backend_url}`,
    `Persona: ${persona}`,
    "",
    formatLiveContextForBrief(liveContext),
  ].join("\n").trim();
}

async function getJson(path: string) {
  const response = await fetch(apiUrl(path), {
    method: "GET",
    headers: headers(),
  });
  return readResponse(response);
}

async function postJson(path: string, body: unknown) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      ...headers(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readResponse(response);
}

async function readResponse(response: Response) {
  const text = await response.text();
  let payload: unknown = text;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new Error(`Backend HTTP ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

function apiUrl(path: string) {
  const base = normalizedBackendUrl();
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${normalizedPath}`;
}

function normalizedBackendUrl() {
  return (process.env.FRANK_LENS_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

function headers() {
  const out: Record<string, string> = {};
  const token = process.env.FRANK_LENS_BEARER_TOKEN;
  if (token) {
    out.Authorization = `Bearer ${token}`;
  }
  return out;
}

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function booleanArg(args: Record<string, unknown>, key: string, defaultValue: boolean) {
  const value = args[key];
  return typeof value === "boolean" ? value : defaultValue;
}

function boundedNumberArg(
  args: Record<string, unknown>,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
) {
  const raw = args[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return defaultValue;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function boundedFloatArg(
  args: Record<string, unknown>,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
) {
  const raw = args[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return defaultValue;
  return Math.max(min, Math.min(max, value));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatLiveContextForBrief(value: unknown) {
  if (!isObject(value)) {
    return `Live backend returned: ${compactJson(value, 1800)}`;
  }

  const lines: string[] = [];
  const chunks = Array.isArray(value.kol_chunks) ? value.kol_chunks : [];
  if (chunks.length > 0) {
    lines.push("Live Frank evidence chunks:");
    lines.push(...chunks.slice(0, 6).map(formatChunk));
  } else {
    lines.push("Live Frank evidence chunks: none returned or not available.");
  }

  if (value.market_context) {
    lines.push("");
    lines.push("Live market data context:");
    lines.push(compactJson(value.market_context, 2600));
  }

  if (value.methodology_context) {
    lines.push("");
    lines.push("Backend methodology context:");
    lines.push(compactJson(value.methodology_context, 1600));
  }

  if (value.answer_discipline) {
    lines.push("");
    lines.push("Backend answer discipline:");
    lines.push(compactJson(value.answer_discipline, 1000));
  }

  if (lines.length === 0) {
    return compactJson(value, 3000);
  }
  return lines.join("\n");
}

function formatChunk(value: unknown, index: number) {
  if (!isObject(value)) {
    return `- Chunk ${index + 1}: ${compactJson(value, 700)}`;
  }
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const text =
    stringFromUnknown(value.content) ||
    stringFromUnknown(value.text) ||
    stringFromUnknown(value.chunk_text) ||
    stringFromUnknown(value.body) ||
    compactJson(value, 700);
  const source =
    stringFromUnknown(value.source_url) ||
    stringFromUnknown(value.url) ||
    stringFromUnknown(metadata.url) ||
    stringFromUnknown(metadata.tweet_url);
  const score = stringFromUnknown(value.score) || stringFromUnknown(value.similarity);
  const suffix = [score ? `score=${score}` : "", source].filter(Boolean).join(" | ");
  return `- Chunk ${index + 1}${suffix ? ` (${suffix})` : ""}: ${truncateText(text.replace(/\s+/g, " "), 520)}`;
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function compactJson(value: unknown, maxLen: number) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return truncateText(text, maxLen);
}

function truncateText(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}...`;
}
