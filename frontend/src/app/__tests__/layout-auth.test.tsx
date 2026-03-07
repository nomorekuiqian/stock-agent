import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

const { authSpy } = vi.hoisted(() => ({
  authSpy: vi.fn(),
}));

vi.mock('@insforge/nextjs/server', () => ({
  auth: authSpy,
}));

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

describe('RootLayout auth wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls auth() and passes returned state to Providers.initialState', async () => {
    const initialState = {
      userId: 'user-123',
      token: 'token-123',
      user: {
        id: 'user-123',
        email: 'user@example.com',
        profile: { name: 'Tester' },
      },
    };
    authSpy.mockResolvedValue(initialState);

    const layoutModule = await import('../layout');
    const element = await layoutModule.default({ children: <div>content</div> });

    expect(authSpy).toHaveBeenCalledTimes(1);

    const htmlNode = element as ReactElement<{ children: ReactElement | ReactElement[] }>;
    const htmlChildren = Array.isArray(htmlNode.props.children)
      ? htmlNode.props.children
      : [htmlNode.props.children];
    const bodyNode = htmlChildren[1] as ReactElement<{ children: ReactElement | ReactElement[] }>;
    const bodyChildren = Array.isArray(bodyNode.props.children)
      ? bodyNode.props.children
      : [bodyNode.props.children];
    const providersNode = bodyChildren[0] as ReactElement<{ initialState: unknown }>;

    expect(providersNode.props.initialState).toEqual(initialState);
  });
});
