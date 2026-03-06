/**
 * Content panel type system for the Research Desk.
 *
 * Each content type represents a different view that can be displayed
 * in the right panel while the Agent chat remains on the left.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type ContentType = 'screener' | 'stock' | 'daily_report' | 'macro' | 'sector';

export interface ContentContext {
  type: ContentType;
  label: string;
  summary: string;
  params: Record<string, string>;
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
