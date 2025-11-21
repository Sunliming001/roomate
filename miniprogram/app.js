// app.js
App({
  globalData: {
    statusBarHeight: 20, // 默认兜底
    navHeight: 44 // 胶囊按钮的标准高度
  },
  onLaunch() {
    const sys = wx.getSystemInfoSync();
    this.globalData.statusBarHeight = sys.statusBarHeight;
  }
});
