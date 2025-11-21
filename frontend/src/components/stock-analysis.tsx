'use client';

import { useState, useEffect } from 'react';
import { api, AnalysisResponse } from '../lib/api';
import { HeadUpDisplay } from './widgets/HeadUpDisplay';
import { FundamentalCard } from './widgets/FundamentalCard';
import { TechnicalCard } from './widgets/TechnicalCard';
import { SentimentCard } from './widgets/SentimentCard';
import { SkepticCard } from './widgets/SkepticCard';
import { Skeleton } from "@/components/ui/skeleton";

export default function StockAnalysis() {
  const [ticker, setTicker] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trending, setTrending] = useState<any[]>([]);

  useEffect(() => {
    // Fetch trending on mount
    api.getTrending().then(setTrending).catch(console.error);
  }, []);

  const handleAnalyze = async (targetTicker: string = ticker) => {
    if (!targetTicker) return;
    setLoading(true);
    setError('');
    setAnalysis(null);
    
    // Update input if triggered from trending
    if (targetTicker !== ticker) setTicker(targetTicker);

    try {
      const response = await api.analyzeStock(targetTicker);
      setAnalysis(response);
    } catch (err) {
      setError('Failed to analyze stock. Please check the ticker.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          placeholder="ENTER TICKER (E.G. PLTR)"
          className="w-full p-6 bg-card border border-border rounded-2xl text-2xl font-mono tracking-wider text-center uppercase placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />
        <button
          onClick={() => handleAnalyze()}
          disabled={loading || !ticker}
          className="absolute right-4 top-4 bottom-4 px-6 bg-primary text-primary-foreground rounded-xl font-bold tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? '...' : 'GO'}
        </button>
      </div>

      {/* Trending Section (Only show if no analysis) */}
      {!analysis && !loading && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-center">Trending Now</h3>
          <div className="flex flex-wrap justify-center gap-3">
            {trending.map((stock) => (
              <button
                key={stock.ticker}
                onClick={() => handleAnalyze(stock.ticker)}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-full text-sm font-medium transition-colors flex items-center gap-2"
              >
                <span>{stock.ticker}</span>
                <span className={stock.change >= 0 ? "text-green-500" : "text-red-500"}>
                  {stock.change >= 0 ? "+" : ""}{stock.change}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-6 animate-pulse">
          <div className="space-y-2">
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
             <Skeleton className="h-64 w-full rounded-xl" />
             <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-center font-medium">
          {error}
        </div>
      )}

      {/* Analysis Feed */}
      {analysis && (
        <div className="space-y-6 animate-fade-in-up">
          <HeadUpDisplay 
            ticker={analysis.ticker} 
            price={analysis.current_price} 
            score={analysis.overall_score} 
            signal={analysis.signal} 
          />
          
          <SkepticCard data={analysis.skeptic} />
          
          <FundamentalCard data={analysis.fundamental} />
          
          <TechnicalCard data={analysis.technical} />
          
          <SentimentCard data={analysis.sentiment} />
        </div>
      )}
    </div>
  );
}
