import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import ChatPanel from '../ChatPanel';

const mockUseSubscription = vi.fn();

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
}));

function mockSubscription(isMax: boolean) {
  mockUseSubscription.mockReturnValue({
    isPro: isMax,
    isMax,
    isLoading: false,
    isCheckoutLoading: false,
    checkoutError: null,
    portalError: null,
    plan: isMax ? 'max' : 'pro',
    status: 'active',
    currentPeriodEnd: null,
    accessExpiresAt: null,
    cancelAtPeriodEnd: false,
    cancelAt: null,
    canceledAt: null,
    createCheckout: vi.fn(),
    openBillingPortal: vi.fn(),
    refreshSubscription: vi.fn(),
  });
}

function renderKolPanel() {
  return render(
    <ChatPanel
      messages={[]}
      onSend={vi.fn()}
      loading={false}
      personaUsername="qinbafrank"
    />,
  );
}

describe('ChatPanel KOL Max CTA', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockUseSubscription.mockReset();
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = vi.fn();
    }
  });

  it('hides KOL usage limit banner for Max users', () => {
    mockSubscription(true);

    renderKolPanel();

    expect(screen.queryByText(/@qinbafrank 博主 Agent/)).toBeNull();
    expect(screen.queryByText(/非 Max 账号使用每日免费额度/)).toBeNull();
    expect(screen.queryByRole('button', { name: /升级 Max/ })).toBeNull();
  });

  it('keeps checkout CTA visible for non-Max users', () => {
    mockSubscription(false);

    renderKolPanel();

    expect(screen.getByRole('button', { name: /升级 Max/ })).toBeTruthy();
    expect(screen.getByText(/非 Max 账号使用每日免费额度/)).toBeTruthy();
  });
});
