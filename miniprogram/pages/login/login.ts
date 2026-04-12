import { wechatLogin, bindAccount } from '../../services/auth';
import { buildWebViewUrl } from '../../services/api';
import { setToken } from '../../utils/storage';

Page({
  data: {
    loading: false,
    showBind: false,
    bindEmail: '',
    bindPassword: '',
    bindError: '',
  },

  onLoad(options: Record<string, string>) {
    // Handle token callback from WebView login
    if (options.token) {
      setToken(options.token);
      wx.switchTab({ url: '/pages/home/home' });
    }
  },

  async onWechatLogin() {
    this.setData({ loading: true });

    const result = await wechatLogin();

    if (!result.success) {
      wx.showToast({ title: result.error || '登录失败', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    if (result.is_bound) {
      wx.switchTab({ url: '/pages/home/home' });
    } else {
      this.setData({ loading: false, showBind: true });
    }
  },

  onEmailLogin() {
    const url = buildWebViewUrl('/wechat-login-callback');
    wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
  },

  onBindEmailInput(e: WechatMiniprogram.Input) {
    this.setData({ bindEmail: e.detail.value });
  },

  onBindPasswordInput(e: WechatMiniprogram.Input) {
    this.setData({ bindPassword: e.detail.value });
  },

  async onBind() {
    const { bindEmail, bindPassword } = this.data;
    if (!bindEmail || !bindPassword) {
      this.setData({ bindError: '请输入邮箱和密码' });
      return;
    }

    this.setData({ loading: true, bindError: '' });
    const result = await bindAccount(bindEmail, bindPassword);

    if (result.success) {
      wx.showToast({ title: '绑定成功', icon: 'success' });
      wx.switchTab({ url: '/pages/home/home' });
    } else {
      this.setData({ loading: false, bindError: result.error || '绑定失败' });
    }
  },

  onSkipBind() {
    wx.switchTab({ url: '/pages/home/home' });
  },
});
