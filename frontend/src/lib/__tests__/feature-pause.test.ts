import { describe, expect, it } from 'vitest';
import { isPersonaChatActive, pausedPageRedirect } from '../feature-pause';
import { sanitizeRedirectPath, SIGNUP_TOUR_REDIRECT } from '../auth-redirect';
import { getMainNavSections } from '@/components/navigation';

describe('paused products', () => {
  it.each([
    ['/for-you/health', '/for-you'], ['/for-you/monitor', '/for-you'],
    ['/research/kb', '/research'], ['/kol/panda', '/research'],
    ['/kol/qinbafrank', '/research'], ['/kol/serenity', '/research'],
    ['/qinbafrank', '/research'], ['/frank-agent', '/research'],
    ['/panda', '/research'], ['/mcp/authorize', '/research'],
    ['/for-you/onboarding', '/for-you/watchlist'],
  ])('redirects direct and post-login access to %s', (path, expected) => {
    expect(pausedPageRedirect(path)).toBe(expected);
    expect(sanitizeRedirectPath(path)).toBe(expected);
  });
  it('removes old persona and tour entry parameters', () => {
    expect(sanitizeRedirectPath('/research?agent=kol&persona=panda')).toBe('/research');
    expect(sanitizeRedirectPath('/research?agent=kol&persona=pandacircle')).toBe('/research');
    expect(sanitizeRedirectPath('/?tour=1')).toBe('/');
    expect(SIGNUP_TOUR_REDIRECT).toBe('/today');
  });
  it.each(['qinbafrank', 'aleabitoreddit'])('allows %s inside research chat', (persona) => {
    const path = `/research?agent=kol&persona=${persona}`;
    expect(isPersonaChatActive(persona)).toBe(true);
    expect(pausedPageRedirect('/research', new URLSearchParams({ agent: 'kol', persona }))).toBeNull();
    expect(sanitizeRedirectPath(path)).toBe(path);
  });
  it.each(['pandacircle', 'unknown', null])('keeps unsupported persona %s disabled', (persona) => {
    expect(isPersonaChatActive(persona)).toBe(false);
  });
  it('keeps core pages accessible and hides paused navigation for all tiers', () => {
    for (const path of ['/for-you', '/for-you/watchlist', '/for-you/portfolio', '/research', '/today', '/twitter-digest']) {
      expect(pausedPageRedirect(path)).toBeNull();
    }
    for (const isAdmin of [false, true]) {
      const sections = getMainNavSections({ forYouV2: true, watchlistExtended: true, isAdmin });
      const hrefs = sections.flatMap((item) => [item.href, ...(item.children || []).map((c) => c.href)]);
      expect(hrefs.filter((href) => pausedPageRedirect(href))).toEqual([]);
      expect(hrefs).toContain('/for-you');
    }
  });
});
