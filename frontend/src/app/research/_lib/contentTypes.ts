/**
 * Content panel type system for the Research Desk.
 *
 * Each content type represents a different view that can be displayed
 * in the right panel while the Agent chat remains on the left.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type ContentType = 'screener' | 'stock' | 'daily_report' | 'morning_report' | 'macro' | 'macro_liquidity' | 'macro_economy' | 'macro_inflation' | 'macro_sentiment' | 'sector' | 'brew';

export type StockTab = 'overview' | 'earnings' | 'technical' | 'market';
export type MacroTab = 'overview' | 'liquidity' | 'economy' | 'inflation' | 'sentiment';

export interface ContentContext {
  type: ContentType;
  label: string;
  summary: string;
  params: Record<string, string> & {
    /** Agent can specify which tab to activate in stock/macro panels */
    tab?: string;
  };
  available_actions: string[];
}

// ---------------------------------------------------------------------------
// Default content (screener results panel)
// ---------------------------------------------------------------------------

export const SCREENER_CONTENT: ContentContext = {
  type: 'screener',
  label: '选股结果',
  summary: '',
  params: {},
  available_actions: ['继续筛选', '查看个股详情', '重新开始'],
};

export const DAILY_REPORT_CONTENT: ContentContext = {
  type: 'daily_report',
  label: '市场日报',
  summary: '',
  params: {},
  available_actions: ['追问日报内容', '查看提到的个股', '查看宏观背景'],
};

export const MORNING_REPORT_CONTENT: ContentContext = {
  type: 'morning_report',
  label: '盘前早报',
  summary: '',
  params: {},
  available_actions: ['解读早报要点', '分析期货动向', '看今日市场焦点'],
};

export const MACRO_CONTENT: ContentContext = {
  type: 'macro',
  label: '宏观风险仪表盘',
  summary: '',
  params: {},
  available_actions: ['深入某个维度', '查看对持仓影响', '返回选股'],
};

export const BREW_CONTENT: ContentContext = {
  type: 'brew',
  label: '专属日报',
  summary: '',
  params: {},
  available_actions: ['追问持仓表现', '查看个股详情', '查看宏观背景'],
};
