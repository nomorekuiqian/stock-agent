/** Deployment-controlled pause. Implementations and stored data remain intact. */
export const PAUSED_FEATURES = new Set([
  'portfolio_health', 'research_kb', 'kol_research', 'panda',
  'watchlist_monitor', 'mcp', 'onboarding',
]);

export const isFeaturePaused = (feature: string) => PAUSED_FEATURES.has(feature);

const ACTIVE_CHAT_PERSONAS = new Set(['qinbafrank', 'aleabitoreddit']);
export const isPersonaChatActive = (username: string | null | undefined) =>
  !isFeaturePaused('kol_chat') && !!username && ACTIVE_CHAT_PERSONAS.has(username);

const pausedPages: [string, string, string][] = [
  ['/for-you/health', 'portfolio_health', '/for-you'],
  ['/for-you/monitor', 'watchlist_monitor', '/for-you'],
  ['/for-you/onboarding', 'onboarding', '/for-you/watchlist'],
  ['/onboarding', 'onboarding', '/today'],
  ['/research/kb', 'research_kb', '/research'],
  ['/kol', 'kol_research', '/research'],
  ['/qinbafrank', 'kol_research', '/research'],
  ['/frank-agent', 'kol_research', '/research'],
  ['/panda', 'panda', '/research'],
  ['/mcp', 'mcp', '/research'],
];

export function pausedPageRedirect(pathname: string, params = new URLSearchParams()): string | null {
  const match = pausedPages.find(([prefix, feature]) =>
    isFeaturePaused(feature) && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
  if (match) return match[2];
  if (pathname === '/research' && (params.get('agent') === 'kol' || params.has('persona')) &&
      !isPersonaChatActive(params.get('persona'))) return '/research';
  if (pathname === '/' && isFeaturePaused('onboarding') && params.has('tour')) return '/';
  return null;
}
