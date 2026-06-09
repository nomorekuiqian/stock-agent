'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnalysisSection, AIPaywall } from '@/app/stock/[symbol]/_components/shared';
import { getAccessTokenAsync as getAccessToken } from '@/contexts/AuthContext';
import { queryKeys } from '@/hooks/queries/query-keys';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

async function requiredAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Session expired');
  return { Authorization: `Bearer ${token}` };
}

export interface MarketAnalysis {
  title: string;
  narrative: string;
  analyst_signals: string;
  capital_and_insider: string;
  catalysts_and_events: string;
  signal_coherence: string;
}

function useMarketAnalysis(symbol: string, enabled: boolean = true) {
  return useQuery<{ analysis: MarketAnalysis | null; meta: { generated_at?: string } } | null>({
    queryKey: queryKeys.stocks.marketAnalysis(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/market-analysis`, {
        headers: await requiredAuthHeaders(),
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (!result.success) return null;
      return { analysis: result.analysis, meta: result.meta };
    },
    enabled: !!symbol && enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}

function useGenerateMarketAnalysis(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ force = false }: { force?: boolean } = {}) => {
      const response = await fetch(
        `${API_BASE_URL}/stocks/${symbol}/market-analysis?force=${force}`,
        { method: 'POST', headers: await requiredAuthHeaders() },
      );
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const result = await response.json();
      return result.success
        ? { analysis: result.analysis as MarketAnalysis, meta: result.meta }
        : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.setQueryData(queryKeys.stocks.marketAnalysis(symbol), data);
      }
    },
  });
}

export function AIMarketAnalysisCard({
  symbol,
  hasAIAccess = true,
}: {
  symbol: string;
  hasAIAccess?: boolean;
}) {
  const { data, isLoading: fetching } = useMarketAnalysis(symbol, hasAIAccess);
  const { mutate: generate, isPending: generating } = useGenerateMarketAnalysis(symbol);

  const analysis = data?.analysis ?? null;
  const loading = fetching || generating;

  return (
    <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
      {!hasAIAccess ? (
        <AIPaywall symbol={symbol} label="AI 综合解读" />
      ) : loading && !analysis ? (
        <div className="p-8 text-center">
          <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">正在生成 {symbol} 市场综合解读...</p>
        </div>
      ) : analysis ? (
        <>
          <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">AI 综合解读</span>
            <button
              onClick={() => generate({ force: true })}
              disabled={loading}
              className="text-muted-foreground hover:text-emerald-400 transition-colors p-1 rounded cursor-pointer disabled:opacity-50
                focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
              title="重新生成"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            </button>
          </div>
          <div className="px-4 py-3">
            {analysis.title && (
              <h3 className="font-editorial text-base text-foreground leading-snug mb-3">
                {analysis.title}
              </h3>
            )}
            <AnalysisSection label="核心叙事" content={analysis.narrative} accentColor="emerald" />
            <AnalysisSection label="信号一致性" content={analysis.signal_coherence} accentColor="emerald" />
            <AnalysisSection label="分析师信号" content={analysis.analyst_signals} accentColor="emerald" />
            <AnalysisSection label="资金与同行动向" content={analysis.capital_and_insider} accentColor="emerald" />
            <AnalysisSection label="催化事件" content={analysis.catalysts_and_events} accentColor="emerald" />
          </div>
        </>
      ) : (
        <div className="p-6 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-emerald-500/70 mb-3">
            <div className="w-4 h-px bg-emerald-500/25" />
            AI 综合解读
            <div className="w-4 h-px bg-emerald-500/25" />
          </div>
          <h3 className="font-editorial text-lg text-foreground mb-2">{symbol} 市场综合分析</h3>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            整合新闻、公告、分析师评级、目标价、同行表现与板块背景,输出跨维度信号判断
          </p>
          <button
            onClick={() => generate({})}
            className="group inline-flex items-center gap-2 px-5 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg
              text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer
              focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
          >
            <span>生成综合解读</span>
            <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
