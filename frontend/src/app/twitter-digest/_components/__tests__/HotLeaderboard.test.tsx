import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { HotLeaderboard } from '../HotLeaderboard';
import type { TickerThesis } from '../types';

function makeThesis(ticker: string, kols: number, tweets: number): TickerThesis {
  return {
    ticker,
    primary_kols: Array.from({ length: kols }, (_, i) => `u${i}`),
    tweet_count: tweets,
    synthesis_zh: '',
    buy_arguments: [],
    sell_arguments: [],
    observation_arguments: [],
  };
}

describe('HotLeaderboard', () => {
  it('renders nothing when theses list is empty', () => {
    const { container } = render(<HotLeaderboard theses={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one row per thesis', () => {
    const theses = [
      makeThesis('NVDA', 5, 5),
      makeThesis('MU', 4, 4),
      makeThesis('AMZN', 3, 3),
    ];
    const { container } = render(<HotLeaderboard theses={theses} />);
    const text = container.textContent || '';
    expect(text).toContain('NVDA');
    expect(text).toContain('MU');
    expect(text).toContain('AMZN');
  });

  it('sorts by KOL count then tweet count desc', () => {
    const theses = [
      makeThesis('LOW', 2, 2),
      makeThesis('HIGH', 5, 5),
      makeThesis('MID', 3, 3),
    ];
    const { container } = render(<HotLeaderboard theses={theses} />);
    const links = container.querySelectorAll('a[href^="#ticker-"]');
    const order = Array.from(links).map(a => a.getAttribute('href'));
    expect(order[0]).toBe('#ticker-HIGH');
    expect(order[1]).toBe('#ticker-MID');
    expect(order[2]).toBe('#ticker-LOW');
  });

  it('chip anchors to ticker section', () => {
    const { container } = render(<HotLeaderboard theses={[makeThesis('NVDA', 5, 5)]} />);
    const link = container.querySelector('a[href^="#ticker-"]');
    expect(link?.getAttribute('href')).toBe('#ticker-NVDA');
  });

  it('renders TOP N count', () => {
    const theses = [makeThesis('A', 5, 5), makeThesis('B', 4, 4)];
    const { container } = render(<HotLeaderboard theses={theses} />);
    expect(container.textContent || '').toContain('TOP');
  });

  it('renders rank numbers padded to 2 digits', () => {
    const theses = [makeThesis('A', 5, 5)];
    const { container } = render(<HotLeaderboard theses={theses} />);
    expect(container.textContent || '').toContain('01');
  });

  it('section has scroll-target id', () => {
    const { container } = render(<HotLeaderboard theses={[makeThesis('A', 5, 5)]} />);
    const section = container.querySelector('section');
    expect(section?.getAttribute('id')).toBe('hot-leaderboard');
  });
});
