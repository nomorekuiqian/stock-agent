'use client';

import { useState } from 'react';
import StockPanelView from '../_components/panel/StockPanelView';
import MacroPanelView from '../_components/panel/MacroPanelView';
import DailyReportView from '../_components/DailyReportView';
import MorningReportView from '../_components/MorningReportView';
import MacroOverview from '../_components/MacroOverview';
import BrewDigestView from '../_components/BrewDigestView';
import LiquidityView from '../_components/LiquidityView';
import EconomyView from '../_components/EconomyView';
import InflationView from '../_components/InflationView';
import SentimentView from '../_components/SentimentView';

// ---------------------------------------------------------------------------
// Panel catalog
// ---------------------------------------------------------------------------

interface PanelEntry {
  id: string;
  label: string;
  description: string;
  render: () => React.ReactNode;
}

const PANELS: PanelEntry[] = [
  {
    id: 'macro_panel',
    label: '宏观市场 (Panel)',
    description: 'MacroPanelView - 周报/流动性/经济/通胀/情绪 五合一面板',
    render: () => <MacroPanelView />,
  },
  {
    id: 'daily_report',
    label: '市场日报',
    description: 'DailyReportView - 每日市场总结、指数、新闻、日历',
    render: () => <DailyReportView />,
  },
  {
    id: 'morning_report',
    label: '盘前早报',
    description: 'MorningReportView - 盘前市场脉搏、期货、全球市场',
    render: () => <MorningReportView />,
  },
  {
    id: 'macro_overview',
    label: '宏观总览 (旧)',
    description: 'MacroOverview - 独立宏观周报视图（已整合入宏观面板）',
    render: () => <MacroOverview />,
  },
  {
    id: 'liquidity',
    label: '流动性',
    description: 'LiquidityView - 净流动性、美联储资产、TGA、RRP',
    render: () => <LiquidityView />,
  },
  {
    id: 'economy',
    label: '经济基本面',
    description: 'EconomyView - 经济增长、就业、信用风险',
    render: () => <EconomyView />,
  },
  {
    id: 'inflation',
    label: '通胀与利率',
    description: 'InflationView - CPI、通胀率、美联储政策',
    render: () => <InflationView />,
  },
  {
    id: 'sentiment',
    label: '市场情绪',
    description: 'SentimentView - CNN恐贪指数、市场情绪维度',
    render: () => <SentimentView />,
  },
  {
    id: 'stock_aapl',
    label: '个股 (AAPL)',
    description: 'StockPanelView - 概览/财报/技术面/市场面四个 tab',
    render: () => <StockPanelView symbol="AAPL" />,
  },
  {
    id: 'stock_nvda',
    label: '个股 (NVDA)',
    description: 'StockPanelView - 以 NVDA 为例',
    render: () => <StockPanelView symbol="NVDA" />,
  },
  {
    id: 'brew',
    label: '专属日报',
    description: 'BrewDigestView - 个性化持仓日报',
    render: () => <BrewDigestView />,
  },
];

// ---------------------------------------------------------------------------
// Gallery page
// ---------------------------------------------------------------------------

export default function PanelGalleryPage() {
  const [activeId, setActiveId] = useState(PANELS[0].id);
  const active = PANELS.find((p) => p.id === activeId) ?? PANELS[0];

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar: panel selector */}
      <div className="w-56 shrink-0 border-r border-border/50 flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-border/30">
          <h1 className="text-sm font-semibold">Panel Gallery</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {PANELS.length} panels
          </p>
        </div>
        <div className="flex-1 py-1">
          {PANELS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer ${
                p.id === activeId
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border/30">
          <a
            href="/research"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; 返回投研助手
          </a>
        </div>
      </div>

      {/* Main: active panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 px-5 py-3 border-b border-border/30 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">{active.label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {active.description}
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {active.id}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto" key={active.id}>
          {active.render()}
        </div>
      </div>
    </div>
  );
}
