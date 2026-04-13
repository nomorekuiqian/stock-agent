Page({
  data: {
    code: '',
    error: '',
  },

  runWxLogin() {
    this.setData({ code: '', error: '' });
    wx.login({
      success: (res) => {
        if (res.code) {
          this.setData({ code: res.code });
        } else {
          this.setData({ error: res.errMsg || 'wx.login returned empty code' });
        }
      },
      fail: (err) => {
        this.setData({ error: err.errMsg || String(err) });
      },
    });
  },
});
