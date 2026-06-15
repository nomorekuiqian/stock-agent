import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QinbafrankMaxLandingClient from "../QinbafrankMaxLandingClient";

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

function baseSubscriptionState() {
  return {
    createCheckout: mockCreateCheckout,
    isCheckoutLoading: false,
    checkoutError: null,
    portalError: null,
    isMax: false,
    isLoading: false,
  };
}

function setSubscriptionState(
  overrides: Partial<ReturnType<typeof baseSubscriptionState>> = {},
) {
  mockUseSubscription.mockReturnValue({
    ...baseSubscriptionState(),
    ...overrides,
  });
}

describe("QinbafrankMaxLandingClient", () => {
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

  it("routes Max users to the Qinbafrank Agent from every primary CTA", () => {
    setSubscriptionState({ isMax: true });

    render(<QinbafrankMaxLandingClient />);

    const ctas = screen.getAllByRole("button", { name: /立即使用/ });
    expect(ctas).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /立即解锁 Max/ })).toBeNull();

    fireEvent.click(ctas[0]);

    expect(mockPush).toHaveBeenCalledWith(
      "/research?agent=kol&persona=qinbafrank",
    );
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("keeps the checkout CTA for non-Max users", () => {
    render(<QinbafrankMaxLandingClient />);

    const ctas = screen.getAllByRole("button", { name: /立即解锁 Max/ });
    expect(ctas).toHaveLength(3);

    fireEvent.click(ctas[0]);

    expect(mockCreateCheckout).toHaveBeenCalledWith(
      "max",
      "/kol/qinbafrank?welcome=1",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
