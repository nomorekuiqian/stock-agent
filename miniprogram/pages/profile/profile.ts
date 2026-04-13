import { isLoggedIn, logout } from '../../services/auth';
import { getOpenid, getUserInfo } from '../../utils/storage';
import { buildWebViewUrl } from '../../services/api';

Page({
  data: {
    isLoggedIn: false,
    openid: '',
    nickname: '微信用户',
    avatarUrl: '',
  },

  onShow() {
    this.setData({
      isLoggedIn: isLoggedIn(),
      openid: getOpenid(),
    });
    const userInfo = getUserInfo();
    if (userInfo) {
      this.setData({
        nickname: userInfo.nickname || '微信用户',
        avatarUrl: userInfo.avatarUrl || '',
      });
    }
  },

  onEmailSubscribe() {
    const url = buildWebViewUrl('/subscription');
    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(url)}`,
    });
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          logout();
          wx.navigateTo({ url: '/pages/login/login' });
        }
      },
    });
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },
});
