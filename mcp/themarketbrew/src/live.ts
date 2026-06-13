import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000/api";
const STATUS_TIMEOUT_MS = 3000;
const DEFAULT_AUTH_FILE = path.join(os.homedir(), ".themarketbrew", "mcp-auth.json");

export function liveConfig(args: Record<string, unknown> = {}) {
  const explicitPersona = stringArg(args, "persona");
  const configuredPersona = theMarketBrewEnv("PERSONA");
  return {
    backend_url: normalizedBackendUrl(),
    persona: explicitPersona || configuredPersona,
    persona_source: explicitPersona ? "argument" : configuredPersona ? "environment" : "none",
  };
}

export async function marketLensStatus(args: Record<string, unknown>) {
  const config = liveConfig(args);
  const auth = await localAuthStatus();
  if (!config.persona) {
    return {
      ok: true,
      adapter: config,
      auth,
      backend: {
        status_endpoint: `${config.backend_url}/kol_research/personas/{persona}/mcp/status`,
        content_tools_require_account: true,
      },
      routing_guidance: [
        auth.authenticated
          ? "Call market_lens_personas, choose the best persona for the user's query and available lens coverage, then pass persona explicitly to later tools."
          : "Call market_lens_login first. Content tools require a TheMarketBrew account.",
        "Set THEMARKETBREW_PERSONA only when this MCP server should be pinned to one persona for this client/workspace.",
      ],
    };
  }
  try {
    const backend = await getJson(
      `/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/status`,
      args,
      { auth: false },
    );
    return {
      ok: true,
      adapter: config,
      auth,
      backend,
    };
  } catch (error) {
    return {
      ok: false,
      adapter: config,
      error: error instanceof Error ? error.message : String(error),
      setup: {
        required_env: ["THEMARKETBREW_BACKEND_URL"],
        note: "Set THEMARKETBREW_BACKEND_URL to the backend /api base URL. THEMARKETBREW_PERSONA is optional and should only be used to pin a default persona. MARKET_LENS_* remains accepted as a compatibility fallback.",
      },
    };
  }
}

export async function login(args: Record<string, unknown>) {
  const deviceCode = stringArg(args, "device_code");
  if (deviceCode) {
    return authStatus(args);
  }
  return postJson(
    "/kol_research/mcp/auth/device/start",
    { client_name: stringArg(args, "client_name") || "TheMarketBrew MCP" },
    args,
    { auth: false },
  );
}

export async function authStatus(args: Record<string, unknown>) {
  const deviceCode = stringArg(args, "device_code");
  if (deviceCode) {
    const result = await postJson(
      "/kol_research/mcp/auth/device/token",
      { device_code: deviceCode },
      args,
      { auth: false },
    );
    if (isObject(result) && typeof result.mcp_token === "string") {
      saveStoredToken({
        backend_url: normalizedBackendUrl(),
        mcp_token: result.mcp_token,
        expires_at: typeof result.expires_at === "string" ? result.expires_at : undefined,
      });
      return {
        ...result,
        stored: true,
        auth_file: authFilePath(),
      };
    }
    return result;
  }
  const token = getMcpToken();
  if (!token) {
    return {
      ok: false,
      authenticated: false,
      auth_required: true,
      login_tool: "market_lens_login",
      note: "Call market_lens_login to authorize this MCP client with a TheMarketBrew account.",
    };
  }
  return getJson("/kol_research/mcp/auth/status", args);
}

export async function logout(args: Record<string, unknown>) {
  const token = getMcpToken();
  if (!token) {
    clearStoredToken();
    return { ok: true, revoked: false, authenticated: false };
  }
  const result = await postJson("/kol_research/mcp/auth/revoke", {}, args);
  clearStoredToken();
  return { ...asObject(result), stored_token_deleted: true };
}

export async function listPersonas(args: Record<string, unknown>) {
  return getJson("/kol_research/mcp/personas", args);
}

export async function listLenses(args: Record<string, unknown>) {
  const config = requirePersona(args, "list lenses");
  const lensType = stringArg(args, "lens_type");
  const query = lensType ? `?lens_type=${encodeURIComponent(lensType)}` : "";
  return getJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/lenses${query}`, args);
}

export async function getLens(args: Record<string, unknown>) {
  const config = requirePersona(args, "get a lens");
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
  const config = requirePersona(args, "search persona material");
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
  const config = requirePersona(args, "get evidence by IDs");
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
  const config = requirePersona(args, "search evidence");
  const k = boundedNumberArg(args, "k", 6, 1, 20);
  const threshold = boundedFloatArg(args, "threshold", 0.45, 0, 1);
  return postJson(`/kol_research/personas/${encodeURIComponent(config.persona)}/mcp/search`, {
    query,
    k,
    threshold,
  });
}

export async function buildContext(args: Record<string, unknown>) {
  const config = requirePersona(args, "build context");
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
    data_sections: arrayStringArg(args, "data_sections").slice(0, 8),
    news_days: boundedNumberArg(args, "news_days", 7, 1, 30),
  });
}

export async function runWorkflow(workflow: string, args: Record<string, unknown>) {
  const config = requirePersona(args, `run ${workflow}`);
  const question =
    stringArg(args, "question") ||
    (workflow === "market_regime" ? "按所选 persona 的框架判断当前市场行情。" : "");
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
    data_sections: arrayStringArg(args, "data_sections").slice(0, 8),
    news_days: boundedNumberArg(args, "news_days", 7, 1, 30),
    share: false,
  });
}

export async function dataCatalog(args: Record<string, unknown>) {
  return getJson("/kol_research/mcp/data/catalog", args);
}

export async function getBrief(args: Record<string, unknown>) {
  const briefType = stringArg(args, "brief_type") || "stock";
  return postJson("/kol_research/mcp/data/brief", {
    brief_type: briefType,
    symbol: stringArg(args, "symbol").toUpperCase() || null,
    symbols: arrayStringArg(args, "symbols").map((item) => item.toUpperCase()).slice(0, 5),
    include_market_data: booleanArg(args, "include_market_data", true),
  }, args);
}

export async function getStockData(args: Record<string, unknown>) {
  const symbol = stringArg(args, "symbol").toUpperCase();
  if (!symbol) throw new Error("symbol is required.");
  const sections = arrayStringArg(args, "sections").slice(0, 8);
  if (!sections.length) throw new Error("sections is required.");
  return postJson("/kol_research/mcp/data/stock", {
    symbol,
    sections,
    days: boundedNumberArg(args, "days", 7, 1, 30),
    history_days: boundedNumberArg(args, "history_days", 365, 5, 1825),
    year: optionalNumberArg(args, "year"),
    quarter: optionalNumberArg(args, "quarter"),
    limit: boundedNumberArg(args, "limit", 30, 1, 100),
  }, args);
}

export async function getMarketData(args: Record<string, unknown>) {
  const sections = arrayStringArg(args, "sections").slice(0, 8);
  if (!sections.length) throw new Error("sections is required.");
  return postJson("/kol_research/mcp/data/market", {
    sections,
    days: boundedNumberArg(args, "days", 14, 1, 30),
  }, args);
}

export async function getNews(args: Record<string, unknown>) {
  return postJson("/kol_research/mcp/data/news", {
    symbols: arrayStringArg(args, "symbols").map((item) => item.toUpperCase()).slice(0, 10),
    scope: stringArg(args, "scope") || "all",
    days: boundedNumberArg(args, "days", 7, 1, 30),
    limit: boundedNumberArg(args, "limit", 20, 1, 50),
  }, args);
}

function requirePersona(args: Record<string, unknown>, action: string) {
  const config = liveConfig(args);
  if (config.persona) {
    return config;
  }
  throw new Error(
    `persona is required to ${action}. Call market_lens_personas first, choose the persona whose methodology and lens coverage best match the user's query, then pass that persona explicitly. Set THEMARKETBREW_PERSONA only if this MCP server should be pinned to one persona.`,
  );
}

type RequestOptions = {
  auth?: boolean;
};

async function getJson(path: string, args: Record<string, unknown> = {}, options: RequestOptions = {}) {
  const response = await fetchWithTimeout(apiUrl(path), {
    method: "GET",
    headers: headers(args, options),
  }, STATUS_TIMEOUT_MS);
  return readResponse(response);
}

async function postJson(path: string, body: unknown, args: Record<string, unknown> = {}, options: RequestOptions = {}) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      ...headers(args, options),
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
    if (isObject(detail) && detail.code === "auth_required") {
      return {
        ok: false,
        auth_required: true,
        ...detail,
      };
    }
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
  return (theMarketBrewEnv("BACKEND_URL") || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

function headers(_args: Record<string, unknown> = {}, options: RequestOptions = {}): Record<string, string> {
  if (options.auth === false) return {};
  const token = getMcpToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function theMarketBrewEnv(name: string) {
  return process.env[`THEMARKETBREW_${name}`] || process.env[`MARKET_LENS_${name}`] || "";
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

function asObject(value: unknown) {
  return isObject(value) ? value : { value };
}

type StoredAuth = {
  backend_url?: string;
  mcp_token?: string;
  expires_at?: string;
};

function authFilePath() {
  return theMarketBrewEnv("AUTH_FILE") || DEFAULT_AUTH_FILE;
}

function getMcpToken() {
  const envToken = theMarketBrewEnv("ACCESS_TOKEN");
  if (envToken) return envToken;
  const stored = readStoredToken();
  if (!stored?.mcp_token) return "";
  if (stored.backend_url && stored.backend_url !== normalizedBackendUrl()) return "";
  if (stored.expires_at && Date.parse(stored.expires_at) <= Date.now()) return "";
  return stored.mcp_token;
}

function readStoredToken(): StoredAuth | null {
  try {
    const file = authFilePath();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return isObject(parsed) ? parsed as StoredAuth : null;
  } catch {
    return null;
  }
}

function saveStoredToken(auth: StoredAuth) {
  const file = authFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Best effort on non-POSIX filesystems.
  }
}

function clearStoredToken() {
  try {
    fs.rmSync(authFilePath(), { force: true });
  } catch {
    // Ignore local cleanup errors.
  }
}

async function localAuthStatus() {
  const token = getMcpToken();
  if (!token) {
    return {
      authenticated: false,
      auth_required: true,
      login_tool: "market_lens_login",
      auth_file: authFilePath(),
    };
  }
  try {
    const remote = await getJson("/kol_research/mcp/auth/status", {}, { auth: true });
    return {
      authenticated: true,
      auth_file: theMarketBrewEnv("ACCESS_TOKEN") ? "env:THEMARKETBREW_ACCESS_TOKEN" : authFilePath(),
      remote,
    };
  } catch (error) {
    return {
      authenticated: false,
      auth_required: true,
      auth_file: authFilePath(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
