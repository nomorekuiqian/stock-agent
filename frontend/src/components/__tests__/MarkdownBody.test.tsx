import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MarkdownBody, { splitArrowChainText } from '../MarkdownBody';

describe('splitArrowChainText', () => {
  it('splits common ASCII and unicode arrow chains', () => {
    expect(splitArrowChainText('流动性放松 -> 风险偏好回升 -> 成长股估值修复')).toEqual([
      '流动性放松',
      '风险偏好回升',
      '成长股估值修复',
    ]);
    expect(splitArrowChainText('A → B => C')).toEqual(['A', 'B', 'C']);
  });

  it('returns null for ordinary prose', () => {
    expect(splitArrowChainText('普通回答，没有流程箭头')).toBeNull();
  });
});

describe('MarkdownBody agent variant', () => {
  it('renders arrow chains with visible right arrows', () => {
    render(
      <MarkdownBody variant="agent">
        {'流动性放松 -> 风险偏好回升 -> 成长股估值修复'}
      </MarkdownBody>,
    );

    expect(screen.getByText('流动性放松')).toBeInTheDocument();
    expect(screen.getByText('风险偏好回升')).toBeInTheDocument();
    expect(screen.getByText('成长股估值修复')).toBeInTheDocument();
    expect(screen.getAllByText('→')).toHaveLength(2);
  });

  it('keeps a visible leading greater-than marker for agent blockquotes', () => {
    const { container } = render(
      <MarkdownBody variant="agent">
        {'> EPS 上修 -> 估值修复'}
      </MarkdownBody>,
    );

    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeInTheDocument();
    expect(blockquote?.textContent).toContain('>');
    expect(blockquote?.textContent).toContain('EPS 上修');
    expect(blockquote?.textContent).toContain('→');
  });

  it('keeps default markdown blockquotes unchanged outside agent mode', () => {
    const { container } = render(
      <MarkdownBody>
        {'> 这是一段引用'}
      </MarkdownBody>,
    );

    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeInTheDocument();
    expect(blockquote?.textContent?.trim()).toBe('这是一段引用');
  });
});
