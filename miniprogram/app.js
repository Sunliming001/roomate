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
    // 1. 启动时暴力清除所有红点，防止缓存残留
    wx.removeTabBarBadge({ index: 1 }).catch(()=>{});
    wx.hideTabBarRedDot({ index: 1 }).catch(()=>{});

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
    // 兜底检查：如果已有用户但监听器没跑，启动它
    if (this.globalData.userInfo) {
       // 主动查一次，确保数据同步
       this.pollBadgeStatus(this.globalData.userInfo._id);
       
       if (!this.globalData.watcherChat) {
           this.initGlobalWatcher();
       }
    }
  },

  onHide() {
    // 切后台不关闭，保持活跃
  },

  // --- 核心：启动全局监听 ---
  initGlobalWatcher() {
    const user = wx.getStorageSync('my_user_info');
    if (!user) return;
    this.globalData.userInfo = user;
    
    const db = wx.cloud.database();
    
    // 1. 彻底清理旧资源
    if (this.globalData.watcherChat) {
        this.globalData.watcherChat.close();
        this.globalData.watcherChat = null;
    }
    if (this.globalData.watcherNotif) {
        this.globalData.watcherNotif.close();
        this.globalData.watcherNotif = null;
    }
    if (this.globalData.pollingTimer) {
        clearInterval(this.globalData.pollingTimer);
        this.globalData.pollingTimer = null;
    }

    // 2. 重置本地计数状态
    this.globalData.badgeState = { chat: 0, notif: 0 };
    // 再次尝试清除UI（双重保险）
    wx.hideTabBarRedDot({ index: 1 }).catch(()=>{});
    wx.removeTabBarBadge({ index: 1 }).catch(()=>{});

    console.log('>>> [App] 启动监听, UserID:', user._id);

    // A. 监听聊天
    this.globalData.watcherChat = db.collection('chats')
      .where({ members: user._id })
      .watch({
        onChange: (snapshot) => {
          // 校验身份：防止账号切换后的旧回调干扰
          if (!this.globalData.userInfo || this.globalData.userInfo._id !== user._id) return;

          const unreadCount = snapshot.docs.filter(chat => {
             const list = chat.unreadMembers || [];
             return list.includes(user._id);
          }).length;
          this.updateGlobalBadge(unreadCount, 'chat');
        },
        onError: (err) => {
            // 报错重连
            setTimeout(() => {
                if (this.globalData.userInfo && this.globalData.userInfo._id === user._id) {
                    this.initGlobalWatcher();
                }
            }, 3000);
        }
      });

    // B. 监听通知
    this.globalData.watcherNotif = db.collection('notifications')
      .where({ targetUserId: user._id, isRead: false })
      .watch({
        onChange: (snapshot) => {
          if (!this.globalData.userInfo || this.globalData.userInfo._id !== user._id) return;
          this.updateGlobalBadge(snapshot.docs.length, 'notif');
        },
        onError: (err) => console.error('Notif Watch Error', err)
      });

    // C. 启动轮询 (3秒一次)
    this.globalData.pollingTimer = setInterval(() => {
        if (this.globalData.userInfo) {
            this.pollBadgeStatus(this.globalData.userInfo._id);
        }
    }, 3000);
  },

  // --- 核心修复：主动查询 (带身份校验) ---
  pollBadgeStatus(userId) {
    const db = wx.cloud.database();
    const _ = db.command;

    // 查聊天
    db.collection('chats').where({
      members: userId,
      unreadMembers: userId
    }).count().then(res => {
       // 关键校验：请求返回时，当前登录用户还是发起请求的那个人吗？
       if (!this.globalData.userInfo || this.globalData.userInfo._id !== userId) {
           console.warn('>>> [App] 拦截了过期的聊天查询结果');
           return;
       }

       if (this.globalData.badgeState.chat !== res.total) {
           this.updateGlobalBadge(res.total, 'chat');
       }
    });

    // 查通知
    db.collection('notifications').where({
      targetUserId: userId,
      isRead: false
    }).count().then(res => {
       // 关键校验
       if (!this.globalData.userInfo || this.globalData.userInfo._id !== userId) {
           console.warn('>>> [App] 拦截了过期的通知查询结果');
           return;
       }

       if (this.globalData.badgeState.notif !== res.total) {
           this.updateGlobalBadge(res.total, 'notif');
       }
    });
  },

  // 更新红点 UI
  updateGlobalBadge(count, type) {
    this.globalData.badgeState[type] = count;
    const total = this.globalData.badgeState.chat + this.globalData.badgeState.notif;

    // 只有当总数真的变了，或者需要强制清除时才调用 API，减少闪烁
    if (total > 0) {
      wx.setTabBarBadge({ index: 1, text: String(total) }).catch(() => {
          wx.showTabBarRedDot({ index: 1 }).catch(()=>{});
      });
    } else {
      wx.removeTabBarBadge({ index: 1 }).catch(()=>{});
      wx.hideTabBarRedDot({ index: 1 }).catch(()=>{});
    }

    // 联动消息页
    if (this.globalData.messagePageCallback) {
        this.globalData.messagePageCallback();
    }
  },

  loginSuccess(user) {
    // 切换用户时，立即清空旧数据，防止 UI 残留
    this.globalData.badgeState = { chat: 0, notif: 0 };
    wx.removeTabBarBadge({ index: 1 }).catch(()=>{});
    
    this.globalData.userInfo = user;
    this.initGlobalWatcher();
  },

  checkTabBarBadge() {
      if (this.globalData.userInfo) {
          this.pollBadgeStatus(this.globalData.userInfo._id);
      }
  }
})