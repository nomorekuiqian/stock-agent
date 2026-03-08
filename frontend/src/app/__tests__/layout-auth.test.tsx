import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('next/font/google', () => ({
  Instrument_Serif: () => ({ variable: 'font-instrument-serif' }),
  DM_Sans: () => ({ variable: 'font-dm-sans' }),
  JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono' }),
}));

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: () => null,
}));

describe('RootLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Providers without initialState prop', async () => {
    const layoutModule = await import('../layout');
    const element = layoutModule.default({ children: <div>content</div> });

    const htmlNode = element as ReactElement<{ children: ReactElement | ReactElement[] }>;
    const htmlChildren = Array.isArray(htmlNode.props.children)
      ? htmlNode.props.children
      : [htmlNode.props.children];
    const bodyNode = htmlChildren[1] as ReactElement<{ children: ReactElement | ReactElement[] }>;
    const bodyChildren = Array.isArray(bodyNode.props.children)
      ? bodyNode.props.children
      : [bodyNode.props.children];
    const providersNode = bodyChildren[0] as ReactElement<Record<string, unknown>>;

    // Providers should not receive initialState anymore
    expect(providersNode.props.initialState).toBeUndefined();
  });
});
