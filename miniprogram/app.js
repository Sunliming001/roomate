// app.js
App({
  globalData: {
    statusBarHeight: 20,
    navHeight: 44,
    userInfo: null,
    selectedCity: null,
    watcherChat: null,
    watcherNotif: null,
    badgeState: { chat: 0, notif: 0 },
    messagePageCallback: null,
    pollingTimer: null
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
    if(user) {
      this.globalData.userInfo = user;
      this.initGlobalWatcher();
    }
  },

  onShow() {
    // 兜底：如果用户存在但监听器没了，重启它
    if (this.globalData.userInfo && !this.globalData.watcherChat) {
        this.initGlobalWatcher();
    }
  },

  onHide() {
    // 切后台不关闭，保持红点更新
  },

  // --- 核心：启动全局监听 ---
  initGlobalWatcher() {
    const user = wx.getStorageSync('my_user_info');
    if (!user) return;
    this.globalData.userInfo = user;
    
    const db = wx.cloud.database();
    
    // 1. 【关键修复】先清理旧状态，防止“41”闪烁
    if (this.globalData.watcherChat) this.globalData.watcherChat.close();
    if (this.globalData.watcherNotif) this.globalData.watcherNotif.close();
    if (this.globalData.pollingTimer) clearInterval(this.globalData.pollingTimer);
    
    // 重置计数器
    this.globalData.badgeState = { chat: 0, notif: 0 };
    // 立即清除 UI 红点
    wx.removeTabBarBadge({ index: 1 }).catch(()=>{});
    wx.hideTabBarRedDot({ index: 1 }).catch(()=>{});

    console.log('>>> [App] 启动全局监听, UserID:', user._id);

    // 2. 监听聊天 (监听所有我参与的群)
    this.globalData.watcherChat = db.collection('chats')
      .where({
        members: user._id
      })
      .watch({
        onChange: (snapshot) => {
          // 本地计算未读数
          const unreadCount = snapshot.docs.filter(chat => {
             const list = chat.unreadMembers || [];
             return list.includes(user._id);
          }).length;

          this.updateGlobalBadge(unreadCount, 'chat');
        },
        onError: (err) => {
            console.error('Chat Watch Error', err);
            // 报错重连
            setTimeout(() => this.initGlobalWatcher(), 3000);
        }
      });

    // 3. 监听通知
    this.globalData.watcherNotif = db.collection('notifications')
      .where({
        targetUserId: user._id,
        isRead: false
      })
      .watch({
        onChange: (snapshot) => {
          this.updateGlobalBadge(snapshot.docs.length, 'notif');
        },
        onError: (err) => console.error('Notif Watch Error', err)
      });

    // 4. 启动轮询 (每5秒查一次，兜底)
    this.globalData.pollingTimer = setInterval(() => {
        this.pollBadgeStatus(user._id);
    }, 5000);
  },

  // 主动查询 (兜底)
  pollBadgeStatus(userId) {
    const db = wx.cloud.database();
    const _ = db.command;

    db.collection('chats').where({
      members: userId,
      unreadMembers: userId
    }).count().then(res => {
       if (this.globalData.badgeState.chat !== res.total) {
           this.updateGlobalBadge(res.total, 'chat');
       }
    });

    db.collection('notifications').where({
      targetUserId: userId,
      isRead: false
    }).count().then(res => {
       if (this.globalData.badgeState.notif !== res.total) {
           this.updateGlobalBadge(res.total, 'notif');
       }
    });
  },

  // 更新红点 UI
  updateGlobalBadge(count, type) {
    this.globalData.badgeState[type] = count;
    const total = this.globalData.badgeState.chat + this.globalData.badgeState.notif;

    if (total > 0) {
      wx.setTabBarBadge({ index: 1, text: String(total) }).catch(() => {
          wx.showTabBarRedDot({ index: 1 }).catch(()=>{});
      });
    } else {
      wx.removeTabBarBadge({ index: 1 }).catch(()=>{});
      wx.hideTabBarRedDot({ index: 1 }).catch(()=>{});
    }

    // 联动消息页刷新
    if (this.globalData.messagePageCallback) {
        this.globalData.messagePageCallback();
    }
  },

  loginSuccess(user) {
    this.globalData.userInfo = user;
    this.initGlobalWatcher();
  },

  checkTabBarBadge() {
      // 留空，完全交给 Watcher
  }
})