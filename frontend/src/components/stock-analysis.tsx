'use client';

import { useState } from 'react';
import { api, StockInfo, AnalysisResponse } from '../lib/api';

export default function StockAnalysis() {
  const [ticker, setTicker] = useState('');
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const handleFetchInfo = async () => {
    if (!ticker) return;
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const info = await api.getStockInfo(ticker);
      setStockInfo(info);
    } catch (err) {
      setError('Failed to fetch stock info. Please check the ticker.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!ticker) return;
    setAnalyzing(true);
    setError('');
    try {
      const response = await api.analyzeStock(ticker);
      setAnalysis(response);
    } catch (err) {
      setError('Failed to analyze stock.');
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="glass-panel rounded-3xl p-8 md:p-12 transition-all duration-500">
      <div className="flex flex-col md:flex-row gap-4 mb-12">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="ENTER TICKER (E.G. AAPL)"
          className="flex-1 p-4 bg-white/50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none tracking-widest font-medium transition-all"
        />
        <button
          onClick={handleFetchInfo}
          disabled={loading}
          className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium tracking-wide transition-all disabled:opacity-50 shadow-lg shadow-slate-900/20"
        >
          {loading ? 'LOADING...' : 'GET DATA'}
        </button>
      </div>

      {error && (
        <div className="p-4 mb-8 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {stockInfo && (
        <div className="space-y-12 animate-fade-in-up">
          {/* Stock Header Info */}
          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div>
                <h2 className="font-serif text-4xl text-slate-900 mb-2">{stockInfo.longName}</h2>
                <p className="text-slate-500 font-medium tracking-wide">{stockInfo.symbol}</p>
              </div>
              
              <div className="space-y-6">
                <div className="flex justify-between items-baseline border-b border-slate-200 pb-4">
                  <span className="text-slate-500 text-sm uppercase tracking-wider">Current Price</span>
                  <span className="font-serif text-3xl text-slate-900">
                    {stockInfo.currentPrice ? `$${stockInfo.currentPrice}` : 'N/A'}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <span className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Sector</span>
                    <span className="font-medium text-slate-900">{stockInfo.sector}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Industry</span>
                    <span className="font-medium text-slate-900">{stockInfo.industry}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Market Cap</span>
                    <span className="font-medium text-slate-900">
                      {stockInfo.marketCap ? `$${(stockInfo.marketCap / 1e9).toFixed(2)}B` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Analysis Trigger / Status */}
            <div className="flex items-center justify-center">
              {!analysis && !analyzing && (
                <button
                  onClick={handleAnalyze}
                  className="group relative px-8 py-4 bg-slate-900 text-white rounded-full font-medium transition-all hover:shadow-xl hover:-translate-y-1 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Run Multi-Dimensional Analysis
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </button>
              )}
              {analyzing && (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto"></div>
                  <p className="text-sm tracking-widest uppercase animate-pulse text-slate-500">
                    Agents Analyzing: Fundamental, Technical, News, Sentiment...
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Analysis Cards Grid */}
          {analysis && (
            <div className="grid md:grid-cols-2 gap-6">
              <AnalysisCard 
                title="Fundamental Analysis" 
                icon="📊" 
                content={analysis.fundamental_analysis} 
                delay="0ms"
              />
              <AnalysisCard 
                title="Technical Analysis" 
                icon="📈" 
                content={analysis.technical_analysis} 
                delay="100ms"
              />
              <AnalysisCard 
                title="News & Events" 
                icon="📰" 
                content={analysis.news_analysis} 
                delay="200ms"
              />
              <AnalysisCard 
                title="Market Sentiment" 
                icon="🧠" 
                content={analysis.sentiment_analysis} 
                delay="300ms"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisCard({ title, icon, content, delay }: { title: string; icon: string; content: string; delay: string }) {
  return (
    <div 
      className="bg-white/40 rounded-2xl p-8 border border-white/50 hover:bg-white/60 transition-all duration-300 hover:shadow-lg animate-fade-in-up"
      style={{ animationDelay: delay }}
    >
      <h3 className="font-serif text-xl text-slate-900 mb-4 flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        {title}
      </h3>
      <div className="prose prose-sm prose-slate max-w-none text-slate-600 leading-relaxed">
        {content}
      </div>
    </div>
  );
}
