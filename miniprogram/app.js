// app.js
App({
  globalData: {
    statusBarHeight: 20,
    navHeight: 44,
    userInfo: null
  },
  onLaunch() {
    // 1. 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-0gshkxrebac9e7f3', // 填入刚才获取的环境ID
        traceUser: true,
      });
    }

    // 2. 获取系统信息
    const sys = wx.getSystemInfoSync();
    this.globalData.statusBarHeight = sys.statusBarHeight;
    
    // 3. 尝试获取本地用户信息
    const user = wx.getStorageSync('my_user_info');
    if(user) this.globalData.userInfo = user;
  }
})