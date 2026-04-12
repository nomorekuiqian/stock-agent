Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
  },
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
  },
  lifetimes: {
    attached() {
      const sysInfo = wx.getWindowInfo();
      this.setData({
        statusBarHeight: sysInfo.statusBarHeight || 20,
      });
    },
  },
  methods: {
    onBack() {
      wx.navigateBack({ delta: 1 });
    },
  },
});
