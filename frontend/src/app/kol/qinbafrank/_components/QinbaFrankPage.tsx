'use client';

import { useEffect, useState } from 'react';
import { Loader2, FileText } from 'lucide-react';

import { api, type KolCockpitProfile, type KolCockpitTickerSummary } from '@/lib/api';
import MethodologyCore from './MethodologyCore';
import SectorExplorer from './SectorExplorer';
import TickerExplorer from './TickerExplorer';

const USERNAME = 'qinbafrank';

export default function QinbaFrankPage() {
  const [profile, setProfile] = useState<KolCockpitProfile | null>(null);
  const [tickers, setTickers] = useState<KolCockpitTickerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.kolResearch.cockpitProfile(USERNAME),
      api.kolResearch.cockpitTickers(USERNAME),
    ])
      .then(([p, t]) => {
        if (cancelled) return;
        setProfile(p);
        setTickers(t.tickers);
      })
      .catch(() => {
        if (!cancelled) setError('加载失败，请稍后重试');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> 加载投研驾驶舱…
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{error || '暂无数据'}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <MethodologyCore displayName={profile.persona.display_name} core={profile.core} />
      <SectorExplorer username={USERNAME} sectors={profile.sectors} />
      <TickerExplorer username={USERNAME} tickers={tickers} />

      <footer className="border-t border-border/40 bg-background">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-4">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              本页基于 @{profile.persona.username} 的公开推文蒸馏，<span className="text-foreground">不是本人发言，也不构成投资建议</span>。
              方法论为已蒸馏内容；个股摘录均为推文原文逐字，命中原推才说「原文支持」。价格数据来自 FMP。
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
