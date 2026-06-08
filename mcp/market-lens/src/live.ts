const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000/api";
const DEFAULT_PERSONA = "qinbafrank";
const STATUS_TIMEOUT_MS = 3000;

export function liveConfig(args: Record<string, unknown> = {}) {
  return {
    backend_url: normalizedBackendUrl(),
    persona: stringArg(args, "persona") || marketLensEnv("PERSONA") || DEFAULT_PERSONA,
    has_invite_code: Boolean(marketLensEnv("INVITE_CODE")),
  };
}

export async function frankStatus(args: Record<string, unknown>) {
  return marketLensStatus(args);
}

export async function marketLensStatus(args: Record<string, unknown>) {
  const config = liveConfig(args);
  try {
    const backend = await getJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/status`);
    return {
      ok: true,
      adapter: config,
      backend,
    };
  } catch (error) {
    return {
      ok: false,
      adapter: config,
      error: error instanceof Error ? error.message : String(error),
      setup: {
        required_env: ["MARKET_LENS_BACKEND_URL", "MARKET_LENS_INVITE_CODE"],
        note: "frank_status can run without an invite code, but workflow tools require MARKET_LENS_INVITE_CODE. Legacy FRANK_LENS_* variables are also accepted.",
      },
    };
  }
}

export async function listPersonas(args: Record<string, unknown>) {
  return getJson("/kol_research/mcp/personas", args);
}

export async function listLenses(args: Record<string, unknown>) {
  const config = liveConfig(args);
  const lensType = stringArg(args, "lens_type");
  const query = lensType ? `?lens_type=${encodeURIComponent(lensType)}` : "";
  return getJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/lenses${query}`, args);
}

export async function getLens(args: Record<string, unknown>) {
  const config = liveConfig(args);
  const lensType = stringArg(args, "lens_type");
  const lensId = stringArg(args, "lens_id");
  if (!lensType) {
    throw new Error("lens_type is required.");
  }
  if (!lensId) {
    throw new Error("lens_id is required.");
  }
  return getJson(
    `/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/lenses/${encodeURIComponent(lensType)}/${encodeURIComponent(lensId)}`,
    args,
  );
}

export async function searchLenses(args: Record<string, unknown>) {
  const config = liveConfig(args);
  const query = stringArg(args, "query");
  if (!query) {
    throw new Error("query is required.");
  }
  return postJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/lenses/search`, {
    query,
    lens_types: arrayStringArg(args, "lens_types"),
    limit: boundedNumberArg(args, "limit", 8, 1, 30),
    include_body: booleanArg(args, "include_body", false),
  });
}

export async function getEvidenceByIds(args: Record<string, unknown>) {
  const config = liveConfig(args);
  const tweetIds = arrayStringArg(args, "tweet_ids");
  if (!tweetIds.length) {
    throw new Error("tweet_ids is required.");
  }
  return postJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/evidence/by-ids`, {
    tweet_ids: tweetIds.slice(0, 30),
  });
}

export async function searchEvidence(args: Record<string, unknown>) {
  const query = stringArg(args, "query");
  if (!query) {
    throw new Error("query is required.");
  }
  const config = liveConfig(args);
  const k = boundedNumberArg(args, "k", 6, 1, 20);
  const threshold = boundedFloatArg(args, "threshold", 0.45, 0, 1);
  return postJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/search`, {
    query,
    k,
    threshold,
  });
}

export async function buildContext(args: Record<string, unknown>) {
  const config = liveConfig(args);
  const question = stringArg(args, "question");
  if (!question) {
    throw new Error("question is required.");
  }
  const ticker = stringArg(args, "ticker").toUpperCase();
  const sector = stringArg(args, "sector");
  return postJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/context`, {
    question,
    ticker: ticker || null,
    sector: sector || null,
    evidence_limit: boundedNumberArg(args, "evidence_limit", 6, 1, 12),
    include_market_data: booleanArg(args, "include_market_data", true),
  });
}

export async function runWorkflow(workflow: string, args: Record<string, unknown>) {
  const config = liveConfig(args);
  const question =
    stringArg(args, "question") ||
    (workflow === "market_regime" ? "按 Frank 框架判断当前市场行情。" : "");
  const ticker = stringArg(args, "ticker").toUpperCase();
  const tickers = arrayStringArg(args, "tickers").map((item) => item.toUpperCase());
  const sector = stringArg(args, "sector");
  const evidenceLimit = boundedNumberArg(args, "evidence_limit", 6, 1, 12);
  const includeMarketData = booleanArg(args, "include_market_data", true);

  if (!question) {
    throw new Error("question is required.");
  }

  return postJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/workflow`, {
    workflow,
    question,
    ticker: ticker || null,
    tickers,
    sector: sector || null,
    evidence_limit: evidenceLimit,
    include_market_data: includeMarketData,
    share: false,
  });
}

async function getJson(path: string, args: Record<string, unknown> = {}) {
  const response = await fetchWithTimeout(apiUrl(path), {
    method: "GET",
    headers: headers(args),
  }, STATUS_TIMEOUT_MS);
  return readResponse(response);
}

async function postJson(path: string, body: unknown, args: Record<string, unknown> = {}) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      ...headers(args),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readResponse(response);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Backend request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
    const detail = isObject(payload) && payload.detail ? payload.detail : payload;
    throw new Error(`Backend HTTP ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return payload;
}

function apiUrl(path: string) {
  const base = normalizedBackendUrl();
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${normalizedPath}`;
}

function normalizedBackendUrl() {
  return (marketLensEnv("BACKEND_URL") || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

function headers(_args: Record<string, unknown> = {}) {
  const out: Record<string, string> = {};
  const inviteCode = marketLensEnv("INVITE_CODE");
  if (inviteCode) {
    out["X-Frank-Lens-Invite-Code"] = inviteCode;
  }
  return out;
}

function marketLensEnv(name: "BACKEND_URL" | "INVITE_CODE" | "PERSONA") {
  return process.env[`MARKET_LENS_${name}`] || process.env[`FRANK_LENS_${name}`] || "";
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
