// pages/index/index.js
Page({
  goWebview(e) {
    const path = e.currentTarget.dataset.path || '/';
    wx.navigateTo({
      url: `/pages/webview/webview?path=${encodeURIComponent(path)}`,
    });
  },
  goDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' });
  },
});
