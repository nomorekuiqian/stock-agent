import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { TrustBanner } from '../TrustBanner';

describe('TrustBanner', () => {
  it('renders editorial banner with all curation stats', () => {
    const { container } = render(
      <TrustBanner trackedKolCount={254} inputTweetCount={322} windowHours={24} />
    );
    const text = container.textContent || '';
    expect(text).toContain('严选日报');
    expect(text).toContain('254');
    expect(text).toContain('322');
    expect(text).toContain('24');
  });

  it('uses Chinese editorial copy', () => {
    const { container } = render(
      <TrustBanner trackedKolCount={1} inputTweetCount={1} windowHours={1} />
    );
    const text = container.textContent || '';
    expect(text).toContain('精选追踪');
    expect(text).toContain('经五特征质量门筛选');
  });

  it('section is labeled for accessibility', () => {
    const { container } = render(
      <TrustBanner trackedKolCount={1} inputTweetCount={1} windowHours={1} />
    );
    const section = container.querySelector('section[aria-label]');
    expect(section).not.toBeNull();
  });
});
