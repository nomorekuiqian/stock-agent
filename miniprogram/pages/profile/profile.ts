import { request } from '../../services/api';
import { isLoggedIn, logout } from '../../services/auth';
import { getAccountState, getEmail, setEmail, clearAll } from '../../utils/storage';
import { buildWebViewUrl } from '../../services/api';
import type { AccountState } from '../../utils/storage';

Page({
  data: {
    accountState: 'unbound' as AccountState,
    email: '',
    emailInitial: 'U',
  },

  async onShow() {
    const loggedIn = isLoggedIn();
    const state: AccountState = loggedIn ? getAccountState() : 'unbound';
    let email = getEmail();

    if (loggedIn && state === 'email_only' && !email) {
      try {
        const me = await request<{ success: boolean; email?: string; account_state: string }>(
          '/wechat/me',
          { needAuth: true }
        );
        if (me.success && me.email) {
          email = me.email;
          setEmail(email);
        }
      } catch (_) { /* ignore */ }
    }

    this.setData({
      accountState: state,
      email,
      emailInitial: email ? email[0].toUpperCase() : 'U',
    });

    if (loggedIn && state === 'bound') {
      const url = buildWebViewUrl('/profile');
      wx.redirectTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
    }
  },

  onGoBindEmail() {
    wx.navigateTo({ url: '/pages/login/login?mode=bind' });
  },

  onBrowseContent() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onEmailSubscribe() {
    const url = buildWebViewUrl('/subscription');
    wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
  },

  onUpgradeAccount() {
    const url = buildWebViewUrl('/register');
    wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          logout();
          clearAll();
          this.setData({ accountState: 'unbound', email: '', emailInitial: 'U' });
        }
      },
    });
  },
});
