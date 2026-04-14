import { wechatLogin, registerRequest, refreshLogin } from '../../services/auth';
import { buildWebViewUrl } from '../../services/api';
import { setToken, setEmail } from '../../utils/storage';

type LoginView = 'login' | 'register' | 'pending';

Page({
  _countdownTimer: null as ReturnType<typeof setInterval> | null,

  data: {
    view: 'login' as LoginView,
    loading: false,
    registerEmail: '',
    registerError: '',
    maskedEmail: '',
    countdown: 0,
    countdownActive: false,
  },

  _maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return email;
    const domain = email.substring(at);
    if (email.length <= 20) return email;
    return email[0] + '**' + domain;
  },

  _startCountdown() {
    this._clearCountdown();
    this.setData({ countdown: 60, countdownActive: true });
    this._countdownTimer = setInterval(() => {
      const next = this.data.countdown - 1;
      if (next <= 0) {
        this._clearCountdown();
        this.setData({ countdown: 0, countdownActive: false });
      } else {
        this.setData({ countdown: next });
      }
    }, 1000);
  },

  _clearCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  },

  onUnload() {
    this._clearCountdown();
  },

  onLoad(options: Record<string, string>) {
    // Token callback from WebView email login
    if (options.token) {
      setToken(options.token);
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    // Redirected back from /wechat-verify in WeChat browser after email confirmation
    if (options.verified) {
      this.doRefreshLogin();
    }
  },

  // ------------------------------------------------------------------
  // WeChat 一键登录
  // ------------------------------------------------------------------
  async onWechatLogin() {
    this.setData({ loading: true });
    const result = await wechatLogin();

    if (!result.success) {
      wx.showToast({ title: result.error || '登录失败', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    // bound or email_only → can use the app directly
    if (result.account_state === 'bound' || result.account_state === 'email_only') {
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }

    // unbound → show OTP registration form
    this.setData({ loading: false, view: 'register' });
  },

  // ------------------------------------------------------------------
  // 邮箱注册 (register view)
  // ------------------------------------------------------------------
  onEmailInput(e: WechatMiniprogram.Input) {
    this.setData({ registerEmail: e.detail.value, registerError: '' });
  },

  async onSendVerification() {
    const email = this.data.registerEmail.trim();
    if (!email || !email.includes('@')) {
      this.setData({ registerError: '请输入有效的邮箱地址' });
      return;
    }

    this.setData({ loading: true, registerError: '' });
    const result = await registerRequest(email);

    if (result.success) {
      setEmail(email);
      this.setData({
        loading: false,
        view: 'pending',
        maskedEmail: this._maskEmail(email),
      });
      this._startCountdown();
    } else {
      const msg = result.error || '发送失败，请稍后重试';
      const friendlyMsg = msg.includes('1/minute') ? '发送太频繁，请 1 分钟后重试' : msg;
      this.setData({ loading: false, registerError: friendlyMsg });
    }
  },

  onSkip() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  // ------------------------------------------------------------------
  // 等待验证 (pending view)
  // ------------------------------------------------------------------
  async onVerifiedTap() {
    this.setData({ loading: true });
    await this.doRefreshLogin();
  },

  async doRefreshLogin() {
    const result = await refreshLogin();

    if (!result.success) {
      this.setData({ loading: false });
      wx.showToast({ title: '刷新登录失败，请重试', icon: 'none' });
      return;
    }

    if (result.account_state === 'bound' || result.account_state === 'email_only') {
      wx.switchTab({ url: '/pages/home/home' });
    } else {
      // Still unbound — user hasn't verified yet
      this.setData({ loading: false });
      wx.showToast({ title: '验证尚未完成，请检查邮箱', icon: 'none' });
    }
  },

  async onResend() {
    if (this.data.countdownActive) return;
    const email = this.data.registerEmail.trim();
    const result = await registerRequest(email);
    if (result.success) {
      this._startCountdown();
      wx.showToast({ title: '验证链接已重新发送', icon: 'none' });
    } else {
      wx.showToast({ title: '发送失败，请稍后重试', icon: 'none' });
    }
  },

  // ------------------------------------------------------------------
  // 邮箱登录 (WebView fallback)
  // ------------------------------------------------------------------
  onEmailLogin() {
    const url = buildWebViewUrl('/wechat-login-callback');
    wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
  },
});
