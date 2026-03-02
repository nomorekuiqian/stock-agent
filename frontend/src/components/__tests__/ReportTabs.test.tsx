import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReportTabs } from '../ReportTabs';

// Mock next/navigation
const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

describe('ReportTabs', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders both tab links', () => {
    mockUsePathname.mockReturnValue('/morning');
    render(<ReportTabs />);
    expect(screen.getByText('早报')).toBeInTheDocument();
    expect(screen.getByText('晚报')).toBeInTheDocument();
  });

  it('highlights morning tab when on /morning', () => {
    mockUsePathname.mockReturnValue('/morning');
    render(<ReportTabs />);
    const morningLink = screen.getByText('早报').closest('a');
    const todayLink = screen.getByText('晚报').closest('a');
    expect(morningLink?.className).toContain('bg-background');
    expect(todayLink?.className).not.toContain('bg-background');
  });

  it('highlights today tab when on /today', () => {
    mockUsePathname.mockReturnValue('/today');
    render(<ReportTabs />);
    const morningLink = screen.getByText('早报').closest('a');
    const todayLink = screen.getByText('晚报').closest('a');
    expect(todayLink?.className).toContain('bg-background');
    expect(morningLink?.className).not.toContain('bg-background');
  });

  it('highlights morning tab on /morning/archive subpath', () => {
    mockUsePathname.mockReturnValue('/morning/archive');
    render(<ReportTabs />);
    const morningLink = screen.getByText('早报').closest('a');
    expect(morningLink?.className).toContain('bg-background');
  });

  it('links point to correct routes', () => {
    mockUsePathname.mockReturnValue('/today');
    render(<ReportTabs />);
    expect(screen.getByText('早报').closest('a')?.getAttribute('href')).toBe('/morning');
    expect(screen.getByText('晚报').closest('a')?.getAttribute('href')).toBe('/today');
  });
});
