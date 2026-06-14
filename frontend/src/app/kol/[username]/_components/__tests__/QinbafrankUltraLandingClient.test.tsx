import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QinbafrankUltraLandingClient from "../QinbafrankUltraLandingClient";

const mockPush = vi.fn();
const mockCreateCheckout = vi.fn();
const mockUseAuth = vi.fn();
const mockUseSubscription = vi.fn();

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/lib/product-analytics", () => ({
  trackProductEvent: vi.fn(),
}));

vi.mock("@/lib/paywall-analytics", () => ({
  trackCheckoutOpen: vi.fn(),
  trackPaywallCtaClick: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/contexts/SubscriptionContext", () => ({
  useSubscription: () => mockUseSubscription(),
}));

function setSubscriptionState(overrides: Partial<ReturnType<typeof baseSubscriptionState>> = {}) {
  mockUseSubscription.mockReturnValue({
    ...baseSubscriptionState(),
    ...overrides,
  });
}

function baseSubscriptionState() {
  return {
    createCheckout: mockCreateCheckout,
    isCheckoutLoading: false,
    checkoutError: null,
    portalError: null,
    isUltra: false,
    isLoading: false,
  };
}

describe("QinbafrankUltraLandingClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    mockCreateCheckout.mockResolvedValue(undefined);
    setSubscriptionState();
  });

  it("routes Ultra users to the Qinbafrank Agent from every primary CTA", () => {
    setSubscriptionState({ isUltra: true });

    render(<QinbafrankUltraLandingClient />);

    const ctas = screen.getAllByRole("button", { name: /立即使用/ });
    expect(ctas).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /立即解锁 Ultra/ })).toBeNull();

    fireEvent.click(ctas[0]);

    expect(mockPush).toHaveBeenCalledWith(
      "/research?agent=kol&persona=qinbafrank",
    );
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("keeps the checkout CTA for non-Ultra users", () => {
    render(<QinbafrankUltraLandingClient />);

    const ctas = screen.getAllByRole("button", { name: /立即解锁 Ultra/ });
    expect(ctas).toHaveLength(3);

    fireEvent.click(ctas[0]);

    expect(mockCreateCheckout).toHaveBeenCalledWith(
      "ultra",
      "/kol/qinbafrank?welcome=1",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
