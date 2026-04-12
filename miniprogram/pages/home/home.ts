import { request, buildWebViewUrl } from '../../services/api';

interface HomeCard {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  icon: string;
  order: number;
  // Client-side display fields
  iconChar?: string;
  iconBg?: string;
  accentColor?: string;
}

// Map backend icon keys to display properties
const ICON_MAP: Record<string, { iconChar: string; iconBg: string; accentColor: string }> = {
  chart:  { iconChar: 'D', iconBg: 'rgba(16, 185, 129, 0.12)', accentColor: '#10b981' },
  sun:    { iconChar: 'M', iconBg: 'rgba(251, 191, 36, 0.12)',  accentColor: '#fbbf24' },
  brew:   { iconChar: 'B', iconBg: 'rgba(16, 185, 129, 0.12)', accentColor: '#34d399' },
  search: { iconChar: 'S', iconBg: 'rgba(99, 102, 241, 0.12)', accentColor: '#818cf8' },
  globe:  { iconChar: 'G', iconBg: 'rgba(14, 165, 233, 0.12)', accentColor: '#38bdf8' },
};

const DEFAULT_ICON = { iconChar: 'T', iconBg: 'rgba(16, 185, 129, 0.12)', accentColor: '#10b981' };

function enrichCard(card: HomeCard): HomeCard {
  const display = ICON_MAP[card.icon] || DEFAULT_ICON;
  return { ...card, ...display };
}

Page({
  data: {
    cards: [] as HomeCard[],
    loading: true,
  },

  onLoad() {
    this.loadCards();
  },

  onShow() {
    // TODO: restore login check after auth is configured
  },

  onPullDownRefresh() {
    this.loadCards().then(() => wx.stopPullDownRefresh());
  },

  async loadCards() {
    this.setData({ loading: true });
    try {
      const result = await request<{ success: boolean; cards: HomeCard[] }>('/wechat/home-cards');
      if (result.success) {
        this.setData({
          cards: result.cards.map(enrichCard),
          loading: false,
        });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('Failed to load home cards, using fallback:', err);
      this.setData({
        cards: [
          { id: 'today', title: '今日市场日报', subtitle: 'AI 生成的每日行情分析', url: '/today', icon: 'chart', order: 1 },
          { id: 'morning', title: '盘前早报', subtitle: '开盘前必看要闻', url: '/morning', icon: 'sun', order: 2 },
          { id: 'for-you', title: '专属 Brew', subtitle: '个性化投资摘要', url: '/for-you', icon: 'brew', order: 3 },
          { id: 'stock', title: '个股投研', subtitle: '深度个股分析与估值', url: '/stock', icon: 'search', order: 4 },
          { id: 'macro', title: '宏观仪表盘', subtitle: '流动性、风险评估、周报', url: '/macro', icon: 'globe', order: 5 },
        ].map(enrichCard),
        loading: false,
      });
    }
  },

  onCardTap(e: WechatMiniprogram.BaseEvent) {
    const url = e.currentTarget.dataset.url as string;
    const webviewUrl = buildWebViewUrl(url);
    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(webviewUrl)}`,
    });
  },
});
