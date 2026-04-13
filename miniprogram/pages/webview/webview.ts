import { setToken } from '../../utils/storage';

Page({
  data: {
    url: '',
  },

  onLoad(options: Record<string, string>) {
    if (options.url) {
      const decoded = decodeURIComponent(options.url);
      console.log('[WebView] Loading URL:', decoded);
      this.setData({ url: decoded });
    }
  },

  onMessage(e: WechatMiniprogram.CustomEvent) {
    const detail = e.detail;
    const data = detail && detail.data;
    if (!data || !Array.isArray(data)) return;

    // postMessage batches messages, process the latest
    const latest = data[data.length - 1];

    if (latest.type === 'auth_complete' && latest.token) {
      setToken(latest.token);
      console.log('Token received from WebView');
    }

    if (latest.type === 'navigate' && latest.path) {
      wx.navigateTo({
        url: `/pages/webview/webview?url=${encodeURIComponent(latest.path)}`,
      });
    }
  },
});
