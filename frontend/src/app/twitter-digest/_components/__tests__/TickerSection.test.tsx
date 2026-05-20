import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { TickerSection } from '../TickerSection';
import type { TickerThesis } from '../types';

function makeThesis(overrides: Partial<TickerThesis> = {}): TickerThesis {
  return {
    ticker: 'NVDA',
    primary_kols: ['alice', 'bob'],
    tweet_count: 4,
    synthesis_zh: '英伟达综述: 焦点是 AI capex,但有估值担忧。',
    buy_arguments: [
      {
        kol: 'alice',
        point_zh: '看多论据:Q1 营收 +60% 至 $39B',
        direction: 'buy',
        tweet_url: 'https://x.com/alice/status/1',
      },
    ],
    sell_arguments: [
      {
        kol: 'bob',
        point_zh: '看空论据:估值 PEG 2.5 远超历史中枢',
        direction: 'sell',
        tweet_url: 'https://x.com/bob/status/2',
      },
    ],
    observation_arguments: [],
    ...overrides,
  };
}

describe('TickerSection', () => {
  it('renders ticker, KOL count, tweet count, synthesis', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('NVDA');
    expect(text).toContain('英伟达综述');
    expect(text).toContain('KOL');
    expect(text).toContain('推');
  });

  it('renders argument bodies in collapsed details', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('看多论据');
    expect(text).toContain('看空论据');
  });

  it('shows expand-arguments toggle', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('展开论据');
  });

  it('shows tone summary in toggle', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('买');
    expect(text).toContain('卖');
  });

  it('omits empty argument lanes', () => {
    const thesis = makeThesis({ buy_arguments: [], sell_arguments: [] });
    const { container } = render(<TickerSection thesis={thesis} index={0} />);
    const text = container.textContent || '';
    expect(text).not.toContain('买入逻辑');
    expect(text).not.toContain('卖出 / 风险逻辑');
  });

  it('returns null when all argument lanes empty', () => {
    const thesis = makeThesis({
      buy_arguments: [],
      sell_arguments: [],
      observation_arguments: [],
    });
    const { container } = render(<TickerSection thesis={thesis} index={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders KOL handles with @ prefix', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('@alice');
    expect(text).toContain('@bob');
  });

  it('renders tweet links with safe URLs', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={0} />);
    const links = container.querySelectorAll('a[href*="status"]');
    expect(links.length).toBeGreaterThan(0);
  });

  it('toggles open on summary click', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={0} />);
    const detailsEl = container.querySelector('details') as HTMLDetailsElement;
    expect(detailsEl).not.toBeNull();
    expect(detailsEl.open).toBe(false);
    const summary = detailsEl.querySelector('summary')!;
    fireEvent.click(summary);
    expect(detailsEl.open).toBe(true);
  });

  it('renders index padded to 2 digits', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={4} />);
    const text = container.textContent || '';
    expect(text).toContain('05');
  });

  it('section has scroll-target id matching ticker', () => {
    const { container } = render(<TickerSection thesis={makeThesis()} index={0} />);
    const section = container.querySelector('section');
    expect(section?.getAttribute('id')).toBe('ticker-NVDA');
  });
});
