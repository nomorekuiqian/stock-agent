// pages/webview/webview.js
// 承载 Next.js 页面的 web-view 容器。路径通过 query 传入，例如：
//   /pages/webview/webview?path=/login
// 注意：web-view 的 src 必须是业务域名 HTTPS 页面（在小程序管理后台配置白名单）

const app = getApp();

Page({
  data: {
    src: '',
  },
  onLoad(query) {
    const path = decodeURIComponent(query.path || '/');
    const base = app.globalData.webBaseUrl;
    // 附加一个 from=wxapp 参数，方便 Next.js 诊断页或后续业务做环境感知
    const sep = path.includes('?') ? '&' : '?';
    this.setData({ src: `${base}${path}${sep}from=wxapp` });
  },
  onMessage(e) {
    // web-view 页面通过 wx.miniProgram.postMessage 传回的消息
    // 只有在 web-view 页面调用 navigateBack/navigateTo/switchTab/reLaunch 时才会批量送达
    console.log('[webview] message', e.detail.data);
  },
  onError(e) {
    console.error('[webview] error', e.detail);
    wx.showToast({ title: 'WebView 加载失败', icon: 'none' });
  },
});
