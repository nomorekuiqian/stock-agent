const DEFAULT_BACKEND_URL = "https://stock-agent-production.up.railway.app/api";
const REQUEST_TIMEOUT_MS = 120000;

export function liveConfig() {
  return {
    backend_url: normalizedBackendUrl(),
    mode: "okx_context_mcp",
    auth: {
      themarketbrew_account_required: false,
      payment_provider: "okx_x402",
      note: "Paid HTTP endpoints may return 402 when protected by OKX x402 middleware or reverse proxy.",
    },
  };
}

export async function discovery(_args: Record<string, unknown> = {}) {
  return getJson("/okx-mcp/discovery");
}

export async function personaContext(args: Record<string, unknown>) {
  const question = stringArg(args, "question");
  if (!question) throw new Error("question is required.");
  return postJson("/okx-mcp/persona-context", {
    question,
    persona: stringArg(args, "persona") || null,
    ticker: stringArg(args, "ticker").toUpperCase() || null,
    tickers: arrayStringArg(args, "tickers").map((item) => item.toUpperCase()).slice(0, 8),
    sector: stringArg(args, "sector") || null,
    lens_types: arrayStringArg(args, "lens_types").slice(0, 5),
    lens_limit: boundedNumberArg(args, "lens_limit", 6, 1, 12),
    evidence_limit: boundedNumberArg(args, "evidence_limit", 6, 0, 12),
    include_lens_body: booleanArg(args, "include_lens_body", true),
    include_evidence_map: booleanArg(args, "include_evidence_map", true),
    include_vector_evidence: booleanArg(args, "include_vector_evidence", true),
    language: stringArg(args, "language") || "auto",
  });
}

export async function marketData(args: Record<string, unknown>) {
  return postJson("/okx-mcp/market-data", {
    data_type: stringArg(args, "data_type") || "catalog",
    symbol: stringArg(args, "symbol").toUpperCase() || null,
    symbols: arrayStringArg(args, "symbols").map((item) => item.toUpperCase()).slice(0, 10),
    brief_type: stringArg(args, "brief_type") || "stock",
    stock_sections: arrayStringArg(args, "stock_sections").slice(0, 8),
    market_sections: arrayStringArg(args, "market_sections").slice(0, 8),
    news_scope: stringArg(args, "news_scope") || "all",
    days: boundedNumberArg(args, "days", 7, 1, 30),
    history_days: boundedNumberArg(args, "history_days", 365, 5, 1825),
    year: optionalNumberArg(args, "year"),
    quarter: optionalNumberArg(args, "quarter"),
    limit: boundedNumberArg(args, "limit", 30, 1, 100),
  });
}

async function getJson(path: string) {
  const response = await fetchWithTimeout(apiUrl(path), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return readResponse(response);
}

async function postJson(path: string, body: unknown) {
  const response = await fetchWithTimeout(apiUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readResponse(response);
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Backend request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponse(response: Response) {
  const text = await response.text();
  const payload = parsePayload(text);
  if (response.status === 402) {
    return {
      ok: false,
      payment_required: true,
      status: 402,
      payment_required_header: response.headers.get("payment-required") || response.headers.get("PAYMENT-REQUIRED"),
      detail: payload,
      guidance: "This endpoint is protected by OKX x402. OKX Agentic Wallet should pay and retry automatically.",
    };
  }
  if (!response.ok) {
    const detail = isObject(payload) && payload.detail ? payload.detail : payload;
    throw new Error(`Backend HTTP ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return payload;
}

function parsePayload(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function apiUrl(path: string) {
  const base = normalizedBackendUrl();
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${normalizedPath}`;
}

function normalizedBackendUrl() {
  return (
    process.env.THEMARKETBREW_BACKEND_URL
    || process.env.OKX_MCP_BACKEND_URL
    || process.env.MARKET_LENS_BACKEND_URL
    || DEFAULT_BACKEND_URL
  ).replace(/\/+$/, "");
}

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function arrayStringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
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

function optionalNumberArg(args: Record<string, unknown>, key: string) {
  const raw = args[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.floor(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
