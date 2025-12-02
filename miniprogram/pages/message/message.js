const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    paddingTop: app.globalData.statusBarHeight + 10,
    curTab: 0,
    chatList: [],
    notifList: [],
    hasUnreadChat: false,
    hasUnreadNotif: false,
    // 记录每个会话最后一次点击的时间戳 { 'chatId': timestamp }
    lastClickMap: {} 
  },

  onShow() {
    console.log('[消息页] onShow');
    this.loadData();
    
    // 注册全局回调
    app.globalData.messagePageCallback = () => {
        console.log('[消息页] 收到全局更新通知');
        this.loadData();
    };
  },

  onHide() {
    app.globalData.messagePageCallback = null;
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh());
  },

  loadData(cb) {
    const p1 = this.loadChats();
    const p2 = this.loadNotifications();
    Promise.all([p1, p2]).then(() => {
      // 更新完成后，检查一下底部 TabBar
      this.checkTabBar();
      if (cb) cb();
    });
  },

  checkTabBar() {
      // 重新计算当前页面数据的红点状态
      const hasChat = this.data.chatList.some(i => i.hasUnread);
      const hasNotif = this.data.notifList.some(i => !i.isRead);
      
      // 如果页面内都没有红点，通知 app.js 尝试消除底部红点
      // (注意：app.js 的 watcher 也会控制，这里是双重保险)
      if (!hasChat && !hasNotif) {
          wx.hideTabBarRedDot({ index: 1 }).catch(()=>{});
      }
  },

  switchTab(e) {
    this.setData({ curTab: e.currentTarget.dataset.idx });
  },

  // 1. 加载聊天列表
  loadChats() {
    const user = wx.getStorageSync('my_user_info');
    if (!user) return Promise.resolve();

    return db.collection('chats').where({
        members: user._id
      })
      .orderBy('updateTime', 'desc').get()
      .then(res => {
        let hasUnreadAny = false;
        
        const list = res.data.map(i => {
          // A. 数据库原始状态
          let isUnreadInDB = i.unreadMembers && i.unreadMembers.includes(user._id);
          
          // B. 获取消息时间戳
          // 兼容 Date 对象和 ISO 字符串
          let updateTime = 0;
          if (i.updateTime instanceof Date) {
              updateTime = i.updateTime.getTime();
          } else if (typeof i.updateTime === 'string') {
              updateTime = new Date(i.updateTime).getTime();
          }

          // C. 获取本地最后一次点击时间
          const lastClickTime = this.data.lastClickMap[i._id] || 0;

          // D. 终极判断：
          // 只有当 (数据库说未读) 且 (消息更新时间 > 我最后点击的时间) 时，才算真的未读
          // 这样即使数据库还没更新完，只要我刚点过，红点就不会出来
          let finalUnread = false;
          if (isUnreadInDB) {
              // 给个 2秒 的缓冲容错，防止本地时间和服务端时间微小误差
              if (updateTime > (lastClickTime + 2000)) {
                  finalUnread = true;
              }
          }

          if (finalUnread) hasUnreadAny = true;
          
          return {
            ...i,
            timeStr: '刚刚', 
            targetAvatar: i.targetAvatar || '/images/default-room.png',
            hasUnread: finalUnread,
            lastMessage: i.lastMessage || '[图片]' 
          };
        });

        this.setData({ chatList: list, hasUnreadChat: hasUnreadAny });
      });
  },

  // 2. 加载通知列表
  loadNotifications() {
    const user = wx.getStorageSync('my_user_info');
    if (!user) return Promise.resolve();

    return db.collection('notifications').where({ targetUserId: user._id })
      .orderBy('createTime', 'desc').get()
      .then(res => {
        let hasUnreadAny = false;
        const list = res.data.map(i => {
          if (!i.isRead) hasUnreadAny = true;
          let title = '系统通知', icon = '🔔';
          if (i.type == 'fav') { title = '收到了新收藏'; icon = '⭐'; }
          if (i.type == 'join_result') { title = '申请结果通知'; icon = '📝'; }
          if (i.type == 'new_member') { title = '新室友加入'; icon = '👋'; }
          if (i.type == 'completed') { title = '招募完成'; icon = '🎉'; }
          return { ...i, title, icon, timeStr: '刚刚' };
        });
        this.setData({ notifList: list, hasUnreadNotif: hasUnreadAny });
      });
  },

  // --- 核心修复：点击进入聊天 ---
  goChat(e) {
    const { id, name } = e.currentTarget.dataset;
    const user = wx.getStorageSync('my_user_info');

    // 1. 记录点击时间戳 (关键步骤)
    const now = Date.now();
    const newMap = { ...this.data.lastClickMap, [id]: now };
    this.setData({ lastClickMap: newMap });

    // 2. 本地立即消红点 (UI反馈)
    const idx = this.data.chatList.findIndex(c => c._id === id);
    if (idx > -1) {
        const upKey = `chatList[${idx}].hasUnread`;
        this.setData({ [upKey]: false });
        this.checkTabRedDotLocal(); // 更新顶部Tab
    }

    // 3. 数据库异步消红点
    db.collection('chats').doc(id).update({
      data: { unreadMembers: _.pull(user._id) }
    }).catch(console.error);

    // 4. 跳转
    wx.navigateTo({ url: `/pages/chat/chat?id=${id}&name=${name}` });
  },

  // 本地计算Tab红点
  checkTabRedDotLocal() {
      const hasChat = this.data.chatList.some(i => i.hasUnread);
      this.setData({ hasUnreadChat: hasChat });
  },

  readNotification(e) {
    const { id, read } = e.currentTarget.dataset;
    if (!read) {
      db.collection('notifications').doc(id).update({ data: { isRead: true } })
        .then(() => this.loadData());
    }
  },

  handleReq(e) {
    const { id, act, idx } = e.currentTarget.dataset;
    const req = this.data.notifList[idx];

    if (!req.isRead) {
        db.collection('notifications').doc(id).update({ data: { isRead: true } });
    }

    if (act === 'reject') {
      db.collection('notifications').doc(id).update({ data: { status: 'rejected' } });
      this.sendNotification(req.sender._id, 'join_result', `房主拒绝了您加入 [${req.community}] 的申请`, req.roomId);
      wx.showToast({title:'已拒绝'});
      this.loadData();
    } else {
      wx.showLoading({title:'处理中...'});
      db.collection('rooms').doc(req.roomId).get().then(res => {
         const roomData = res.data;
         const rooms = roomData.rooms;
         if (rooms[req.roomIdx].status == 1) {
            wx.hideLoading(); return wx.showToast({title:'房间已被占', icon:'none'});
         }
         rooms[req.roomIdx].status = 1; 
         rooms[req.roomIdx].isMeIndex = 1; 
         rooms[req.roomIdx].occupant = {
            genderIndex: req.sender.gender == 2 ? 1 : 0, 
            ageIndex: 4, job: req.sender.job || '保密'
         };
         const isFull = rooms.every(r => r.status == 1);
         const newStatus = isFull ? 'completed' : 'active';

         db.collection('rooms').doc(req.roomId).update({
            data: { rooms: rooms, status: newStatus, memberIds: _.addToSet(req.sender._id) }
         }).then(() => {
            db.collection('notifications').doc(id).update({ data: { status: 'accepted' } });
            this.sendNotification(req.sender._id, 'join_result', `恭喜！房主同意您加入 [${req.community}]`, req.roomId);
            if (isFull) {
                this.sendNotification(req.targetUserId, 'completed', `房源 [${req.community}] 已满！`, req.roomId);
                this.sendNotification(req.sender._id, 'completed', `您加入的 [${req.community}] 已满！`, req.roomId);
            }
            wx.hideLoading();
            wx.showToast({title:'已同意'});
            this.loadData();
         });
      });
    }
  },

  sendNotification(targetId, type, content, roomId) {
    db.collection('notifications').add({
      data: { targetUserId: targetId, type: type, content: content, roomId: roomId, createTime: db.serverDate(), isRead: false }
    });
  },
  
  viewApplicant(e) {
    const u = e.currentTarget.dataset.user;
    wx.showModal({ title: '申请人资料', content: `${u.nickName}`, showCancel: false });
  }
})