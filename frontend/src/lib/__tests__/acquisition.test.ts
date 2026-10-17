import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import middleware from '../../../middleware';
import {
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  buildTouch,
  hasSourceSignal,
  readAcquisitionPayload,
} from '../acquisition';

const NOW = new Date('2026-10-17T12:00:00Z');

describe('buildTouch', () => {
  it('keeps utm params, ref, pathname and external referrer host only', async () => {
    const touch = buildTouch(
      new URL('https://www.themarketbrew.com/stock/NVDA?utm_source=x&utm_medium=organic&ref=frank&token=secret'),
      'https://t.co/abc?x=1',
      NOW,
    );
    expect(touch).toEqual({
      utm_source: 'x',
      utm_medium: 'organic',
      ref: 'frank',
      referrer_host: 't.co',
      landing_path: '/stock/NVDA',
      ts: NOW.toISOString(),
    });
    expect(JSON.stringify(touch)).not.toContain('secret');
  });

  it('ignores same-site referrers including www', async () => {
    const touch = buildTouch(new URL('https://www.themarketbrew.com/today'), 'https://www.themarketbrew.com/', NOW);
    expect(touch.referrer_host).toBeUndefined();
    expect(hasSourceSignal(touch)).toBe(false);
  });

  it('truncates long values', async () => {
    const touch = buildTouch(new URL(`https://www.themarketbrew.com/?utm_campaign=${'a'.repeat(500)}`), null, NOW);
    expect(touch.utm_campaign).toHaveLength(200);
  });
});

describe('readAcquisitionPayload', () => {
  it('decodes both cookies', async () => {
    const ft = encodeURIComponent(JSON.stringify({ utm_source: 'x', landing_path: '/' }));
    const lt = encodeURIComponent(JSON.stringify({ ref: 'frank' }));
    expect(readAcquisitionPayload(`a=1; ${FIRST_TOUCH_COOKIE}=${ft}; ${LAST_TOUCH_COOKIE}=${lt}`)).toEqual({
      first_touch: { utm_source: 'x', landing_path: '/' },
      last_touch: { ref: 'frank' },
    });
  });

  it('returns undefined without cookies and tolerates garbage', async () => {
    expect(readAcquisitionPayload('a=1')).toBeUndefined();
    expect(readAcquisitionPayload(`${FIRST_TOUCH_COOKIE}=%E0%A4%A; ${LAST_TOUCH_COOKIE}=notjson`)).toBeUndefined();
  });
});

describe('middleware acquisition cookies', () => {
  function cookieValue(response: Response, name: string): string | undefined {
    const header = response.headers.get('set-cookie') ?? '';
    const match = header.match(new RegExp(`${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  it('sets first and last touch on a sourced first visit', async () => {
    const response = await middleware(new NextRequest('https://www.themarketbrew.com/?utm_source=x'));
    expect(JSON.parse(cookieValue(response, FIRST_TOUCH_COOKIE)!)).toMatchObject({ utm_source: 'x', landing_path: '/' });
    expect(JSON.parse(cookieValue(response, LAST_TOUCH_COOKIE)!)).toMatchObject({ utm_source: 'x' });
  });

  it('records a direct first visit but no last touch', async () => {
    const response = await middleware(new NextRequest('https://www.themarketbrew.com/pricing'));
    expect(JSON.parse(cookieValue(response, FIRST_TOUCH_COOKIE)!)).toMatchObject({ landing_path: '/pricing' });
    expect(cookieValue(response, LAST_TOUCH_COOKIE)).toBeUndefined();
  });

  it('keeps an existing first touch and updates last touch', async () => {
    const request = new NextRequest('https://www.themarketbrew.com/?ref=frank', {
      headers: { cookie: `${FIRST_TOUCH_COOKIE}=${encodeURIComponent('{"utm_source":"old"}')}` },
    });
    const response = await middleware(request);
    expect(cookieValue(response, FIRST_TOUCH_COOKIE)).toBeUndefined();
    expect(JSON.parse(cookieValue(response, LAST_TOUCH_COOKIE)!)).toMatchObject({ ref: 'frank' });
  });

  it('skips client-side navigations', async () => {
    const response = await middleware(
      new NextRequest('https://www.themarketbrew.com/?utm_source=x', { headers: { rsc: '1' } }),
    );
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('still sets cookies on the login redirect for protected pages', async () => {
    const response = await middleware(new NextRequest('https://www.themarketbrew.com/settings?utm_source=x'));
    expect(response.status).toBe(307);
    expect(cookieValue(response, FIRST_TOUCH_COOKIE)).toBeDefined();
  });
});
