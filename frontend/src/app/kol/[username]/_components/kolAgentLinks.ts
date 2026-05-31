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
};

export function getKolStarterPrompts(username: string): string[] {
  return STARTER_PROMPTS_BY_USERNAME[username] ?? STARTER_PROMPTS_BY_USERNAME.qinbafrank;
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
