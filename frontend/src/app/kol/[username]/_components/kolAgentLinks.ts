export function getKolAgentDisplayName(username: string, displayName?: string): string {
  return displayName ?? username;
}

// Starter prompt list shared between WelcomeScreen and the per-persona chat
// launchpad. WelcomeScreen wraps these in its own richer PersonaStarter shape;
// the chat launchpad consumes the bare prompt strings.
const STARTER_PROMPTS_BY_USERNAME: Record<string, string[]> = {
  qinbafrank: [
    'NVDA 还能买吗？',
    'AI 现在看什么？',
    '大盘现在危险吗？',
    '财报算利好吗？',
    '加密股还能追吗？',
  ],
  aleabitoreddit: [
    '现在 AI 供应链瓶颈卡在哪一环？',
    'SIVE 的 thesis 拆给我看？',
    '她推荐什么 small cap？跟单要注意什么风险？',
    'AXTI 为什么是卡脖子标的？',
    'CPO 现在是不是布局时机？',
  ],
};

// Persona-agnostic fallback — never borrow another KOL's prompts.
const NEUTRAL_STARTER_PROMPTS: string[] = [
  '现在最值得关注的板块和标的是什么？',
  '帮我拆解一个标的的核心逻辑和原文依据',
  '最近有哪些催化剂值得注意？',
];

export function getKolStarterPrompts(username: string): string[] {
  return STARTER_PROMPTS_BY_USERNAME[username] ?? NEUTRAL_STARTER_PROMPTS;
}

export function getDefaultKolAgentQuestion(username: string, displayName?: string): string {
  const name = getKolAgentDisplayName(username, displayName);
  return `按 ${name} 的框架，帮我判断现在最值得追问的宏观、板块和个股问题，并给出原文或数据依据。`;
}

export function getTickerKolAgentQuestion(
  username: string,
  ticker: string,
  displayName?: string,
): string {
  const name = getKolAgentDisplayName(username, displayName);
  return `按 ${name} 的框架分析 ${ticker.toUpperCase()}：他怎么看这个标的、核心逻辑是什么、有哪些原文依据？`;
}

export function buildKolAgentHref(
  username: string,
  question: string,
  extraParams: Record<string, string | null | undefined> = {},
): string {
  const params = new URLSearchParams({
    agent: 'kol',
    persona: username,
    q: question.trim(),
  });

  for (const [key, value] of Object.entries(extraParams)) {
    if (value) params.set(key, value);
  }

  return `/research?${params.toString()}`;
}
