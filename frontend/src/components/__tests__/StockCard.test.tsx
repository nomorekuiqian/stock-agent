import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StockCard from '../StockCard';

// ---------------------------------------------------------------------------
// Mock next/image
// ---------------------------------------------------------------------------
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src as string} alt={alt as string} {...rest} />;
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('StockCard', () => {
  it('renders symbol and display name', () => {
    render(
      <StockCard symbol="AAPL" displayName="Apple Inc." index={0} />
    );

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('Apple Inc.')).toBeTruthy();
  });

  it('renders price and positive change in green', () => {
    render(
      <StockCard
        symbol="AAPL"
        displayName="Apple Inc."
        index={0}
        quote={{ symbol: 'AAPL', price: 195.50, daily_change: 2.35 }}
      />
    );

    expect(screen.getByText('$195.50')).toBeTruthy();
    const changeEl = screen.getByText('+2.35%');
    expect(changeEl.className).toContain('emerald');
  });

  it('renders local currency for non-US market symbols', () => {
    render(
      <StockCard
        symbol="7203.T"
        displayName="Toyota Motor"
        index={0}
        quote={{ symbol: '7203.T', price: 3125, daily_change: 1.1 }}
      />
    );

    expect(screen.getByText('JPY 3,125')).toBeTruthy();
  });

  it('renders negative change in red', () => {
    render(
      <StockCard
        symbol="TSLA"
        displayName="Tesla Inc."
        index={0}
        quote={{ symbol: 'TSLA', price: 245.00, daily_change: -3.21 }}
      />
    );

    const changeEl = screen.getByText('-3.21%');
    expect(changeEl.className).toContain('red');
  });

  it('shows "--" when no quote data', () => {
    render(
      <StockCard symbol="AAPL" displayName="Apple Inc." index={0} />
    );

    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(1);
  });

  it('shows loading spinner when isLoading and no quote', () => {
    const { container } = render(
      <StockCard symbol="AAPL" displayName="Apple Inc." index={0} isLoading={true} />
    );

    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('requires double-click for remove confirmation', () => {
    const onRemove = vi.fn();
    render(
      <StockCard
        symbol="AAPL"
        displayName="Apple Inc."
        index={0}
        onRemove={onRemove}
      />
    );

    const removeBtn = screen.getByLabelText('移除 AAPL');

    // First click - shows confirmation
    fireEvent.click(removeBtn);
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText('确认?')).toBeTruthy();

    // Second click - actually removes
    const confirmBtn = screen.getByLabelText('确认移除 AAPL');
    fireEvent.click(confirmBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
