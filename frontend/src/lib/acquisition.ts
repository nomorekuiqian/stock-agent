/**
 * Signup attribution (first/last touch).
 *
 * middleware.ts writes two first-party cookies on page requests:
 * - tmb_ft: first touch, written once on the first visit (even a direct one)
 * - tmb_lt: last touch, overwritten whenever a visit carries a source signal
 *   (utm_*, ref, or an external referrer)
 * AuthSubscriptionSync reads them and sends them with /subscriptions/sync-user,
 * where the backend stores them once per user in user_acquisition.
 *
 * Only the pathname and referrer host are kept — never query strings, which can
 * carry tokens or emails.
 */

export const FIRST_TOUCH_COOKIE = 'tmb_ft';
export const LAST_TOUCH_COOKIE = 'tmb_lt';
export const ACQUISITION_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

const MAX_FIELD_LENGTH = 200;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export interface AcquisitionTouch {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  ref?: string;
  landing_path?: string;
  referrer_host?: string;
  ts?: string;
}

export interface AcquisitionPayload {
  first_touch?: AcquisitionTouch;
  last_touch?: AcquisitionTouch;
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_FIELD_LENGTH) : undefined;
}

function externalReferrerHost(referer: string | null, ownHost: string): string | undefined {
  if (!referer) return undefined;
  try {
    const host = new URL(referer).hostname.toLowerCase();
    const own = ownHost.split(':')[0].toLowerCase().replace(/^www\./, '');
    if (!host || host.replace(/^www\./, '') === own) return undefined;
    return clean(host);
  } catch {
    return undefined;
  }
}

/** Build the touch for one page request. */
export function buildTouch(url: URL, referer: string | null, now: Date = new Date()): AcquisitionTouch {
  const touch: AcquisitionTouch = {};
  for (const key of UTM_KEYS) {
    const value = clean(url.searchParams.get(key));
    if (value) touch[key] = value;
  }
  const ref = clean(url.searchParams.get('ref'));
  if (ref) touch.ref = ref;
  const referrerHost = externalReferrerHost(referer, url.host);
  if (referrerHost) touch.referrer_host = referrerHost;
  touch.landing_path = clean(url.pathname) ?? '/';
  touch.ts = now.toISOString();
  return touch;
}

/** A touch counts as a source signal when it says where the visitor came from. */
export function hasSourceSignal(touch: AcquisitionTouch): boolean {
  return Boolean(touch.utm_source || touch.utm_medium || touch.utm_campaign || touch.ref || touch.referrer_host);
}

export function parseTouch(raw: string | undefined | null): AcquisitionTouch | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as AcquisitionTouch) : undefined;
  } catch {
    return undefined;
  }
}

function readCookie(cookieString: string, name: string): string | undefined {
  for (const part of cookieString.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Client-side: read both touches for the sync-user payload. */
export function readAcquisitionPayload(
  cookieString: string = typeof document === 'undefined' ? '' : document.cookie,
): AcquisitionPayload | undefined {
  const firstTouch = parseTouch(readCookie(cookieString, FIRST_TOUCH_COOKIE));
  const lastTouch = parseTouch(readCookie(cookieString, LAST_TOUCH_COOKIE));
  if (!firstTouch && !lastTouch) return undefined;
  return { first_touch: firstTouch, last_touch: lastTouch };
}
