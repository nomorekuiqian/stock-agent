'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { CalendarEvent } from '@/lib/api';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

interface ReportContentProps {
  indices?: IndexData[];
  inDepthAnalysis?: string;
  calendar?: CalendarEvent[];
  timestamp?: string;
  showTimestamp?: boolean;
}

// Asset category definitions (same as market page)
const ASSET_CATEGORIES = {
  indices: {
    label: '股票指数',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    items: ['S&P 500', 'Nasdaq', 'Dow Jones', 'Russell 2000', 'S&P 400'],
  },
  bonds: {
    label: '国债收益率',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    items: ['2Y Treasury', '10Y Treasury', '2Y', '10Y'],
  },
  commodities: {
    label: '大宗商品',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    items: ['Gold', 'Oil', 'GLD', 'USO'],
  },
  other: {
    label: '其他指标',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    items: ['VIX', 'US Dollar', 'Dollar', 'HYG', 'LQD', 'XLF', 'KRE'],
  },
};

type CategoryKey = keyof typeof ASSET_CATEGORIES;

// Indicator Chinese names and descriptions
const INDICATOR_INFO: Record<string, { zh: string; desc: string }> = {
  // Stock indices
  'S&P 500': { zh: '标普500', desc: '美国500家大型上市公司指数,代表美股整体走势' },
  'Nasdaq': { zh: '纳斯达克', desc: '以科技股为主的指数,反映科技行业表现' },
  'Dow Jones': { zh: '道琼斯', desc: '30家蓝筹股指数,代表美国传统工业巨头' },
  'Russell 2000': { zh: '罗素2000', desc: '小盘股指数,反映中小企业和风险偏好' },
  'S&P 400': { zh: '标普400', desc: '中盘股指数,介于大盘和小盘之间' },
  // Treasury
  '2Y Treasury': { zh: '2年期美债', desc: '短期国债收益率,反映市场对近期利率预期' },
  '10Y Treasury': { zh: '10年期美债', desc: '长期国债收益率,全球资产定价的锚' },
  // Commodities
  'Gold': { zh: '黄金', desc: '避险资产,通胀和地缘风险时上涨' },
  'Oil': { zh: '原油', desc: '能源价格风向标,影响通胀和经济活动' },
  // Other indicators
  'VIX': { zh: '恐慌指数', desc: '市场波动率指数,数值越高表示恐慌越强' },
  'US Dollar': { zh: '美元指数', desc: '美元对一篮子货币的强弱,影响全球资金流向' },
  'HYG': { zh: '高收益债', desc: '垃圾债ETF,反映信用风险和市场风险偏好' },
  'LQD': { zh: '投资级债', desc: '优质企业债ETF,反映企业信用状况' },
  'XLF': { zh: '金融板块', desc: '金融股ETF,银行和保险等金融机构表现' },
  'KRE': { zh: '区域银行', desc: '区域性银行ETF,反映中小银行健康状况' },
};

// Group calendar events by date
function groupEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  return events.reduce((acc, event) => {
    const dateKey = event.date.split('T')[0];
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);
}

export function ReportContent({
  indices,
  inDepthAnalysis,
  calendar,
  timestamp,
  showTimestamp = true,
}: ReportContentProps) {
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Group indices by category (ensure no duplicates)
  const groupedIndices = useMemo(() => {
    if (!indices) return {} as Record<CategoryKey, IndexData[]>;

    const result: Record<CategoryKey, IndexData[]> = {
      indices: [],
      bonds: [],
      commodities: [],
      other: [],
    };

    const assignedNames = new Set<string>();

    // Process categories in order of priority (indices first, other last)
    const categoryOrder: CategoryKey[] = ['indices', 'bonds', 'commodities', 'other'];

    categoryOrder.forEach((category) => {
      const categoryItems = ASSET_CATEGORIES[category].items;
      result[category] = indices.filter((index: IndexData) => {
        // Skip if already assigned to another category
        if (assignedNames.has(index.name)) return false;

        const matches = categoryItems.some((item) =>
          index.name.toLowerCase().includes(item.toLowerCase().split(' ')[0])
        );

        if (matches) {
          assignedNames.add(index.name);
          return true;
        }
        return false;
      });
    });

    return result;
  }, [indices]);

  // Group calendar events
  const groupedEvents = useMemo(() => {
    if (!calendar) return {};
    return groupEventsByDate(calendar);
  }, [calendar]);

  // Render index card with tooltip
  const renderIndexCard = (index: IndexData) => {
    const info = INDICATOR_INFO[index.name];
    return (
      <div key={index.name} className="group relative bg-card rounded-xl border border-border p-4 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 transition-all cursor-default">
        {info?.desc && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-foreground text-background text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-48 text-center shadow-lg leading-relaxed">
            {info.desc}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
          </div>
        )}
        <p className="text-sm font-semibold text-foreground mb-0.5">{info?.zh || index.name}</p>
        <p className="text-xs text-muted-foreground mb-2">{index.name}</p>
        <p className="text-lg font-bold text-foreground mb-1">{index.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        {index.change_percent !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-semibold ${index.change_percent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            <svg className={`w-3 h-3 ${index.change_percent >= 0 ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            {index.change_percent >= 0 ? '+' : ''}{index.change_percent.toFixed(2)}%
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stock Indices - Full Width */}
      {groupedIndices.indices?.length > 0 && (
        <section className="animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-500">
              {ASSET_CATEGORIES.indices.icon}
            </div>
            <h2 className="text-base font-semibold text-foreground">{ASSET_CATEGORIES.indices.label}</h2>
            <span className="text-xs text-muted-foreground">({groupedIndices.indices.length})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {groupedIndices.indices.map(renderIndexCard)}
          </div>
        </section>
      )}

      {/* Bonds & Commodities - Side by Side */}
      {(groupedIndices.bonds?.length > 0 || groupedIndices.commodities?.length > 0) && (
        <section className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bonds */}
            {groupedIndices.bonds?.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                    {ASSET_CATEGORIES.bonds.icon}
                  </div>
                  <h2 className="text-base font-semibold text-foreground">{ASSET_CATEGORIES.bonds.label}</h2>
                  <span className="text-xs text-muted-foreground">({groupedIndices.bonds.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {groupedIndices.bonds.map(renderIndexCard)}
                </div>
              </div>
            )}

            {/* Commodities */}
            {groupedIndices.commodities?.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                    {ASSET_CATEGORIES.commodities.icon}
                  </div>
                  <h2 className="text-base font-semibold text-foreground">{ASSET_CATEGORIES.commodities.label}</h2>
                  <span className="text-xs text-muted-foreground">({groupedIndices.commodities.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {groupedIndices.commodities.map(renderIndexCard)}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Other Indicators - Full Width */}
      {groupedIndices.other?.length > 0 && (
        <section className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-500">
              {ASSET_CATEGORIES.other.icon}
            </div>
            <h2 className="text-base font-semibold text-foreground">{ASSET_CATEGORIES.other.label}</h2>
            <span className="text-xs text-muted-foreground">({groupedIndices.other.length})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {groupedIndices.other.map(renderIndexCard)}
          </div>
        </section>
      )}

      {/* In-Depth Analysis */}
      {inDepthAnalysis && (
        <section className="animate-fade-in-up delay-200">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">深度分析</h2>
                <p className="text-xs text-muted-foreground">AI 生成的市场报告</p>
              </div>
            </div>

            <div className="px-5 py-5">
              <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-p:text-muted-foreground prose-strong:text-foreground prose-a:text-emerald-500 prose-ul:text-muted-foreground prose-li:text-muted-foreground dark:prose-invert">
                <ReactMarkdown
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="transition-colors">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {inDepthAnalysis}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Events Calendar - Grouped by Date */}
      {calendar && calendar.length > 0 && (
        <section className="animate-fade-in-up delay-300">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-foreground">重要事件</h2>
            <span className="text-xs text-muted-foreground">({calendar.length} 个事件)</span>
          </div>

          <div className="space-y-4">
            {Object.entries(groupedEvents).map(([dateKey, events]) => {
              const date = new Date(dateKey);
              const isToday = new Date().toDateString() === date.toDateString();

              return (
                <div key={dateKey} className="flex gap-4">
                  {/* Date Column */}
                  <div className={`flex-shrink-0 w-16 text-center py-2 rounded-lg ${
                    isToday ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-secondary'
                  }`}>
                    <p className={`text-xs font-medium uppercase ${isToday ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </p>
                    <p className={`text-xl font-bold ${isToday ? 'text-emerald-500' : 'text-foreground'}`}>
                      {date.getDate()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </p>
                  </div>

                  {/* Events */}
                  <div className="flex-1 space-y-2">
                    {events.map((event: CalendarEvent, idx: number) => (
                      <div
                        key={idx}
                        className="bg-card rounded-lg border border-border p-3 hover:border-emerald-500/50 transition-all"
                      >
                        <h3 className="font-medium text-foreground text-sm">{event.event}</h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.analysis}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Timestamp */}
      {showTimestamp && timestamp && (
        <div className="text-center pt-4 border-t border-border animate-fade-in delay-400">
          <p className="text-xs text-muted-foreground">
            报告生成于 {formatDate(timestamp)} {formatTime(timestamp)}
          </p>
        </div>
      )}
    </div>
  );
}
