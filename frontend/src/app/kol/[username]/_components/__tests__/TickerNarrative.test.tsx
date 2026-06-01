import { describe, it, expect } from 'vitest';
import { afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import TickerNarrative from '../TickerNarrative';
import type { KolTickerSummary } from '@/lib/api';

function makeSummary(overrides: Partial<KolTickerSummary> = {}): KolTickerSummary {
  return {
    stance: 'bull',
    stance_label: '看多 · 核心仓',
    position: 'AI 时代综合国防承包商',
    thesis: '从国防预算分得更多份额',
    key_logic: '从国防预算分得更多份额的核心逻辑',
    core_questions: [],
    bull_conditions: ['合同延展', '政府支出扩张'],
    bear_triggers: ['估值过高'],
    veto: ['核心客户流失'],
    falsifiers: ['Rule of 40 跌破 40'],
    signals_watched: ['季度合同公告', 'AIP 渗透率'],
    misreadings: [],
    coverage: 'high',
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('TickerNarrative', () => {
  it('renders the section header', () => {
    render(<TickerNarrative summary={makeSummary()} />);
    expect(screen.getByText('观点框架')).toBeInTheDocument();
  });

  it('renders 01 定位 with position, thesis and key_logic', () => {
    render(<TickerNarrative summary={makeSummary()} />);
    expect(screen.getByText('01 · 在他心目中的定位')).toBeInTheDocument();
    expect(screen.getByText('AI 时代综合国防承包商')).toBeInTheDocument();
    expect(screen.getByText('从国防预算分得更多份额')).toBeInTheDocument();
  });

  it('combines 机会 (green) and 风险 (red) into one 02 block', () => {
    render(<TickerNarrative summary={makeSummary()} />);
    expect(screen.getByText('02 · 机会 / 风险')).toBeInTheDocument();
    expect(screen.getByText('机会')).toBeInTheDocument();
    expect(screen.getByText('风险')).toBeInTheDocument();
    // joined opportunity text
    expect(screen.getByText(/合同延展.*政府支出扩张/)).toBeInTheDocument();
    // risk bucket: bear_triggers + veto + falsifiers joined
    expect(screen.getByText(/估值过高.*核心客户流失.*Rule of 40 跌破 40/)).toBeInTheDocument();
  });

  it('shows em-dash placeholder when one side of 机会/风险 is empty', () => {
    render(<TickerNarrative summary={makeSummary({ bull_conditions: [] })} />);
    // 机会 column should show '—', 风险 column still renders text
    const opps = screen.getAllByText('—');
    expect(opps.length).toBeGreaterThan(0);
  });

  it('renders 03 需要关注的数据 with prose when <=4 items', () => {
    render(<TickerNarrative summary={makeSummary({ signals_watched: ['a', 'b'] })} />);
    expect(screen.getByText('03 · 需要关注的数据')).toBeInTheDocument();
    expect(screen.getByText(/a；b。/)).toBeInTheDocument();
  });

  it('renders 03 as a bullet list when >4 items', () => {
    render(<TickerNarrative summary={makeSummary({ signals_watched: ['a', 'b', 'c', 'd', 'e'] })} />);
    expect(screen.getByText('03 · 需要关注的数据')).toBeInTheDocument();
    // Each item rendered as a list element
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('e')).toBeInTheDocument();
  });

  it('returns null when summary has no usable content', () => {
    const { container } = render(
      <TickerNarrative
        summary={makeSummary({
          position: '',
          thesis: '',
          key_logic: '',
          bull_conditions: [],
          bear_triggers: [],
          veto: [],
          falsifiers: [],
          signals_watched: [],
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
