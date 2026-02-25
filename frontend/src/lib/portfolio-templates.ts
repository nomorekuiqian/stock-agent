/**
 * Pre-built portfolio templates for quick onboarding.
 * Used by OnboardingSection component.
 */

export interface PortfolioTemplate {
  id: string;
  name: string;
  description: string;
  symbols: string[];
}

export const PORTFOLIO_TEMPLATES: PortfolioTemplate[] = [
  {
    id: 'tech-allstar',
    name: '科技全明星',
    description: 'Mag 7 全家桶 + 关键芯片 + 指数，大厂打工人标配',
    symbols: [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
      'AMD', 'AVGO', 'TSM',
      'CRM', 'NFLX', 'ADBE',
      'SPY', 'QQQ',
    ],
  },
  {
    id: 'ai-chain',
    name: 'AI 产业链',
    description: '从芯片到平台到应用，追踪 AI 全价值链资金流向',
    symbols: [
      'NVDA', 'AMD', 'AVGO', 'TSM', 'ARM', 'MRVL',
      'MSFT', 'GOOGL', 'META',
      'PLTR', 'CRM', 'NOW', 'SNOW',
      'SMCI',
    ],
  },
  {
    id: 'china-us-tech',
    name: '中美科技双线',
    description: '横跨太平洋，同时关注硅谷大厂和中国互联网龙头',
    symbols: [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA',
      'BABA', 'PDD', 'JD', 'BIDU', 'NIO', 'LI', 'BILI', 'NTES', 'TME',
    ],
  },
  {
    id: 'semiconductors',
    name: '芯片半导体',
    description: '从设计到制造到设备，芯片全产业链覆盖',
    symbols: [
      'NVDA', 'AMD', 'QCOM', 'ARM', 'AVGO', 'MRVL',
      'TSM', 'INTC', 'MU',
      'ASML', 'LRCX', 'KLAC',
    ],
  },
  {
    id: 'steady-growth',
    name: '稳健配置',
    description: 'ETF + 蓝筹 + 分红，适合不折腾的长线投资者',
    symbols: [
      'SPY', 'QQQ', 'VTI', 'VXUS', 'BND',
      'AAPL', 'MSFT', 'JPM', 'JNJ', 'PG',
      'V', 'UNH', 'KO', 'BRK.B',
    ],
  },
  {
    id: 'crypto-fintech',
    name: '加密 & 金融科技',
    description: '加密货币 + 支付网络 + 传统金融，新金融探索者',
    symbols: [
      'COIN', 'MSTR', 'MARA', 'RIOT', 'HOOD',
      'SQ', 'PYPL', 'AFRM',
      'V', 'MA',
      'JPM', 'GS',
      'SPY',
    ],
  },
];
