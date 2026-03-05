'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { api, StockQuote } from '@/lib/api';

interface SectorPreviewProps {
  sectorId: string;
  sectorName: string;
  description: string;
  symbols: string[];
  onRefresh?: () => void;
}

export function SectorPreview({
  sectorId,
  sectorName,
  description,
  symbols,
  onRefresh,
}: SectorPreviewProps) {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchQuotes() {
      if (symbols.length === 0) return;

      setLoading(true);
      setError(null);
      try {
        const response = await api.getStockQuotes(symbols);
        if (response.success) {
          // Sort by absolute change for visual interest
          const sorted = [...response.quotes].sort(
            (a, b) => Math.abs(b.daily_change) - Math.abs(a.daily_change)
          );
          setQuotes(sorted);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load quotes');
      } finally {
        setLoading(false);
      }
    }

    fetchQuotes();
  }, [symbols, sectorId]);

  const handleRefresh = async () => {
    if (symbols.length === 0) return;

    setLoading(true);
    try {
      const response = await api.getStockQuotes(symbols);
      if (response.success) {
        const sorted = [...response.quotes].sort(
          (a, b) => Math.abs(b.daily_change) - Math.abs(a.daily_change)
        );
        setQuotes(sorted);
      }
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (change: number) => {
    if (change > 0.1) return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    if (change < -0.1) return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-emerald-400';
    if (change < 0) return 'text-red-400';
    return 'text-muted-foreground';
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  const formatPrice = (price: number) => {
    return price >= 1000 ? price.toFixed(0) : price.toFixed(2);
  };

  // Calculate sector average
  const avgChange = quotes.length > 0
    ? quotes.reduce((sum, q) => sum + q.daily_change, 0) / quotes.length
    : 0;

  return (
    <div className="terminal-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-medium text-foreground">{sectorName}</h3>
            <span className="text-sm text-muted-foreground">
              {symbols.length}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl line-clamp-1">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Sector Average Badge */}
          {quotes.length > 0 && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              avgChange >= 0
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}>
              <span className="text-xs text-muted-foreground"></span>
              <span className={`text-sm font-data font-medium ${getChangeColor(avgChange)}`}>
                {formatChange(avgChange)}
              </span>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 rounded-lg bg-card border border-border/50 text-muted-foreground hover:text-foreground hover:border-emerald-500/30 transition-all disabled:opacity-50"
            title="Refresh quotes"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stock Grid */}
      {error ? (
        <div className="text-sm text-red-400 py-4">{error}</div>
      ) : loading && quotes.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {symbols.slice(0, 12).map((symbol) => (
            <div
              key={symbol}
              className="p-3 rounded-lg bg-card border border-border/50 animate-pulse"
            >
              <div className="h-4 bg-border/50 rounded w-12 mb-2" />
              <div className="h-5 bg-border/50 rounded w-16 mb-1" />
              <div className="h-4 bg-border/50 rounded w-10" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {quotes.map((quote) => (
            <div
              key={quote.symbol}
              className="group p-3 rounded-lg bg-card border border-border/50 hover:border-emerald-500/30 transition-all"
            >
              {/* Symbol */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-data font-medium text-muted-foreground">
                  {quote.symbol}
                </span>
                {getTrendIcon(quote.daily_change)}
              </div>

              {/* Price */}
              <div className="text-base font-data font-semibold text-foreground mb-0.5">
                ${formatPrice(quote.price)}
              </div>

              {/* Change */}
              <div className={`text-sm font-data font-medium ${getChangeColor(quote.daily_change)}`}>
                {formatChange(quote.daily_change)}
              </div>

              {/* Name (truncated) */}
              <div className="text-xs text-muted-foreground mt-1 truncate" title={quote.name}>
                {quote.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
