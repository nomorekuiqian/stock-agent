/**
 * Resolve ActionChip `target` strings into either a Next.js push route or an
 * in-page anchor. Keep this pure so it stays trivially unit-testable.
 *
 * Target grammar (from backend whitelist):
 *   thesis:<SYMBOL>     → anchor #stock-<SYMBOL>
 *   stock:<SYMBOL>      → push /stock/<SYMBOL>
 *   digest:<uuid>       → push /for-you/<uuid>
 *   section:<id>        → anchor #section-<id>
 *   portfolio           → push /for-you/portfolio
 *   health              → push /for-you (portfolio health was removed)
 *   watchlist           → push /for-you/watchlist
 */

export type ChipRoute =
  | { kind: 'push'; href: string }
  | { kind: 'anchor'; hash: string };

export function parseChipTarget(target: string): { prefix: string; payload: string } {
  const idx = target.indexOf(':');
  if (idx === -1) return { prefix: target, payload: '' };
  return { prefix: target.slice(0, idx), payload: target.slice(idx + 1) };
}

export function resolveChipUrl(target: string): ChipRoute | null {
  const { prefix, payload } = parseChipTarget(target);
  switch (prefix) {
    case 'thesis':
      return payload ? { kind: 'anchor', hash: `#stock-${payload}` } : null;
    case 'stock':
      return payload ? { kind: 'push', href: `/stock/${payload}` } : null;
    case 'digest':
      return payload ? { kind: 'push', href: `/for-you/${payload}` } : null;
    case 'section':
      return payload ? { kind: 'anchor', hash: `#section-${payload}` } : null;
    case 'portfolio':
      return { kind: 'push', href: '/for-you/portfolio' };
    case 'health':
      return { kind: 'push', href: '/for-you' };
    case 'watchlist':
      return { kind: 'push', href: '/for-you/watchlist' };
    default:
      return null;
  }
}

/**
 * Scroll smoothly to an anchor, respecting fixed navbar height.
 * The offset (72px) matches the current Navbar height; adjust if the bar resizes.
 */
const NAVBAR_OFFSET_PX = 72;

export function scrollToAnchor(hash: string): void {
  if (typeof window === 'undefined') return;
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  const el = document.getElementById(id);
  if (!el) {
    // Fall back to native hash so user still navigates even if DOM missed
    window.location.hash = hash;
    return;
  }
  const top = el.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET_PX;
  window.scrollTo({ top, behavior: 'smooth' });
}
