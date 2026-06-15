type KolFollowUpChunk = {
  tickers?: string[];
  content?: string;
  metadata?: Record<string, unknown>;
};

interface KolFollowUpInput {
  userMessage: string;
  assistantMessage: string;
  chunks?: KolFollowUpChunk[];
  contentContext?: Record<string, unknown>;
}

const TICKER_STOP_WORDS = new Set([
  'AI',
  'API',
  'ATH',
  'CFO',
  'CEO',
  'CPI',
  'CPU',
  'ETF',
  'EPS',
  'FOMC',
  'GDP',
  'GPU',
  'HBM',
  'IPO',
  'PE',
  'PPI',
  'RPO',
  'SEC',
  'USD',
  'VIX',
  'YOY',
  'YTD',
]);

function normalizeTicker(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ticker = value.trim().replace(/^\$/, '').toUpperCase();
  if (!/^[A-Z][A-Z0-9.]{0,5}$/.test(ticker)) return null;
  if (TICKER_STOP_WORDS.has(ticker)) return null;
  return ticker;
}

function extractPrimaryTicker(input: KolFollowUpInput): string | null {
  const fromContext = normalizeTicker(input.contentContext?.symbol);
  if (fromContext) return fromContext;

  for (const chunk of input.chunks || []) {
    for (const raw of chunk.tickers || []) {
      const ticker = normalizeTicker(raw);
      if (ticker) return ticker;
    }
  }

  const text = `${input.userMessage}\n${input.assistantMessage}`;
  const matches = text.match(/\$?[A-Z][A-Z0-9.]{0,5}\b/g) || [];
  for (const match of matches) {
    const ticker = normalizeTicker(match);
    if (ticker) return ticker;
  }
  return null;
}

function uniqueOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const option of options) {
    const clean = option.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length === 4) break;
  }
  return out;
}

export function buildKolFollowUpOptions(input: KolFollowUpInput): string[] {
  const combined = `${input.userMessage}\n${input.assistantMessage}`;
  const ticker = extractPrimaryTicker(input);
  const isMarketQuestion = /市场|大盘|宏观|流动性|利率|美债|通胀|回调|下跌|风险|行情|财报季|估值/.test(combined);
  const isSectorQuestion = /产业链|行业|板块|主题|算力|半导体|加密|能源|电力|国防|太空|光通信|CPO|软件/.test(combined);
  const hasThinCoverage = /没有检索到|未检索到|没有直接|讨论不多|覆盖较弱|缺少直接|资料不足|证据不足/.test(input.assistantMessage);

  if (ticker) {
    return uniqueOptions([
      `查 ${ticker} 历史观点`,
      `${ticker} 的打脸条件`,
      `用最新数据验证 ${ticker}`,
      isSectorQuestion ? '放回产业链对比' : '和同主线标的对比',
      hasThinCoverage ? '扩大到行业框架' : '',
    ]);
  }

  if (isMarketQuestion) {
    return uniqueOptions([
      '判断杀估值还是杀逻辑',
      '列出关键打脸信号',
      '看对 AI 主线影响',
      '生成后续观察清单',
    ]);
  }

  if (isSectorQuestion) {
    return uniqueOptions([
      '拆产业链层级',
      '找最关键瓶颈',
      '列出打脸条件',
      '哪些公司最相关',
    ]);
  }

  return uniqueOptions([
    hasThinCoverage ? '扩大到上级框架' : '查历史原文证据',
    '列出打脸条件',
    '用当前数据验证',
    '继续追问主要风险',
  ]);
}
