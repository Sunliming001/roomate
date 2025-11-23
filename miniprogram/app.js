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

  // --- 核心：全局红点检查 ---
  // 逻辑：(未读聊天数 > 0) || (未读通知数 > 0) => 显示底部红点
  checkTabBarBadge() {
    const user = this.globalData.userInfo || wx.getStorageSync('my_user_info');
    if (!user) return;
    
    const db = wx.cloud.database();
    const _ = db.command;

    // 1. 查未读聊天：unreadMembers 数组包含我的ID
    const p1 = db.collection('chats').where({
      members: user._id,
      unreadMembers: user._id
    }).count();

    // 2. 查未读通知：targetUserId 是我 且 isRead 为 false
    const p2 = db.collection('notifications').where({
      targetUserId: user._id,
      isRead: false
    }).count();

    Promise.all([p1, p2]).then(res => {
      const unreadChatCount = res[0].total;
      const unreadNotifCount = res[1].total;
      
      // 只要任意一个有未读，底部就显示红点
      if (unreadChatCount > 0 || unreadNotifCount > 0) {
        wx.showTabBarRedDot({ index: 1 }); // index 1 是消息页面
      } else {
        wx.hideTabBarRedDot({ index: 1 });
      }
    }).catch(console.error);
  }
})