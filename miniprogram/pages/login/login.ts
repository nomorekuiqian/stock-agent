import { wechatLogin, sendOtp, verifyOtp } from '../../services/auth';
import { setEmail, getEmail } from '../../utils/storage';

type LoginView = 'login' | 'email_input' | 'otp_input';

Page({
  _countdownTimer: null as ReturnType<typeof setInterval> | null,

  data: {
    view: 'login' as LoginView,
    loading: false,
    bindEmail: '',
    bindError: '',
    otpCode: '',
    otpError: '',
    maskedEmail: '',
    countdown: 0,
    countdownActive: false,
  },

  _maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return email;
    return email[0] + '**' + email.substring(at);
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
    if (options.mode === 'bind') {
      this.setData({ view: 'email_input' });
    }
  },

  // ------------------------------------------------------------------
  // View: login
  // ------------------------------------------------------------------
  async onWechatLogin() {
    this.setData({ loading: true });
    const result = await wechatLogin();

    if (!result.success) {
      wx.showToast({ title: result.error || '登录失败', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    // All account states → enter home (no forced registration)
    wx.switchTab({ url: '/pages/home/home' });
  },

  // ------------------------------------------------------------------
  // View: email_input
  // ------------------------------------------------------------------
  onEmailInput(e: WechatMiniprogram.Input) {
    this.setData({ bindEmail: e.detail.value.trim(), bindError: '' });
  },

  async onSendOtp() {
    const email = this.data.bindEmail;
    if (!email || !email.includes('@')) {
      this.setData({ bindError: '请输入有效的邮箱地址' });
      return;
    }
    this.setData({ loading: true, bindError: '' });
    const result = await sendOtp(email);
    if (result.success) {
      setEmail(email);
      this.setData({
        loading: false,
        view: 'otp_input',
        maskedEmail: this._maskEmail(email),
        otpCode: '',
        otpError: '',
      });
      this._startCountdown();
    } else {
      const msg = result.error || '发送失败，请稍后重试';
      this.setData({
        loading: false,
        bindError: msg.includes('1/minute') ? '发送太频繁，请 1 分钟后重试' : msg,
      });
    }
  },

  async onResendOtp() {
    if (this.data.countdownActive) return;
    const email = this.data.bindEmail || getEmail();
    const result = await sendOtp(email);
    if (result.success) {
      this._startCountdown();
      this.setData({ otpCode: '', otpError: '' });
      wx.showToast({ title: '验证码已重新发送', icon: 'none' });
    } else {
      wx.showToast({ title: '发送失败，请稍后重试', icon: 'none' });
    }
  },

  // ------------------------------------------------------------------
  // View: otp_input
  // ------------------------------------------------------------------
  onCodeInput(e: WechatMiniprogram.Input) {
    this.setData({ otpCode: e.detail.value, otpError: '' });
  },

  async onVerifyOtp() {
    const code = this.data.otpCode.trim();
    if (code.length !== 6) {
      this.setData({ otpError: '请输入6位验证码' });
      return;
    }
    const email = this.data.bindEmail || getEmail();
    this.setData({ loading: true, otpError: '' });
    const result = await verifyOtp(email, code);
    this.setData({ loading: false });
    if (result.success) {
      wx.showToast({ title: '邮箱绑定成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 1200);
    } else {
      this.setData({ otpError: result.error || '验证失败，请重试' });
    }
  },

  onSkip() {
    wx.switchTab({ url: '/pages/home/home' });
  },
});
