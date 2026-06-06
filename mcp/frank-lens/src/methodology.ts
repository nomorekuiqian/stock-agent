import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type LensLayer = "core" | "framework" | "macro" | "sector" | "ticker";

export interface LensDoc {
  layer: LensLayer;
  key: string;
  relativePath: string;
  title: string;
  frontmatter: Record<string, string | number | boolean>;
  body: string;
  sections: Record<string, string>;
  evidenceTweetIds: string[];
}

export interface MethodologyCatalog {
  root: string;
  docs: LensDoc[];
  byLayer: Record<LensLayer, LensDoc[]>;
}

export interface SearchResult {
  layer: LensLayer;
  key: string;
  title: string;
  score: number;
  relativePath: string;
  snippets: string[];
  evidenceTweetIds: string[];
  evidenceUrls: string[];
}

const LAYERS: LensLayer[] = ["core", "framework", "macro", "sector", "ticker"];
const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_ROOT = path.join(PACKAGE_DIR, "assets", "qinbafrank");

const DEFAULT_ANSWER_DISCIPLINE = [
  "Do not impersonate qinbafrank. Say the answer is based on a distilled methodology and public tweet evidence.",
  "Only describe a historical view as directly supported when the MCP context includes tweet evidence for it.",
  "If there is no direct ticker or topic coverage, label the response as methodology inference.",
  "Separate historical Frank evidence, current facts supplied by the caller, and methodology inference.",
  "Do not give direct buy/sell/add/reduce position instructions or exact price targets.",
  "For strong claims, include a falsifier: what fact would make the thesis weaker or wrong.",
];

let cachedCatalog: MethodologyCatalog | null = null;

export function loadCatalog(assetRoot = ASSET_ROOT): MethodologyCatalog {
  if (cachedCatalog && cachedCatalog.root === assetRoot) {
    return cachedCatalog;
  }

  const docs: LensDoc[] = [];
  for (const layer of LAYERS) {
    const dir = path.join(assetRoot, layer);
    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const fileName of fs.readdirSync(dir).sort()) {
      if (!fileName.endsWith(".md")) {
        continue;
      }
      const fullPath = path.join(dir, fileName);
      const raw = fs.readFileSync(fullPath, "utf8");
      const { frontmatter, body } = parseMarkdown(raw);
      const key = path.basename(fileName, ".md");
      const sections = splitSections(body);
      docs.push({
        layer,
        key,
        relativePath: path.relative(assetRoot, fullPath),
        title: firstHeading(body) || key,
        frontmatter,
        body: body.trim(),
        sections,
        evidenceTweetIds: extractTweetIds(sectionByName(sections, ["Evidence Map", "Evidence"])),
      });
    }
  }

  const byLayer = Object.fromEntries(
    LAYERS.map((layer) => [layer, docs.filter((doc) => doc.layer === layer)]),
  ) as Record<LensLayer, LensDoc[]>;

  cachedCatalog = { root: assetRoot, docs, byLayer };
  return cachedCatalog;
}

export function listLenses() {
  const catalog = loadCatalog();
  return {
    persona: "qinbafrank",
    notice: "Distilled from public qinbafrank content. This MCP does not represent or impersonate qinbafrank.",
    counts: Object.fromEntries(
      LAYERS.map((layer) => [layer, catalog.byLayer[layer].length]),
    ),
    lenses: catalog.docs.map((doc) => ({
      layer: doc.layer,
      key: doc.key,
      title: doc.title,
      relativePath: doc.relativePath,
      frontmatter: doc.frontmatter,
      summary: summarizeDoc(doc),
      evidenceTweetCount: doc.evidenceTweetIds.length,
    })),
  };
}

export function getMethodology(args: Record<string, unknown>) {
  const layer = stringArg(args, "layer") as LensLayer | "";
  const key = stringArg(args, "key");
  const includeBody = booleanArg(args, "include_body", true);
  const catalog = loadCatalog();

  if (layer && !LAYERS.includes(layer)) {
    throw new Error(`Invalid layer: ${layer}. Expected one of ${LAYERS.join(", ")}.`);
  }

  const pool = layer ? catalog.byLayer[layer] : catalog.docs;
  if (!key) {
    return {
      persona: "qinbafrank",
      layer: layer || "all",
      count: pool.length,
      lenses: pool.map((doc) => ({
        layer: doc.layer,
        key: doc.key,
        title: doc.title,
        summary: summarizeDoc(doc),
        evidenceTweetCount: doc.evidenceTweetIds.length,
      })),
    };
  }

  const doc = findDoc(pool, key);
  if (!doc) {
    throw new Error(`Methodology lens not found: ${layer ? `${layer}/` : ""}${key}`);
  }

  return serializeDoc(doc, includeBody);
}

export function getTickerLens(args: Record<string, unknown>) {
  const ticker = stringArg(args, "ticker").toUpperCase();
  if (!ticker) {
    throw new Error("ticker is required.");
  }

  const catalog = loadCatalog();
  const doc = findDoc(catalog.byLayer.ticker, ticker);
  if (!doc) {
    return {
      ticker,
      coverage: "none",
      direct_mention_count: 0,
      notice: "No dedicated ticker playbook exists. Use core and sector methodology only.",
      matched: false,
    };
  }

  const parentSector = String(doc.frontmatter.parent_sector || "");
  const sectorDoc = parentSector ? findDoc(catalog.byLayer.sector, parentSector) : null;
  return {
    ticker,
    matched: true,
    coverage: doc.frontmatter.coverage || "unknown",
    direct_mention_count: doc.frontmatter.direct_mention_count || 0,
    parent_sector: parentSector || null,
    title: doc.title,
    positioning: firstNonEmptySection(doc, ["一句话定位", "博主如何定位", "核心问题"]),
    what_frank_checks: bulletsFromSection(doc, ["Frank 会先看什么", "他看什么信息"]),
    support_signals: bulletsFromSection(doc, ["支持信号"]),
    weakening_signals: bulletsFromSection(doc, ["削弱信号"]),
    falsifiers: bulletsFromSection(doc, ["打脸条件", "经典打脸条件"]),
    common_misreadings: bulletsFromSection(doc, ["常见误读"]),
    terminology: bulletsFromSection(doc, ["用户可见术语翻译", "术语翻译"]),
    evidenceTweetIds: doc.evidenceTweetIds,
    evidenceUrls: doc.evidenceTweetIds.map(tweetUrl),
    sector: sectorDoc
      ? {
          key: sectorDoc.key,
          title: sectorDoc.title,
          summary: summarizeDoc(sectorDoc),
        }
      : null,
    answer_discipline: DEFAULT_ANSWER_DISCIPLINE,
  };
}

export function getSectorLens(args: Record<string, unknown>) {
  const sector = stringArg(args, "sector").toLowerCase();
  if (!sector) {
    throw new Error("sector is required.");
  }

  const doc = findDoc(loadCatalog().byLayer.sector, sector);
  if (!doc) {
    throw new Error(`Sector lens not found: ${sector}`);
  }

  return {
    sector: doc.key,
    title: doc.title,
    summary: summarizeDoc(doc),
    plain_questions: numberedOrBulletsFromSection(doc, ["白话判断问题", "Frank 会先问"]),
    variables: bulletsFromSection(doc, ["Frank 会先看什么", "他看什么信息"]),
    mechanism: firstNonEmptySection(doc, ["这些变量怎么连接", "他如何理解"]),
    support_signals: bulletsFromSection(doc, ["支持信号"]),
    weakening_signals: bulletsFromSection(doc, ["削弱信号"]),
    falsifiers: bulletsFromSection(doc, ["打脸条件", "经典打脸条件"]),
    common_misreadings: bulletsFromSection(doc, ["常见误读"]),
    evidenceTweetIds: doc.evidenceTweetIds,
    evidenceUrls: doc.evidenceTweetIds.map(tweetUrl),
    answer_discipline: DEFAULT_ANSWER_DISCIPLINE,
  };
}

export function searchEvidence(args: Record<string, unknown>) {
  const query = stringArg(args, "query");
  if (!query) {
    throw new Error("query is required.");
  }
  const limit = boundedNumberArg(args, "limit", 6, 1, 20);
  const layerArg = args.layer;
  const layers = Array.isArray(layerArg)
    ? layerArg.map(String).filter(isLensLayer)
    : LAYERS;

  const results = searchDocs(query, limit, layers);
  return {
    query,
    persona: "qinbafrank",
    retrieval_mode: "local_methodology_markdown",
    limitation: "This offline MVP searches packaged methodology markdown and Evidence Map tweet IDs. It does not query the live vector database.",
    results,
  };
}

export function buildFrankContext(args: Record<string, unknown>) {
  const question = stringArg(args, "question");
  if (!question) {
    throw new Error("question is required.");
  }
  const ticker = stringArg(args, "ticker").toUpperCase();
  const explicitSector = stringArg(args, "sector").toLowerCase();
  const evidenceLimit = boundedNumberArg(args, "evidence_limit", 6, 1, 12);

  const catalog = loadCatalog();
  const selected: LensDoc[] = [];
  const push = (doc: LensDoc | null | undefined) => {
    if (doc && !selected.some((item) => item.layer === doc.layer && item.key === doc.key)) {
      selected.push(doc);
    }
  };

  push(findDoc(catalog.byLayer.core, "operating-system"));
  push(findDoc(catalog.byLayer.macro, "macro-regime"));
  push(selectFramework(question, ticker));

  const tickerDoc = ticker ? findDoc(catalog.byLayer.ticker, ticker) : inferTickerDoc(question);
  push(tickerDoc);

  const parentSector = tickerDoc ? String(tickerDoc.frontmatter.parent_sector || "") : "";
  const sectorKey = explicitSector || parentSector || inferSectorKey(question);
  if (sectorKey) {
    push(findDoc(catalog.byLayer.sector, sectorKey));
  }

  const evidence = searchDocs(
    [question, ticker, sectorKey].filter(Boolean).join(" "),
    evidenceLimit,
    ["core", "framework", "macro", "sector", "ticker"],
  );

  return {
    persona: "qinbafrank",
    question,
    notice: "This is an agent-readable context pack, not an answer and not qinbafrank speaking.",
    selected_lenses: selected.map((doc) => ({
      layer: doc.layer,
      key: doc.key,
      title: doc.title,
      summary: summarizeDoc(doc),
      key_questions: numberedOrBulletsFromSection(doc, ["Frank 会先问", "白话判断问题", "核心问题"]).slice(0, 5),
      checks: bulletsFromSection(doc, ["Frank 会先看什么", "他看什么信息"]).slice(0, 8),
      falsifiers: bulletsFromSection(doc, ["打脸条件", "经典打脸条件"]).slice(0, 6),
      evidenceTweetIds: doc.evidenceTweetIds.slice(0, 12),
      evidenceUrls: doc.evidenceTweetIds.slice(0, 12).map(tweetUrl),
    })),
    retrieved_evidence: evidence,
    answer_discipline: DEFAULT_ANSWER_DISCIPLINE,
    suggested_answer_shape: [
      "Start with a plain-language conclusion.",
      "Explain which Frank lens applies and what he would check first.",
      "Separate direct historical evidence from methodology inference.",
      "Name 2-3 confirmation or falsification signals.",
      "Avoid direct trading instructions.",
    ],
  };
}

export function buildStockDiagnosis(args: Record<string, unknown>) {
  const question = stringArg(args, "question");
  if (!question) {
    throw new Error("question is required.");
  }
  const ticker = stringArg(args, "ticker").toUpperCase();
  if (!ticker) {
    throw new Error("ticker is required.");
  }
  const explicitSector = stringArg(args, "sector").toLowerCase();
  const evidenceLimit = boundedNumberArg(args, "evidence_limit", 6, 1, 12);

  const tickerLens = getTickerLens({ ticker }) as Record<string, unknown>;
  const parentSector = stringProp(tickerLens, "parent_sector").toLowerCase();
  const sectorKey = explicitSector || parentSector || inferSectorKey(`${question} ${ticker}`);
  const sectorLens = sectorKey ? safeGetSectorLens(sectorKey) : null;
  const evidence = searchDocs(
    [question, ticker, sectorKey, "杀估值 杀业绩 杀逻辑 打脸条件"].filter(Boolean).join(" "),
    evidenceLimit,
    ["core", "framework", "macro", "sector", "ticker"],
  );

  const lines = [
    "# Frank Stock Diagnosis Brief",
    "",
    `User question: ${question}`,
    `Ticker: ${ticker}`,
    "",
    "This is a loose analyst briefing for the client agent. It is meant to suggest a lens and useful evidence trails, not to dictate the final answer format.",
    "",
    "Coverage posture",
    coveragePostureText(ticker, tickerLens),
    "",
    "Main lens to carry into the answer",
    "Read the stock move through the three-kill distinction: valuation, earnings, or logic. The useful question is not only whether the stock is up or down, but which variable changed and what would prove that read wrong.",
    "",
    "What to look at first",
    ...formatBullets([
      ...stringList(tickerLens.what_frank_checks, 5),
      ...(sectorLens ? stringList(sectorLens.variables, 4) : []),
    ]),
    "",
    "Signals that would strengthen the read",
    ...formatBullets([
      ...stringList(tickerLens.support_signals, 4),
      ...(sectorLens ? stringList(sectorLens.support_signals, 3) : []),
    ]),
    "",
    "Signals that would weaken or falsify it",
    ...formatBullets([
      ...stringList(tickerLens.weakening_signals, 4),
      ...stringList(tickerLens.falsifiers, 4),
      ...(sectorLens ? stringList(sectorLens.falsifiers, 3) : []),
    ]),
    "",
    "Evidence trails worth reading",
    ...formatSearchResults(evidence),
    "",
    "Answering stance",
    "The final agent can choose its own structure. It should separate Frank-backed historical evidence, current market facts supplied by live data or the caller, and methodology inference. It should avoid pretending to speak as qinbafrank, direct trading commands, and exact price targets.",
  ];

  return compactLines(lines);
}

export function buildMarketRegime(args: Record<string, unknown>) {
  const question = stringArg(args, "question") || "按 Frank 框架判断当前市场行情。";
  const ticker = stringArg(args, "ticker").toUpperCase();
  const explicitSector = stringArg(args, "sector").toLowerCase();
  const evidenceLimit = boundedNumberArg(args, "evidence_limit", 6, 1, 12);

  const catalog = loadCatalog();
  const macroDoc = findDoc(catalog.byLayer.macro, "macro-regime");
  const coreDoc = findDoc(catalog.byLayer.core, "operating-system");
  const frameworkDoc = findDoc(catalog.byLayer.framework, "ask-about-macro");
  const tickerDoc = ticker ? findDoc(catalog.byLayer.ticker, ticker) : inferTickerDoc(question);
  const parentSector = tickerDoc ? String(tickerDoc.frontmatter.parent_sector || "") : "";
  const sectorKey = explicitSector || parentSector || inferSectorKey(`${question} ${ticker}`);
  const sectorDoc = sectorKey ? findDoc(catalog.byLayer.sector, sectorKey) : null;

  const evidence = searchDocs(
    [
      question,
      ticker,
      sectorKey,
      "宏观 流动性 利率 美元 风险等级 杀估值 杀业绩 杀逻辑",
    ].filter(Boolean).join(" "),
    evidenceLimit,
    ["core", "framework", "macro", "sector", "ticker"],
  );

  const lines = [
    "# Frank Market Regime Brief",
    "",
    `User question: ${question}`,
    ticker ? `Ticker focus: ${ticker}` : "",
    sectorKey ? `Sector focus: ${sectorKey}` : "",
    "",
    "This is a loose market-regime briefing for the client agent. It should nudge the reasoning, not lock the answer into a fixed report template.",
    "",
    "Main lens to carry into the answer",
    "Start by asking which force is driving risk appetite now: liquidity/rates, earnings revisions, sector narrative, or a genuine logic break. Then connect that force back to what it does to valuation, earnings, and narrative durability.",
    "",
    "Useful Frank-methodology anchors",
    ...formatBullets([
      macroDoc ? firstNonEmptySection(macroDoc, ["用户真正想知道什么", "一句话定位", "核心问题"], 360) : "",
      frameworkDoc ? summarizeDoc(frameworkDoc) : "",
      coreDoc ? summarizeDoc(coreDoc) : "",
      sectorDoc ? summarizeDoc(sectorDoc) : "",
    ]),
    "",
    "Questions the final agent may improvise around",
    ...formatBullets([
      "Is this move mostly market beta, or did the market change its view of a specific growth/earnings path?",
      "Is macro pressure killing valuation only, or is it starting to damage earnings expectations?",
      "For AI and high-beta themes, is the market still rewarding durable demand, or is it questioning the capex/payback logic?",
      "What fact would quickly make the current regime read weaker?",
    ]),
    "",
    "Current data that should be brought in if available",
    ...formatBullets([
      "Index and sector breadth, not only headline index level.",
      "Rates, dollar, liquidity, volatility, and recent macro surprise direction.",
      "Earnings revision or guidance changes for the relevant sector/ticker.",
      "Recent live Frank tweet chunks, if the live workflow is available.",
    ]),
    "",
    "Evidence trails worth reading",
    ...formatSearchResults(evidence),
    "",
    "Answering stance",
    "The final agent can choose its own narrative shape. It should say when it is using direct Frank evidence versus applying the distilled framework to current facts. Avoid direct trading instructions and exact price targets.",
  ];

  return compactLines(lines);
}

function searchDocs(query: string, limit: number, layers: LensLayer[]): SearchResult[] {
  const tokens = tokenize(query);
  const docs = loadCatalog().docs.filter((doc) => layers.includes(doc.layer));
  const scored = docs.map((doc) => {
    const haystack = `${doc.key}\n${doc.title}\n${doc.body}`.toLowerCase();
    const exact = query.toLowerCase();
    let score = haystack.includes(exact) ? 8 : 0;
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (doc.key.toLowerCase().includes(lower)) score += 8;
      if (doc.title.toLowerCase().includes(lower)) score += 5;
      score += countOccurrences(haystack, lower);
    }
    return { doc, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ doc, score }) => ({
      layer: doc.layer,
      key: doc.key,
      title: doc.title,
      score,
      relativePath: doc.relativePath,
      snippets: makeSnippets(doc.body, tokens, 3),
      evidenceTweetIds: doc.evidenceTweetIds.slice(0, 12),
      evidenceUrls: doc.evidenceTweetIds.slice(0, 12).map(tweetUrl),
    }));
}

function parseMarkdown(raw: string) {
  if (!raw.startsWith("---")) {
    return { frontmatter: {}, body: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end < 0) {
    return { frontmatter: {}, body: raw };
  }
  const frontmatter: Record<string, string | number | boolean> = {};
  for (const line of raw.slice(3, end).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes(":")) {
      continue;
    }
    const [rawKey, ...rest] = trimmed.split(":");
    const key = rawKey.trim();
    const value = rest.join(":").trim().replace(/^["']|["']$/g, "");
    if (/^\d+$/.test(value)) {
      frontmatter[key] = Number(value);
    } else if (value === "true" || value === "false") {
      frontmatter[key] = value === "true";
    } else {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: raw.slice(end + 4).trimStart() };
}

function splitSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current = "";
  const buffer: string[] = [];

  const flush = () => {
    if (current) {
      sections[current] = buffer.join("\n").trim();
    }
    buffer.length = 0;
  };

  for (const line of body.split("\n")) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      flush();
      current = match[1].trim();
      continue;
    }
    if (current) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function firstHeading(body: string) {
  const match = /^#\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : "";
}

function sectionByName(sections: Record<string, string>, names: string[]) {
  for (const [title, body] of Object.entries(sections)) {
    if (names.some((name) => title.includes(name))) {
      return body;
    }
  }
  return "";
}

function firstNonEmptySection(doc: LensDoc, names: string[], maxLen = 900) {
  const text = sectionByName(doc.sections, names).trim();
  return truncate(cleanMarkdown(text), maxLen);
}

function bulletsFromSection(doc: LensDoc, names: string[]) {
  const text = sectionByName(doc.sections, names);
  return extractBullets(text);
}

function numberedOrBulletsFromSection(doc: LensDoc, names: string[]) {
  const text = sectionByName(doc.sections, names);
  return extractBullets(text, true);
}

function extractBullets(text: string, includeNumbered = false) {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = includeNumbered ? /^\s*\d+[\.)]\s+(.+)$/.exec(line) : null;
    const match = bullet || numbered;
    if (match) {
      out.push(cleanMarkdown(match[1]));
    }
  }
  return out;
}

function summarizeDoc(doc: LensDoc) {
  const preferred = firstNonEmptySection(doc, ["一句话定位", "核心问题", "用户真正想知道什么", "适用问题"], 360);
  if (preferred) {
    return preferred;
  }
  return truncate(cleanMarkdown(doc.body), 360);
}

function serializeDoc(doc: LensDoc, includeBody: boolean) {
  return {
    layer: doc.layer,
    key: doc.key,
    title: doc.title,
    relativePath: doc.relativePath,
    frontmatter: doc.frontmatter,
    summary: summarizeDoc(doc),
    sections: Object.keys(doc.sections),
    evidenceTweetIds: doc.evidenceTweetIds,
    evidenceUrls: doc.evidenceTweetIds.map(tweetUrl),
    body: includeBody ? doc.body : undefined,
  };
}

function findDoc(docs: LensDoc[], key: string) {
  const normalized = key.toLowerCase().replace(/\.md$/, "");
  return docs.find((doc) => doc.key.toLowerCase() === normalized) || null;
}

function inferTickerDoc(question: string) {
  const upper = question.toUpperCase();
  return loadCatalog().byLayer.ticker.find((doc) => upper.includes(doc.key.toUpperCase())) || null;
}

function selectFramework(question: string, ticker: string) {
  const frameworks = loadCatalog().byLayer.framework;
  const mentionedTickers = loadCatalog().byLayer.ticker.filter((doc) =>
    question.toUpperCase().includes(doc.key.toUpperCase()),
  );
  const isThreeKillsQuestion = /(杀估值|杀业绩|杀逻辑|三杀)/i.test(question);
  if (ticker && isThreeKillsQuestion) {
    return findDoc(frameworks, "ask-about-stock");
  }
  if (/( vs |比较|compare|只能留|谁更)/i.test(question) || (question.includes("还是") && mentionedTickers.length >= 2)) {
    return findDoc(frameworks, "ask-to-compare");
  }
  if (/(宏观|流动性|fed|fomc|cpi|pce|关税|地缘|利率|美元)/i.test(question)) {
    return findDoc(frameworks, "ask-about-macro");
  }
  if (/(方法|框架|三杀|杀估值|杀业绩|杀逻辑|打脸|veto|能力圈)/i.test(question)) {
    return findDoc(frameworks, "ask-about-method");
  }
  if (/(能不能买|该不该|卖|加仓|减仓|梭哈|all in|做空)/i.test(question)) {
    return findDoc(frameworks, "ask-about-veto");
  }
  if (ticker || mentionedTickers.length > 0 || /[A-Z]{2,5}/.test(question)) {
    return findDoc(frameworks, "ask-about-stock");
  }
  return findDoc(frameworks, "ask-about-sector");
}

function inferSectorKey(question: string) {
  if (/(AI|算力|GPU|HBM|NVDA|AMD|TSM|MU|AVGO|数据中心|capex|agent)/i.test(question)) {
    return "ai-infrastructure";
  }
  if (/(加密|crypto|rwa|stablecoin|稳定币|COIN|HOOD|CRCL|BTC|ETH)/i.test(question)) {
    return "crypto-stablecoin-rwa";
  }
  if (/(太空|国防|军工|space|defense|RKLB|LUNR|ASTS|PLTR)/i.test(question)) {
    return "defense-and-space";
  }
  if (/(软件|SaaS|agent|PLTR|CRWD|SNOW)/i.test(question)) {
    return "software-ai-disruption";
  }
  return "";
}

function extractTweetIds(text: string) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/`?(\d{15,})`?/g)) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function tweetUrl(id: string) {
  return `https://x.com/qinbafrank/status/${id}`;
}

function tokenize(query: string) {
  const tokens = new Set<string>();
  for (const match of query.matchAll(/[A-Za-z0-9_.$-]{2,}|[\u4e00-\u9fff]{2,}/g)) {
    tokens.add(match[0]);
  }
  return Array.from(tokens).filter((token) => !STOP_WORDS.has(token.toLowerCase()));
}

function countOccurrences(text: string, token: string) {
  if (!token) return 0;
  let count = 0;
  let index = text.indexOf(token);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(token, index + token.length);
  }
  return count;
}

function makeSnippets(body: string, tokens: string[], limit: number) {
  const clean = cleanMarkdown(body).replace(/\s+/g, " ");
  const snippets: string[] = [];
  const lower = clean.toLowerCase();
  for (const token of tokens) {
    const idx = lower.indexOf(token.toLowerCase());
    if (idx < 0) continue;
    const start = Math.max(0, idx - 90);
    const end = Math.min(clean.length, idx + token.length + 180);
    snippets.push(clean.slice(start, end).trim());
    if (snippets.length >= limit) break;
  }
  if (snippets.length === 0) {
    snippets.push(truncate(clean, 260));
  }
  return snippets;
}

function cleanMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .trim();
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}...`;
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

function isLensLayer(value: string): value is LensLayer {
  return LAYERS.includes(value as LensLayer);
}

function safeGetSectorLens(sector: string) {
  try {
    return getSectorLens({ sector }) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coveragePostureText(ticker: string, lens: Record<string, unknown>) {
  if (lens.matched !== true) {
    return `There is no dedicated ${ticker} ticker playbook in the packaged assets. Treat any stock-specific conclusion as methodology inference from core/sector lenses unless live evidence supplies direct coverage.`;
  }
  const coverage = stringProp(lens, "coverage") || "unknown";
  const count = stringProp(lens, "direct_mention_count") || "0";
  const sector = stringProp(lens, "parent_sector");
  const sectorText = sector ? ` Parent sector lens: ${sector}.` : "";
  if (coverage === "high" || coverage === "medium") {
    return `${ticker} has ${coverage} packaged coverage with ${count} direct mention(s). Historical Frank evidence can support parts of the read, but current facts still need to be supplied separately.${sectorText}`;
  }
  return `${ticker} has limited packaged coverage with ${count} direct mention(s). Use the ticker notes as hints and lean more on sector/core methodology plus current facts.${sectorText}`;
}

function stringProp(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function stringList(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, max);
}

function formatBullets(items: string[]) {
  const seen = new Set<string>();
  const clean = items
    .map((item) => truncate(normalizeBriefingBullet(item), 420))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (clean.length === 0) {
    return ["- No strong packaged-methodology signal. Let the final agent infer cautiously from current facts."];
  }
  return clean.map((item) => `- ${item}`);
}

function normalizeBriefingBullet(item: string) {
  return item
    .replace(/\s+/g, " ")
    .replace(/^[-*]\s+/, "")
    .replace(/\s[-*]\s+/g, " ")
    .trim();
}

function formatSearchResults(results: SearchResult[]) {
  if (results.length === 0) {
    return ["- No local methodology evidence matched. Use this as a methodology-only inference."];
  }
  return results.map((result) => {
    const snippet = result.snippets[0] ? ` ${truncate(result.snippets[0], 220)}` : "";
    const urls = result.evidenceUrls.slice(0, 3).join(", ");
    return `- ${result.layer}/${result.key} (${result.title}).${snippet}${urls ? ` Evidence: ${urls}` : ""}`;
  });
}

function compactLines(lines: string[]) {
  return lines
    .map((line) => line.trimEnd())
    .filter((line, index, all) => line || all[index - 1] !== "")
    .join("\n")
    .trim();
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "怎么",
  "如何",
  "现在",
  "什么",
  "一个",
  "还是",
]);
