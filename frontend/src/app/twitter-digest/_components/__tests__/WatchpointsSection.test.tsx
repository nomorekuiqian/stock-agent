import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { WatchpointsSection } from '../WatchpointsSection';
import type { WatchpointItem } from '../types';

function makeWatchpoint(overrides: Partial<WatchpointItem> = {}): WatchpointItem {
  return {
    title: 'MU Q3 财报',
    date_hint: '6/24',
    why_it_matters_zh: '美光财报后看 2027+ 增长指引,可能打破周期股估值。',
    related_tickers: ['MU'],
    kols_watching: ['alice', 'bob'],
    evidence: [
      {
        kol: 'alice',
        point_zh: 'PEG 0.1 远低于同业,期待财报上修指引',
        direction: 'observation',
        tweet_url: 'https://x.com/alice/status/1',
      },
      {
        kol: 'bob',
        point_zh: '期权 IV 创两年新高,看涨情绪极浓',
        direction: 'observation',
        tweet_url: 'https://x.com/bob/status/2',
      },
    ],
    ...overrides,
  };
}

describe('WatchpointsSection', () => {
  it('returns null when watchpoints empty', () => {
    const { container } = render(<WatchpointsSection watchpoints={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders section title', () => {
    const { container } = render(<WatchpointsSection watchpoints={[makeWatchpoint()]} />);
    expect(container.textContent || '').toContain('短期未来的注意点');
  });

  it('renders watchpoint title and why_it_matters', () => {
    const { container } = render(<WatchpointsSection watchpoints={[makeWatchpoint()]} />);
    const text = container.textContent || '';
    expect(text).toContain('MU Q3 财报');
    expect(text).toContain('美光财报后');
  });

  it('renders date chip when date_hint is present', () => {
    const { container } = render(<WatchpointsSection watchpoints={[makeWatchpoint()]} />);
    expect(container.textContent || '').toContain('6/24');
  });

  it('omits date chip when date_hint empty', () => {
    const { container } = render(
      <WatchpointsSection watchpoints={[makeWatchpoint({ date_hint: '' })]} />
    );
    expect(container.textContent || '').not.toContain('6/24');
  });

  it('renders related ticker chips with anchor', () => {
    const { container } = render(<WatchpointsSection watchpoints={[makeWatchpoint()]} />);
    const tickerAnchor = container.querySelector('a[href="#ticker-MU"]');
    expect(tickerAnchor).not.toBeNull();
  });

  it('renders KOL watching count summary', () => {
    const { container } = render(<WatchpointsSection watchpoints={[makeWatchpoint()]} />);
    expect(container.textContent || '').toContain('KOL 在关注');
  });

  it('renders evidence in collapsed details', () => {
    const { container } = render(<WatchpointsSection watchpoints={[makeWatchpoint()]} />);
    const text = container.textContent || '';
    expect(text).toContain('展开 KOL 原推');
    expect(text).toContain('PEG 0.1 远低于同业');
  });

  it('omits evidence toggle when no evidence', () => {
    const { container } = render(
      <WatchpointsSection watchpoints={[makeWatchpoint({ evidence: [] })]} />
    );
    expect(container.textContent || '').not.toContain('展开 KOL 原推');
  });

  it('renders evidence kol handles', () => {
    const { container } = render(<WatchpointsSection watchpoints={[makeWatchpoint()]} />);
    const text = container.textContent || '';
    expect(text).toContain('@alice');
    expect(text).toContain('@bob');
  });

  it('shows count of watchpoints in header', () => {
    const wps = [makeWatchpoint(), makeWatchpoint({ title: 'Other' })];
    const { container } = render(<WatchpointsSection watchpoints={wps} />);
    expect(container.textContent || '').toContain('个事件');
  });
});
