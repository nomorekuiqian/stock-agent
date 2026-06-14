import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import ChatPanel from '../ChatPanel';

const mockUseSubscription = vi.fn();

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
}));

function mockSubscription(isUltra: boolean) {
  mockUseSubscription.mockReturnValue({
    isPro: isUltra,
    isMax: isUltra,
    isUltra,
    isLoading: false,
    isCheckoutLoading: false,
    checkoutError: null,
    portalError: null,
    plan: isUltra ? 'ultra' : 'pro',
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

describe('ChatPanel KOL Ultra CTA', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockUseSubscription.mockReset();
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = vi.fn();
    }
  });

  it('hides KOL usage limit banner for Ultra users', () => {
    mockSubscription(true);

    renderKolPanel();

    expect(screen.queryByText(/@qinbafrank 博主 Agent/)).toBeNull();
    expect(screen.queryByText(/非 Ultra 账号仅可体验有限试问/)).toBeNull();
    expect(screen.queryByRole('button', { name: /解锁 Ultra/ })).toBeNull();
  });

  it('keeps checkout CTA visible for non-Ultra users', () => {
    mockSubscription(false);

    renderKolPanel();

    expect(screen.getByRole('button', { name: /解锁 Ultra/ })).toBeTruthy();
    expect(screen.getByText(/非 Ultra 账号仅可体验有限试问/)).toBeTruthy();
  });
});
