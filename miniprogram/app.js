// app.js
App({
  globalData: {
    statusBarHeight: 20,
    navHeight: 44,
    userInfo: null,
    selectedCity: null
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({ traceUser: true });
    }

    const sys = wx.getSystemInfoSync();
    this.globalData.statusBarHeight = sys.statusBarHeight;
    
    const user = wx.getStorageSync('my_user_info');
    if(user) this.globalData.userInfo = user;
  },

  // --- 全局红点检查 (供各页面调用) ---
  checkTabBarBadge() {
    const user = this.globalData.userInfo || wx.getStorageSync('my_user_info');
    if (!user) {
        wx.hideTabBarRedDot({ index: 1 });
        return;
    }
    
    const db = wx.cloud.database();
    const _ = db.command;

    // 1. 未读聊天 (unreadMembers 包含我)
    const p1 = db.collection('chats').where({
      members: user._id,
      unreadMembers: user._id
    }).count();

    // 2. 未读通知 (isRead 为 false)
    const p2 = db.collection('notifications').where({
      targetUserId: user._id,
      isRead: false
    }).count();

    Promise.all([p1, p2]).then(res => {
      const total = res[0].total + res[1].total;
      if (total > 0) {
        wx.showTabBarRedDot({ index: 1 });
      } else {
        wx.hideTabBarRedDot({ index: 1 });
      }
    }).catch(err => {
      // 忽略错误，避免影响主流程
      console.error('红点检查失败', err);
    });
  }
})