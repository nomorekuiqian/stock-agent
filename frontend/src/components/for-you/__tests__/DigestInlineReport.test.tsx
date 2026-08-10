import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DigestInlineReport from '../DigestInlineReport';
import type { DigestResponse } from '@/lib/api';

afterEach(() => {
  cleanup();
});

const baseDigest: DigestResponse = {
  success: true,
  timestamp: '2026-04-25T00:00:00Z',
  symbols_used: ['NVDA'],
  greeting: '你好',
  one_line_summary: '组合稳健',
  stocks: [],
  news: { headlines: [], briefs: [] },
  events: [],
  summary: { content: '第一段内容。\n\n第二段内容。' },
  from_cache: false,
};

describe('DigestInlineReport variant gating', () => {
  it('V1 renders legacy 总结 heading at the bottom', () => {
    render(<DigestInlineReport digest={baseDigest} variant="v1" />);
    expect(screen.getByText('总结')).toBeInTheDocument();
    expect(screen.queryByText('给你的复盘笔记')).not.toBeInTheDocument();
  });

  it('V2 renders new 给你的复盘笔记 heading', () => {
    render(<DigestInlineReport digest={baseDigest} variant="v2" />);
    expect(screen.getByText('给你的复盘笔记')).toBeInTheDocument();
    expect(screen.queryByText('总结')).not.toBeInTheDocument();
  });

  it('defaults to V1 when variant prop omitted', () => {
    render(<DigestInlineReport digest={baseDigest} />);
    expect(screen.getByText('总结')).toBeInTheDocument();
  });

  it('does not expose the retired AI monitor from the digest', () => {
    render(<DigestInlineReport digest={baseDigest} />);

    expect(screen.queryByText('AI 监控台')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /查看详细监控/ })).not.toBeInTheDocument();
  });
});
