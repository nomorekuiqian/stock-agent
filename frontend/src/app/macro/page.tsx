'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, MacroData } from '@/lib/api';

const CACHE_KEY = 'macro_analysis_cache';

interface CachedData {
  data: MacroData;
  cachedAt: string;
}

function loadFromCache(): CachedData | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveToCache(data: MacroData): void {
  if (typeof window === 'undefined') return;
  const cacheData: CachedData = {
    data,
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
}

export default function MacroPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MacroData | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load cached data on mount
  useEffect(() => {
    const cached = loadFromCache();
    if (cached) {
      setData(cached.data);
      setCachedAt(cached.cachedAt);
    }
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getMacroAnalysis();
      setData(result);
      saveToCache(result);
      setCachedAt(new Date().toISOString());
    } catch {
      setError('Failed to fetch macro analysis. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const result = await api.sendReportEmail();
      setEmailStatus({
        type: 'success',
        message: `Report sent to ${result.sent_to}`,
      });
    } catch (err) {
      setEmailStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send email',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const getTrendColor = (trend: string) => {
    if (trend.includes('Strongly Bullish')) return 'text-green-400';
    if (trend.includes('Bullish')) return 'text-green-500';
    if (trend.includes('Strongly Bearish')) return 'text-red-400';
    if (trend.includes('Bearish')) return 'text-red-500';
    return 'text-muted-foreground';
  };

  return (
    <main className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-8 mt-8 text-center space-y-2">
        <h1 className="font-serif text-3xl md:text-4xl font-bold">Market Analysis</h1>
        <p className="text-muted-foreground">Real-time market indices with AI-powered analysis</p>
      </header>

      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading || sendingEmail}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-full font-medium transition-all disabled:opacity-50"
            >
              {loading ? 'Analyzing...' : data ? 'Regenerate Report' : 'Analyze Market'}
            </button>
            {data && (
              <button
                onClick={handleSendEmail}
                disabled={loading || sendingEmail}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-6 py-2 rounded-full font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {sendingEmail ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send to Email'
                )}
              </button>
            )}
          </div>
          {cachedAt && !loading && (
            <p className="text-xs text-muted-foreground">
              Cached: {new Date(cachedAt).toLocaleString()}
            </p>
          )}
          {emailStatus && (
            <div className={`px-4 py-2 rounded-lg text-sm ${
              emailStatus.type === 'success'
                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}>
              {emailStatus.message}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-center">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="space-y-6 animate-in fade-in">
            {/* Short Analysis */}
            {data.short_analysis && (
              <div className="p-5 rounded-xl bg-primary/5 border border-primary/20">
                <h2 className="text-sm font-semibold text-primary mb-2">Quick Summary</h2>
                <p className="text-foreground leading-relaxed">{data.short_analysis}</p>
              </div>
            )}

            {/* Current Indices */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {data.indices.map((index) => (
                <div
                  key={index.name}
                  className="p-4 rounded-xl bg-card border border-border"
                >
                  <div className="text-xs text-muted-foreground mb-1">{index.name}</div>
                  <div className="text-xl font-bold">{index.value.toLocaleString()}</div>
                  {index.change_percent !== undefined && (
                    <div className={`text-sm font-medium ${index.change_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {index.change_percent >= 0 ? '▲' : '▼'} {Math.abs(index.change_percent).toFixed(2)}%
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Trends Table */}
            {data.trends && data.trends.length > 0 && (
              <div className="p-5 rounded-xl bg-card border border-border overflow-x-auto">
                <h2 className="text-lg font-semibold mb-4">Trend Analysis</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">Index</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">1 Week</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">1 Month</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trends.map((trend) => (
                      <tr key={trend.name} className="border-b border-border/50">
                        <td className="py-3 font-medium">{trend.name}</td>
                        <td className={`py-3 text-right ${trend.week_change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trend.week_change >= 0 ? '+' : ''}{trend.week_change.toFixed(2)}%
                        </td>
                        <td className={`py-3 text-right ${trend.month_change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trend.month_change >= 0 ? '+' : ''}{trend.month_change.toFixed(2)}%
                        </td>
                        <td className={`py-3 text-right font-medium ${getTrendColor(trend.trend)}`}>
                          {trend.trend}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Liquidity & Yield Curve */}
            {data.liquidity && (
              <div className="p-5 rounded-xl bg-card border border-border">
                <h2 className="text-lg font-semibold mb-4">Liquidity & Yield Curve</h2>

                {/* Yield Curve Rates */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {Object.entries(data.liquidity.yield_curve.rates).map(([maturity, rate]) => (
                    <div key={maturity} className="p-3 rounded-lg bg-background/50">
                      <div className="text-xs text-muted-foreground">{maturity} Treasury</div>
                      <div className="text-lg font-bold">{rate.toFixed(3)}%</div>
                      {data.liquidity?.yield_curve.changes[maturity] !== undefined && (
                        <div className={`text-xs ${data.liquidity.yield_curve.changes[maturity] >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {data.liquidity.yield_curve.changes[maturity] >= 0 ? '▲' : '▼'} {Math.abs(data.liquidity.yield_curve.changes[maturity]).toFixed(3)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Spreads */}
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">10Y-3M Spread:</span>
                    <span className={`font-semibold ${(data.liquidity.spreads['10y_3m'] ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {data.liquidity.spreads['10y_3m']?.toFixed(3) ?? 'N/A'}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">10Y-5Y Spread:</span>
                    <span className={`font-semibold ${(data.liquidity.spreads['10y_5y'] ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {data.liquidity.spreads['10y_5y']?.toFixed(3) ?? 'N/A'}%
                    </span>
                  </div>
                  {data.liquidity.spreads.inversion_warning && (
                    <div className="px-3 py-1 rounded-full bg-red-500/20 text-red-500 text-sm font-medium">
                      ⚠️ Yield Curve Inverted - Recession Warning
                    </div>
                  )}
                  {!data.liquidity.spreads.inversion_warning && (
                    <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-500 text-sm font-medium">
                      ✓ Normal Yield Curve
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* In-Depth Analysis */}
            {data.in_depth_analysis && (
              <div className="p-5 rounded-xl bg-card border border-border">
                <h2 className="text-lg font-semibold mb-3">In-Depth Analysis</h2>
                <div className="prose prose-invert prose-sm max-w-none
                  prose-headings:text-foreground prose-headings:font-semibold
                  prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
                  prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
                  prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:my-2
                  prose-strong:text-foreground prose-strong:font-semibold
                  prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                  prose-ul:my-2 prose-li:text-muted-foreground prose-li:my-0.5
                  prose-ol:my-2">
                  <ReactMarkdown>{data.in_depth_analysis}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div className="text-center text-xs text-muted-foreground">
              Updated: {new Date(data.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
