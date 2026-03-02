import { describe, it, expect } from 'vitest';
import { queryKeys } from '../queries/query-keys';

describe('queryKeys.morningReports', () => {
  it('has correct base key', () => {
    expect(queryKeys.morningReports.all).toEqual(['morning-reports']);
  });

  it('generates list key with limit and offset', () => {
    const key = queryKeys.morningReports.list(10, 0);
    expect(key).toEqual(['morning-reports', 'list', 10, 0]);
  });

  it('generates latest key', () => {
    expect(queryKeys.morningReports.latest()).toEqual(['morning-reports', 'latest']);
  });

  it('generates byId key', () => {
    expect(queryKeys.morningReports.byId('abc-123')).toEqual(['morning-reports', 'abc-123']);
  });

  it('generates byDate key', () => {
    expect(queryKeys.morningReports.byDate('2026-02-28')).toEqual(['morning-reports', 'date', '2026-02-28']);
  });
});

describe('queryKeys.screener', () => {
  it('has correct base key', () => {
    expect(queryKeys.screener.all).toEqual(['screener']);
  });

  it('generates filter key', () => {
    expect(queryKeys.screener.filter('value-picks')).toEqual(['screener', 'filter', 'value-picks']);
  });

  it('generates sectors key', () => {
    expect(queryKeys.screener.sectors()).toEqual(['screener', 'sectors']);
  });

  it('generates status key', () => {
    expect(queryKeys.screener.status()).toEqual(['screener', 'status']);
  });
});
