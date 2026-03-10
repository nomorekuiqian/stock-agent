'use client';

interface Strategy {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const STRATEGIES: Strategy[] = [
  {
    id: 'hot_sectors',
    name: '热门板块',
    description: '今日涨幅最好的板块及其领涨个股',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
  {
    id: 'volume_surge',
    name: '放量异动',
    description: '成交量显著放大且价格上涨的股票',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    id: 'value_discovery',
    name: '价值发现',
    description: '估值低于行业中位、处于 52 周低位、ROE 优秀',
    icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  },
  {
    id: 'high_dividend',
    name: '高股息',
    description: '股息率 > 2%、连续派息 3 年以上、派息率合理',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    id: 'momentum',
    name: '动量选股',
    description: '3 个月涨幅领先、RSI 在健康区间、站上 50 日均线',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    id: 'oversold_quality',
    name: '超跌优质',
    description: 'RSI 超卖、ROE > 15%、分析师评级买入',
    icon: 'M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12',
  },
  {
    id: 'by_sector',
    name: '板块筛选',
    description: '选择特定板块，查看该板块内的领涨个股',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  },
];

interface StrategyCardsProps {
  onSelect: (strategyId: string) => void;
  loading: boolean;
  selectedStrategy: string | null;
}

export default function StrategyCards({ onSelect, loading, selectedStrategy }: StrategyCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {STRATEGIES.map((s) => {
        const isActive = selectedStrategy === s.id;
        const isDisabled = false;

        return (
          <button
            key={s.id}
            onClick={() => !isDisabled && onSelect(s.id)}
            disabled={loading || isDisabled}
            className={`
              group relative p-4 rounded-xl border text-left transition-all duration-200
              ${isActive
                ? 'border-emerald-500/50 bg-emerald-500/5 shadow-sm shadow-emerald-500/10'
                : isDisabled
                  ? 'border-border/30 bg-muted/30 opacity-50 cursor-not-allowed'
                  : 'border-border/50 bg-card hover:border-emerald-500/30 hover:bg-emerald-500/[0.02]'
              }
              ${loading ? 'pointer-events-none' : ''}
            `}
          >
            <div className="flex items-start gap-3">
              <div className={`
                mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                ${isActive
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-muted/50 text-muted-foreground group-hover:bg-emerald-500/10 group-hover:text-emerald-500'
                }
                transition-colors duration-200
              `}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{s.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                  {s.description}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
