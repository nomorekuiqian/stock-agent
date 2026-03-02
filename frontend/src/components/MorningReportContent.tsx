'use client';

import type {
  MorningFuturesQuote,
  MorningGlobalSnapshot,
  MorningOvernightItem,
  MorningTodayFocusItem,
  MorningSummarySection,
} from '@/lib/api';

interface MorningReportContentProps {
  futures: MorningFuturesQuote[];
  futures_analysis?: string;
  global_markets: MorningGlobalSnapshot;
  global_markets_analysis?: string;
  overnight_news: MorningOvernightItem[];
  today_focus: MorningTodayFocusItem[];
  summary: MorningSummarySection[];
}

function formatChange(change: number): string {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function changeColor(change: number): string {
  if (change > 0) return 'text-emerald-500';
  if (change < 0) return 'text-red-500';
  return 'text-muted-foreground';
}

function formatValue(value: number): string {
  if (value > 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
      {children}
    </h2>
  </div>
);

const SubsectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
    {children}
  </h3>
);

const REGION_LABELS: Record<string, string> = {
  Asia: '亚太',
  Europe: '欧洲',
  Other: '其他',
};

const NAME_ZH: Record<string, string> = {
  'Nikkei 225': '日经225',
  'Hang Seng': '恒生指数',
  'Shanghai Composite': '上证综指',
  'DAX': 'DAX (德国)',
  'FTSE 100': '富时100 (英国)',
  'Gold': '黄金',
  'Crude Oil': '原油',
  'US Dollar': '美元指数',
  'VIX': 'VIX 恐慌指数',
  'BTC': '比特币',
};

const SUMMARY_TITLES: Record<string, string> = {
  overnight_review: '隔夜回顾',
  today_outlook: '今日展望',
};

export function MorningReportContent({
  futures,
  futures_analysis,
  global_markets,
  global_markets_analysis,
  overnight_news,
  today_focus,
  summary,
}: MorningReportContentProps) {
  return (
    <div className="space-y-5">
      {/* Futures */}
      {futures.length > 0 && (
        <section className="bg-card rounded-xl border border-border p-5">
          <SectionHeader>美股期货</SectionHeader>
          <div className="grid grid-cols-3 gap-3">
            {futures.map((f) => (
              <div key={f.name} className="bg-muted/80 rounded-lg p-4 text-center border border-border/50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  {f.name.replace(' Futures', '').replace('S&P 500', 'S&P').replace('Nasdaq', 'NQ').replace('Dow', 'DOW')}
                </p>
                <p className="text-xl font-semibold text-foreground">
                  {formatValue(f.value)}
                </p>
                <p className={`text-sm font-semibold mt-1 ${changeColor(f.daily_change)}`}>
                  {formatChange(f.daily_change)}
                </p>
              </div>
            ))}
          </div>
          {futures_analysis && (
            <div className="mt-4 bg-muted/60 rounded-lg p-3 border border-border/30">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {futures_analysis}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Global Markets */}
      {(global_markets.asia?.length > 0 || global_markets.europe?.length > 0 || global_markets.other?.length > 0) && (
        <section className="bg-card rounded-xl border border-border p-5">
          <SectionHeader>全球市场</SectionHeader>
          <div className="divide-y divide-border/50">
            {[
              { label: 'Asia', items: global_markets.asia },
              { label: 'Europe', items: global_markets.europe },
              { label: 'Other', items: global_markets.other },
            ]
              .filter((group) => group.items?.length > 0)
              .map((group) => (
                <div key={group.label} className="py-3 first:pt-0 last:pb-0">
                  <SubsectionHeader>{REGION_LABELS[group.label] || group.label}</SubsectionHeader>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{NAME_ZH[item.name] || item.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-data text-foreground">{formatValue(item.value)}</span>
                          <span className={`text-sm font-data font-semibold w-20 text-right ${changeColor(item.daily_change)}`}>
                            {formatChange(item.daily_change)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          {global_markets_analysis && (
            <div className="mt-4 bg-muted/60 rounded-lg p-3 border border-border/30">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {global_markets_analysis}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Overnight News */}
      {overnight_news.length > 0 && (
        <section className="bg-card rounded-xl border border-border p-5">
          <SectionHeader>隔夜要闻</SectionHeader>
          <div className="space-y-4">
            {overnight_news.map((item, i) => (
              <div key={i} className="pb-4 border-b border-border last:border-0 last:pb-0">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-semibold text-foreground hover:text-emerald-500 transition-colors block mb-2"
                  >
                    {item.title}
                  </a>
                ) : (
                  <h4 className="text-base font-semibold text-foreground mb-2">
                    {item.title}
                  </h4>
                )}
                <div className="bg-muted/60 rounded-lg p-3 border border-border/30">
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {item.analysis}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Today Focus */}
      {today_focus.length > 0 && (
        <section className="bg-card rounded-xl border border-border p-5">
          <SectionHeader>今日焦点</SectionHeader>
          <div className="space-y-4">
            {today_focus.map((item, i) => (
              <div key={i} className="pb-4 border-b border-border last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  {item.time && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 tracking-wide uppercase shrink-0 mt-0.5">
                      {item.time}
                    </span>
                  )}
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-foreground mb-2">
                      {item.title}
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.analysis}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Summary */}
      {summary.length > 0 && (
        <section className="bg-card rounded-xl border border-border p-5">
          <SectionHeader>总结与展望</SectionHeader>
          <div className="space-y-5">
            {summary.map((section, i) => (
              <div key={i}>
                <SubsectionHeader>{SUMMARY_TITLES[section.title] || section.title}</SubsectionHeader>
                {section.content.split('\n\n').map((paragraph, j) => (
                  <p key={j} className="text-sm text-foreground/90 leading-relaxed mb-3 last:mb-0">
                    {paragraph}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <div className="text-center pt-2 pb-2">
        <p className="text-xs text-muted-foreground/50">
          AI 生成的报告，仅供参考，不构成投资建议。
        </p>
      </div>
    </div>
  );
}
