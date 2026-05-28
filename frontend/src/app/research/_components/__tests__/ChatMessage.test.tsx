import { describe, it, expect } from 'vitest';
import type { KolPersonaChunk } from '@/lib/api';

import { annotateCitations } from '../ChatMessage';

function mkChunk(overrides: Partial<KolPersonaChunk> = {}): KolPersonaChunk {
  return {
    citation_index: 1,
    source_id: 'tw1',
    title: null,
    url: 'https://x.com/q/status/1',
    content: 'tweet body',
    similarity: 0.5,
    author_username: 'qinbafrank',
    created_at: '2026-04-26T00:00:00Z',
    tickers: [],
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// annotateCitations — turn [#N] markers into clickable markdown links
// ---------------------------------------------------------------------------

describe('annotateCitations', () => {
  it('returns text unchanged when no [#N] markers and citations empty', () => {
    expect(annotateCitations('plain text', [])).toBe('plain text');
    expect(annotateCitations('plain text', undefined)).toBe('plain text');
  });

  it('strips all [#N] when no citations provided', () => {
    // Avoids "broken" plain-text [#N] residue in the rendered answer.
    expect(annotateCitations('Foo [#3] bar [#5]', [])).toBe('Foo bar');
    expect(annotateCitations('See [#1].', undefined)).toBe('See.');
  });

  it('converts [#N] to escaped markdown link when chunk has url', () => {
    const out = annotateCitations(
      'See [#1] for details.',
      [mkChunk({ citation_index: 1, url: 'https://x.com/q/status/1' })],
    );
    expect(out).toContain('[\\[#1\\]](https://x.com/q/status/1)');
  });

  it('strips [#N] when matching chunk has no url', () => {
    const out = annotateCitations(
      'See [#1] for details.',
      [mkChunk({ citation_index: 1, url: null })],
    );
    expect(out).toBe('See for details.');
  });

  it('strips [#N] when no matching chunk in citations array', () => {
    const out = annotateCitations(
      'Mentions [#11] and [#44]', // model invented these indices
      [mkChunk({ citation_index: 1 })], // only #1 exists
    );
    expect(out).toBe('Mentions and');
  });

  it('mixes valid and invalid refs correctly', () => {
    const out = annotateCitations(
      'A [#1] B [#9] C [#2]',
      [
        mkChunk({ citation_index: 1, url: 'https://x.com/q/1' }),
        mkChunk({ citation_index: 2, url: 'https://x.com/q/2' }),
      ],
    );
    // [#9] should be stripped, [#1] / [#2] kept
    expect(out).toContain('[\\[#1\\]](https://x.com/q/1)');
    expect(out).toContain('[\\[#2\\]](https://x.com/q/2)');
    expect(out).not.toContain('[#9]');
  });

  it('preserves leading whitespace when keeping a ref', () => {
    const out = annotateCitations(
      'foo [#1] bar',
      [mkChunk({ citation_index: 1, url: 'https://x.com/q/1' })],
    );
    // Leading space captured by regex, then re-added in replacement.
    expect(out).toContain('foo [\\[#1\\]]');
  });

  it('handles back-to-back markers without leaving double whitespace', () => {
    // Even though the LLM shouldn't write [#1][#2], be robust to it.
    const out = annotateCitations(
      'cite [#1][#2] here',
      [
        mkChunk({ citation_index: 1, url: 'https://x.com/q/1' }),
        mkChunk({ citation_index: 2, url: 'https://x.com/q/2' }),
      ],
    );
    expect(out).toContain('[\\[#1\\]](https://x.com/q/1)');
    expect(out).toContain('[\\[#2\\]](https://x.com/q/2)');
  });

  it('does not affect markdown content otherwise', () => {
    const md = '## heading\n\n- bullet\n- another';
    expect(annotateCitations(md, undefined)).toBe(md);
  });
});
