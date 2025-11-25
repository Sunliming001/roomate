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
    // 每次切回前台，如果用户信息存在但监听器没跑，强制重启
    if (this.globalData.userInfo) {
       // 额外加一次主动查询，防止监听器挂了
       this.pollBadgeStatus(this.globalData.userInfo._id);
       
       if (!this.globalData.watcherChat) {
           this.initGlobalWatcher();
       }
    }
  },

  onHide() {
    // 切后台不关闭轮询，保证回到前台时是准的
  },

  // --- 核心：启动全局监听 ---
  initGlobalWatcher() {
    const user = wx.getStorageSync('my_user_info');
    if (!user) return;
    this.globalData.userInfo = user;
    
    const db = wx.cloud.database();
    
    // 清理旧的
    if (this.globalData.watcherChat) this.globalData.watcherChat.close();
    if (this.globalData.watcherNotif) this.globalData.watcherNotif.close();
    if (this.globalData.pollingTimer) clearInterval(this.globalData.pollingTimer);

    console.log('>>> [App] 启动全局监听, UserID:', user._id);

    // 1. 监听聊天 (策略：监听所有我参与的群)
    // 只要我是成员，任何风吹草动都推给我，我在本地判断是不是未读
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

          console.log(`>>> [App-Watch] 聊天更新。总群数:${snapshot.docs.length}, 我未读:${unreadCount}`);
          this.updateGlobalBadge(unreadCount, 'chat');
        },
        onError: (err) => {
            console.error('Chat Watch Error', err);
            // 报错尝试重连
            setTimeout(() => this.initGlobalWatcher(), 3000);
        }
      });

    // 2. 监听通知
    this.globalData.watcherNotif = db.collection('notifications')
      .where({
        targetUserId: user._id,
        isRead: false
      })
      .watch({
        onChange: (snapshot) => {
          console.log('>>> [App-Watch] 通知更新。未读:', snapshot.docs.length);
          this.updateGlobalBadge(snapshot.docs.length, 'notif');
        },
        onError: (err) => console.error('Notif Watch Error', err)
      });

    // 3. 启动轮询 (每3秒查一次，作为 Watcher 的备份)
    this.globalData.pollingTimer = setInterval(() => {
        this.pollBadgeStatus(user._id);
    }, 3000);
  },

  // 主动查询 (兜底)
  pollBadgeStatus(userId) {
    const db = wx.cloud.database();
    const _ = db.command;

    // 查聊天：members包含我 且 unreadMembers包含我
    db.collection('chats').where({
      members: userId,
      unreadMembers: userId
    }).count().then(res => {
       // 如果轮询结果和当前状态不一致，强制更新
       if (this.globalData.badgeState.chat !== res.total) {
           console.log(`>>> [App-Poll] 轮询修正聊天红点: ${res.total}`);
           this.updateGlobalBadge(res.total, 'chat');
       }
    });

    // 查通知
    db.collection('notifications').where({
      targetUserId: userId,
      isRead: false
    }).count().then(res => {
       if (this.globalData.badgeState.notif !== res.total) {
           console.log(`>>> [App-Poll] 轮询修正通知红点: ${res.total}`);
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
          // 如果 setTabBarBadge 失败(例如数字太大)，尝试显示小红点
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
    this.globalData.userInfo = user;
    this.initGlobalWatcher();
  },

  checkTabBarBadge() {
      // 兼容旧调用
      if (this.globalData.userInfo) {
          this.pollBadgeStatus(this.globalData.userInfo._id);
      }
  }
})