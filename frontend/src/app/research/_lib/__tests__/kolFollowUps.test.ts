import { describe, expect, it } from 'vitest';

import { buildKolFollowUpOptions } from '../kolFollowUps';

describe('buildKolFollowUpOptions', () => {
  it('generates ticker-specific research path chips', () => {
    const options = buildKolFollowUpOptions({
      userMessage: '按 Frank 框架分析 NVDA',
      assistantMessage: 'NVDA 需要看算力需求、客户 capex 和数据中心增长。',
      chunks: [{ tickers: ['NVDA'] }],
    });

    expect(options).toEqual([
      '查 NVDA 历史观点',
      'NVDA 的打脸条件',
      '用最新数据验证 NVDA',
      '放回产业链对比',
    ]);
  });

  it('uses market risk chips for macro or broad market answers', () => {
    const options = buildKolFollowUpOptions({
      userMessage: '按 qinbafrank 的框架看最近美股市场',
      assistantMessage: '当前更像估值压力和流动性变量共同影响。',
    });

    expect(options).toEqual([
      '判断杀估值还是杀逻辑',
      '列出关键打脸信号',
      '看对 AI 主线影响',
      '生成后续观察清单',
    ]);
  });

  it('falls back to broader framework when direct coverage is thin', () => {
    const options = buildKolFollowUpOptions({
      userMessage: '怎么看一家没覆盖的小公司',
      assistantMessage: '没有检索到直接讨论，证据不足。',
    });

    expect(options[0]).toBe('扩大到上级框架');
    expect(options).toContain('列出打脸条件');
  });
});
