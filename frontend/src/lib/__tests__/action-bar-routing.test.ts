import { describe, it, expect, vi } from 'vitest';
import { parseChipTarget, resolveChipUrl } from '../action-bar-routing';

describe('parseChipTarget', () => {
  it('parses prefix:payload', () => {
    expect(parseChipTarget('thesis:NVDA')).toEqual({ prefix: 'thesis', payload: 'NVDA' });
  });

  it('parses bare targets', () => {
    expect(parseChipTarget('portfolio')).toEqual({ prefix: 'portfolio', payload: '' });
  });
});

describe('resolveChipUrl', () => {
  it('maps thesis to anchor', () => {
    expect(resolveChipUrl('thesis:NVDA')).toEqual({ kind: 'anchor', hash: '#stock-NVDA' });
  });

  it('maps section to anchor', () => {
    expect(resolveChipUrl('section:notes')).toEqual({ kind: 'anchor', hash: '#section-notes' });
  });

  it('maps bare portfolio to push route', () => {
    expect(resolveChipUrl('portfolio')).toEqual({ kind: 'push', href: '/for-you/portfolio' });
  });

  it('maps stock to stock page', () => {
    expect(resolveChipUrl('stock:NVDA')).toEqual({ kind: 'push', href: '/stock/NVDA' });
  });

  it('maps digest:<uuid> to history', () => {
    expect(resolveChipUrl('digest:abc-123')).toEqual({ kind: 'push', href: '/for-you/abc-123' });
  });

  it('returns null for unknown', () => {
    expect(resolveChipUrl('buy:NVDA')).toBeNull();
  });
});
