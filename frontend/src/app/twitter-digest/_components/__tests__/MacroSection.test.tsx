import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { MacroSection } from '../MacroSection';
import type { MacroThread } from '../types';

function makeThread(overrides: Partial<MacroThread> = {}): MacroThread {
  return {
    title: '美联储 5 月议息预期',
    layer: 'macro',
    primary_kols: ['alice', 'bob'],
    synthesis_zh: '宏观综述: 美联储议息焦点 + 共识 + 分歧。',
    key_points: [
      {
        kol: 'alice',
        point_zh: '关键点 1: 鸽派表态概率 70%',
        direction: 'observation',
        tweet_url: 'https://x.com/alice/status/1',
      },
      {
        kol: 'bob',
        point_zh: '关键点 2: 通胀粘性偏离泰勒规则',
        direction: 'observation',
        tweet_url: 'https://x.com/bob/status/2',
      },
    ],
    ...overrides,
  };
}

describe('MacroSection', () => {
  it('returns null when title and key_points are both empty', () => {
    const thread = makeThread({ title: '', synthesis_zh: '', key_points: [] });
    const { container } = render(<MacroSection thread={thread} index={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title and macro layer label', () => {
    const { container } = render(<MacroSection thread={makeThread()} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('美联储 5 月议息预期');
    expect(text).toContain('宏观');
  });

  it('renders industry layer label correctly', () => {
    const { container } = render(<MacroSection thread={makeThread({ layer: 'industry' })} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('行业');
  });

  it('always renders synthesis', () => {
    const { container } = render(<MacroSection thread={makeThread()} index={0} />);
    expect(container.textContent || '').toContain('宏观综述');
  });

  it('key_points are in collapsed details', () => {
    const { container } = render(<MacroSection thread={makeThread()} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('展开论据');
    expect(text).toContain('关键点 1');
  });

  it('omits details toggle when no key_points', () => {
    const { container } = render(<MacroSection thread={makeThread({ key_points: [] })} index={0} />);
    expect(container.textContent || '').not.toContain('展开论据');
  });

  it('renders KOL count', () => {
    const { container } = render(<MacroSection thread={makeThread()} index={0} />);
    const text = container.textContent || '';
    expect(text).toContain('KOL');
  });

  it('toggles open on summary click', () => {
    const { container } = render(<MacroSection thread={makeThread()} index={0} />);
    const detailsEl = container.querySelector('details') as HTMLDetailsElement;
    expect(detailsEl).not.toBeNull();
    expect(detailsEl.open).toBe(false);
    fireEvent.click(detailsEl.querySelector('summary')!);
    expect(detailsEl.open).toBe(true);
  });

  it('renders index padded to 2 digits', () => {
    const { container } = render(<MacroSection thread={makeThread()} index={2} />);
    expect(container.textContent || '').toContain('03');
  });

  it('section has scroll-target id matching index', () => {
    const { container } = render(<MacroSection thread={makeThread()} index={0} />);
    const section = container.querySelector('section');
    expect(section?.getAttribute('id')).toBe('macro-0');
  });
});
