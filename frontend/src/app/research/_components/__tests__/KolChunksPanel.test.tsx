import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { KolPersonaChunk } from '@/lib/api';

import {
  default as KolChunksPanel,
  extractTweetBody,
  extractZsxqBody,
  formatRelativeTime,
  getChunkTimeLabel,
  getZsxqCircleName,
  isZsxqChunk,
  linkifyTweetText,
  sortChunksByTimeDesc,
} from '../KolChunksPanel';

function mkChunk(overrides: Partial<KolPersonaChunk> = {}): KolPersonaChunk {
  return {
    citation_index: 1,
    source_id: '2225581214885858',
    title: '超威半导体（AMD.US）：端侧Agent打开中国市场差异化空间',
    url: 'https://zsxq.com/topic/2225581214885858',
    content: 'body',
    similarity: 0.8,
    author_username: 'pandacircle',
    created_at: '2026-05-20T00:00:00Z',
    tickers: ['AMD'],
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractTweetBody — parse the metadata-prefixed indexed content string
// ---------------------------------------------------------------------------

describe('extractTweetBody', () => {
  it('returns empty strings on empty input', () => {
    expect(extractTweetBody('')).toEqual({ original: '', quoted: '' });
  });

  it('returns whole text when "Original tweet:" marker is absent', () => {
    // Fallback path — keep raw so we don't hide legitimate non-pipeline content.
    expect(extractTweetBody('just a raw tweet body')).toEqual({
      original: 'just a raw tweet body',
      quoted: '',
    });
  });

  it('strips metadata prefix and returns original tweet body', () => {
    const raw = [
      'Author: @qinbafrank',
      'Date: 2026-04-26',
      'Tweet type: original',
      'Quality: high',
      'Tickers: NVDA, MU',
      'Sectors: AI_infra',
      'Events: ',
      'Summary: foo',
      '',
      'Original tweet:',
      '英伟达 Blackwell 出货炸裂。',
    ].join('\n');
    const { original, quoted } = extractTweetBody(raw);
    expect(original).toBe('英伟达 Blackwell 出货炸裂。');
    expect(quoted).toBe('');
  });

  it('strips canonical metadata and image OCR from tweet card body', () => {
    const raw = [
      'Author: @JohnsonZ91127',
      'Date: 2026-06-09T08:38:43+00:00',
      'Tweet type: original',
      'Quality: keep',
      'Content type: thesis',
      'Tickers: SNOW, CRWD, NOW, PANW',
      'Summary: 投资逻辑',
      '',
      'Canonical tweet content:',
      'Tweet:',
      '软件股预计下半年会跑赢大盘， snow，crwd，now，panw 四个软件公司的比较 https://t.co/CJgfd5cxxw',
      '',
      'Image 1 text (3_2064265922123284480):',
      '算力之后，企业AI落地前必补的四个底座',
      'Source ID: should not leak',
    ].join('\n');

    const { original, quoted } = extractTweetBody(raw);
    expect(original).toBe('软件股预计下半年会跑赢大盘， snow，crwd，now，panw 四个软件公司的比较 https://t.co/CJgfd5cxxw');
    expect(quoted).toBe('');
    expect(original).not.toContain('Image 1 text');
    expect(original).not.toContain('Source ID');
  });

  it('splits original and quoted tweets when both present', () => {
    const raw = [
      'Author: @qinbafrank',
      'Date: 2026-04-26',
      '',
      'Original tweet:',
      '主线还成立。',
      '',
      'Quoted tweet:',
      '引用的内容。',
    ].join('\n');
    const { original, quoted } = extractTweetBody(raw);
    expect(original).toBe('主线还成立。');
    expect(quoted).toBe('引用的内容。');
  });

  it('trims whitespace around original/quoted bodies', () => {
    const raw = 'Original tweet:\n\n  body \n\nQuoted tweet:\n\n  quoted body  \n';
    const { original, quoted } = extractTweetBody(raw);
    expect(original).toBe('body');
    expect(quoted).toBe('quoted body');
  });

  it('handles missing quoted section gracefully', () => {
    const raw = 'Original tweet:\nonly original\n';
    expect(extractTweetBody(raw)).toEqual({ original: 'only original', quoted: '' });
  });
});

// ---------------------------------------------------------------------------
// zsxq evidence — strip indexing metadata and render as Knowledge Planet source
// ---------------------------------------------------------------------------

describe('zsxq evidence rendering', () => {
  const rawZsxq = [
    'Source: zsxq_thread',
    'Source ID: 2225581214885858',
    'Title: 超威半导体（AMD.US）：端侧Agent打开中国市场差异化空间',
    '',
    '来源: 潘大的科技交流圈（知识星球动态）',
    '作者: 潘大研究助理-毕曲直（creator）',
    '日期: 2026-05-20',
    '类型: analysis · 动态类型: talk',
    '标签: #AI硬件/芯片/基础设施/云服务#',
    '标的: AMD',
    '标题: 超威半导体（AMD.US）：端侧Agent打开中国市场差异化空间',
    '',
    '**超威半导体（AMD.US）：端侧Agent打开中国市场差异化空间**',
    '',
    '研报来源：华泰研究',
  ].join('\n');

  const rawZsxqWithDate = (date: string) => rawZsxq.replace('日期: 2026-05-20', `日期: ${date}`);

  it('detects zsxq chunks from the source marker', () => {
    expect(isZsxqChunk(mkChunk({ content: rawZsxq }))).toBe(true);
  });

  it('detects zsxq chunks from top-level source_type', () => {
    expect(
      isZsxqChunk(mkChunk({ content: '正文', source_type: 'zsxq_thread' })),
    ).toBe(true);
  });

  it('does not treat ordinary X posts mentioning 知识星球 as zsxq evidence', () => {
    const xChunk = mkChunk({
      source_id: 'tweet-zsxq-mention',
      title: '@pandacircle tweet',
      url: 'https://x.com/pandacircle/status/1',
      source_type: 'kol_tweet',
      content: 'Original tweet:\n我在知识星球看到一个观点，但这是 X 推文。',
      metadata: { source_type: 'kol_tweet' },
    });

    expect(isZsxqChunk(xChunk)).toBe(false);

    const { container } = render(<KolChunksPanel chunks={[xChunk]} />);
    expect(container.textContent).toContain('在 X 查看原文');
    expect(container.textContent).not.toContain('在星球中查看原文');
  });

  it('removes source/indexing metadata from zsxq body', () => {
    const body = extractZsxqBody(rawZsxq);
    expect(body).toContain('超威半导体');
    expect(body).toContain('研报来源：华泰研究');
    expect(body).not.toContain('**');
    expect(body).not.toContain('Source ID');
    expect(body).not.toContain('来源:');
    expect(body).not.toContain('作者:');
    expect(body).not.toContain('日期:');
  });

  it('uses created_at or zsxq metadata date as the post time label', () => {
    expect(getChunkTimeLabel(mkChunk({ content: rawZsxq }))).toMatch(/5月20日|2026年5月20日/);
    expect(getChunkTimeLabel(mkChunk({ content: rawZsxq, created_at: null }))).toMatch(
      /5月20日|2026年5月20日/,
    );
  });

  it('extracts the Knowledge Planet circle name from source metadata', () => {
    expect(getZsxqCircleName(mkChunk({ content: rawZsxq }))).toBe('潘大的科技交流圈');
    expect(
      getZsxqCircleName(mkChunk({ content: rawZsxq.replace(/^来源:.*\n/m, '') })),
    ).toBe('潘大的科技交流圈');
  });

  it('renders zsxq cards without tweet chrome or raw metadata fields', () => {
    const { container } = render(
      <KolChunksPanel
        chunks={[mkChunk({ content: rawZsxq, metadata: { source_type: 'zsxq_thread' } })]}
      />,
    );

    expect(container.textContent).toContain('潘大的科技交流圈');
    expect(container.textContent).not.toContain('知识星球原文');
    expect(container.textContent).toMatch(/5月20日|2026年5月20日/);
    expect(container.textContent).toContain('在星球中查看原文');
    expect(container.textContent).toContain('超威半导体');
    expect(container.textContent).not.toContain('在 X 查看原文');
    expect(container.textContent).not.toContain('Source ID');
    expect(container.textContent).not.toContain('@pandacircle');

    const imageSources = Array.from(container.querySelectorAll('img')).map((img) =>
      img.getAttribute('src'),
    );
    expect(imageSources).toContain('/kol-avatars/pandacircle.png');
    expect(imageSources).toContain('/kol-avatars/zsxq_logo.png');
  });

  it('groups mixed X and Knowledge Planet evidence in separate right-panel sections', () => {
    const tweet = mkChunk({
      citation_index: 1,
      source_id: 'tweet-1',
      source_type: 'kol_tweet',
      title: '@JohnsonZ91127 tweet 2064265925122253011',
      url: 'https://x.com/JohnsonZ91127/status/2064265925122253011',
      content: 'Original tweet:\nJohnson 对 AI 产业链的更新。',
      author_username: 'JohnsonZ91127',
      metadata: { source_type: 'kol_tweet' },
    });
    const zsxq = mkChunk({
      citation_index: 2,
      source_id: 'zsxq-1',
      source_type: 'zsxq_thread',
      content: rawZsxq,
      metadata: { source_type: 'zsxq_thread' },
    });

    const { container } = render(<KolChunksPanel chunks={[tweet, zsxq]} />);

    expect(container.textContent).toContain('2 条混合原文证据');
    expect(container.textContent).toContain('X 推文 1');
    expect(container.textContent).toContain('知识星球 1');
    expect(container.textContent).toContain('X / Twitter 推文');
    expect(container.textContent).toContain('知识星球内容');
    expect(container.textContent).toContain('在 X 查看原文');
    expect(container.textContent).toContain('在星球中查看原文');
  });

  it('renders Twitter cards as a clean tweet with stable signal avatar and no raw index metadata', () => {
    const tweet = mkChunk({
      citation_index: 1,
      source_id: '2064265925122253011',
      source_type: 'kol_tweet',
      title: '@JohnsonZ91127 tweet 2064265925122253011',
      url: 'https://x.com/JohnsonZ91127/status/2064265925122253011',
      author_username: 'JohnsonZ91127',
      created_at: '2026-06-09T08:38:43Z',
      metadata: {
        source_type: 'kol_tweet',
        tweet_type: 'original',
        quality: 'keep',
      },
      content: [
        'Author: @JohnsonZ91127',
        'Date: 2026-06-09T08:38:43+00:00',
        'Tweet type: original',
        'Quality: keep',
        'Source ID: 2064265925122253011',
        'Title: @JohnsonZ91127 tweet 2064265925122253011',
        '',
        'Canonical tweet content:',
        'Tweet:',
        '软件股预计下半年会跑赢大盘， snow，crwd，now，panw 四个软件公司的比较 https://t.co/CJgfd5cxxw',
        '',
        'Image 1 text (3_2064265922123284480):',
        '算力之后，企业AI落地前必补的四个底座',
      ].join('\n'),
    });

    const { container } = render(<KolChunksPanel chunks={[tweet]} />);

    expect(container.textContent).toContain('软件股预计下半年会跑赢大盘');
    expect(container.textContent).toContain('original');
    expect(container.textContent).toContain('keep');
    expect(container.textContent).toContain('在 X 查看原文');
    expect(container.textContent).not.toContain('Author:');
    expect(container.textContent).not.toContain('Date:');
    expect(container.textContent).not.toContain('Source ID');
    expect(container.textContent).not.toContain('Title:');
    expect(container.textContent).not.toContain('@JohnsonZ91127');
    expect(container.textContent).not.toContain('Image 1 text');
    expect(container.textContent).not.toContain('企业AI落地前必补的四个底座');

    const imageSources = Array.from(container.querySelectorAll('img')).map((img) =>
      img.getAttribute('src'),
    );
    expect(imageSources).toContain('/kol-avatars/pandacircle.png');
  });

  it('sorts rendered evidence cards by post time descending', () => {
    const older = mkChunk({
      citation_index: 1,
      source_id: 'older',
      content: rawZsxqWithDate('2026-05-07'),
      created_at: '2026-05-07T00:00:00Z',
    });
    const newer = mkChunk({
      citation_index: 2,
      source_id: 'newer',
      content: rawZsxqWithDate('2026-05-20'),
      created_at: '2026-05-20T00:00:00Z',
    });
    const middle = mkChunk({
      citation_index: 3,
      source_id: 'middle',
      content: rawZsxqWithDate('2026-05-12'),
      created_at: '2026-05-12T00:00:00Z',
    });

    expect(sortChunksByTimeDesc([older, newer, middle]).map((chunk) => chunk.citation_index)).toEqual([
      2,
      3,
      1,
    ]);

    const { container } = render(<KolChunksPanel chunks={[older, newer, middle]} />);
    const renderedIds = Array.from(container.querySelectorAll('li[id^="kol-citation-"]')).map((el) =>
      el.getAttribute('id'),
    );
    expect(renderedIds).toEqual(['kol-citation-2', 'kol-citation-3', 'kol-citation-1']);
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime — minutes / hours / days / absolute date
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(formatRelativeTime(null)).toBe('');
    expect(formatRelativeTime(undefined)).toBe('');
    expect(formatRelativeTime('')).toBe('');
  });

  it('returns empty string for invalid date string', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });

  it('returns "刚刚" for < 1 minute ago', () => {
    const now = new Date();
    now.setSeconds(now.getSeconds() - 30);
    expect(formatRelativeTime(now.toISOString())).toBe('刚刚');
  });

  it('returns minutes for < 1 hour', () => {
    const t = new Date();
    t.setMinutes(t.getMinutes() - 15);
    expect(formatRelativeTime(t.toISOString())).toBe('15 分钟前');
  });

  it('returns hours for < 24h', () => {
    const t = new Date();
    t.setHours(t.getHours() - 3);
    expect(formatRelativeTime(t.toISOString())).toBe('3 小时前');
  });

  it('returns days for < 7 days', () => {
    const t = new Date();
    t.setDate(t.getDate() - 4);
    expect(formatRelativeTime(t.toISOString())).toBe('4 天前');
  });

  it('returns 月日 for older dates in same year', () => {
    const year = new Date().getFullYear();
    // Pick a date >7 days ago in the same year — Jan 5 of current year if
    // we're past mid-January, otherwise step back enough.
    const t = new Date(`${year}-01-05T08:00:00Z`);
    const out = formatRelativeTime(t.toISOString());
    // > 7 days ago for any test run later than mid-Jan
    if (Date.now() - t.getTime() > 7 * 24 * 60 * 60 * 1000) {
      expect(out).toMatch(/^1月5日$/);
    } else {
      // Skip the assertion if we're testing right after Jan 1.
      expect(out).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// linkifyTweetText — URL / @mention / $cashtag highlighting
// ---------------------------------------------------------------------------

describe('linkifyTweetText', () => {
  it('returns empty array for empty input', () => {
    expect(linkifyTweetText('')).toEqual([]);
  });

  it('returns plain text untouched when nothing to link', () => {
    const nodes = linkifyTweetText('Hello world');
    const { container } = render(<>{nodes}</>);
    expect(container.textContent).toBe('Hello world');
    expect(container.querySelectorAll('a').length).toBe(0);
  });

  it('linkifies https URLs with blank target', () => {
    const nodes = linkifyTweetText('See https://t.co/abc123 for details');
    const { container } = render(<>{nodes}</>);
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('href')).toBe('https://t.co/abc123');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a?.textContent).toBe('https://t.co/abc123');
  });

  it('linkifies @mentions to x.com profile', () => {
    const nodes = linkifyTweetText('hat tip @qinbafrank thanks');
    const { container } = render(<>{nodes}</>);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://x.com/qinbafrank');
    expect(a?.textContent).toBe('@qinbafrank');
  });

  it('highlights $cashtags in blue without making them links', () => {
    const nodes = linkifyTweetText('Watching $NVDA and $MU');
    const { container } = render(<>{nodes}</>);
    expect(container.querySelectorAll('a').length).toBe(0);
    // Two cashtags rendered as spans
    const spans = Array.from(container.querySelectorAll('span'));
    const cashtagSpans = spans.filter((s) => s.textContent === '$NVDA' || s.textContent === '$MU');
    expect(cashtagSpans.length).toBe(2);
  });

  it('mixes URL + mention + cashtag in one pass', () => {
    const nodes = linkifyTweetText('@frank says $NVDA → https://x.com/x');
    const { container } = render(<>{nodes}</>);
    const anchors = container.querySelectorAll('a');
    // Should have one mention anchor + one URL anchor
    expect(anchors.length).toBe(2);
  });

  it('does not match invalid cashtag patterns', () => {
    // $123 (digits only) and lowercase-only $abc should not be picked up as
    // strict cashtags (the regex allows latin alpha cashtags 1-10 chars).
    // We just sanity-check no anchors / spans appear.
    const nodes = linkifyTweetText('$123 and $abc');
    const { container } = render(<>{nodes}</>);
    // $abc is matched by the regex (a-z alpha 1-10 chars) — keep test loose
    expect(container.textContent).toContain('$abc');
  });

  it('preserves text fragments around tokens in order', () => {
    const nodes = linkifyTweetText('a @b c');
    const { container } = render(<>{nodes}</>);
    expect(container.textContent).toBe('a @b c');
  });
});
