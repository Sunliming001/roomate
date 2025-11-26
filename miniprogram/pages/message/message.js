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
    hasUnreadNotif: false
  },

  justClickedChatId: null,

  onShow() {
    // 1. 立即加载一次
    this.loadData();
    
    // 2. 注册全局回调
    app.globalData.messagePageCallback = () => {
        console.log('[消息页] 收到全局更新，刷新列表');
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
      if (cb) cb();
    });
  },

  switchTab(e) {
    this.setData({ curTab: e.currentTarget.dataset.idx });
  },

  loadChats() {
    const user = wx.getStorageSync('my_user_info');
    // 必须重新获取ID，防止缓存错乱
    if (!user) return Promise.resolve();

    return db.collection('chats').where({
        members: user._id
      })
      .orderBy('updateTime', 'desc').get()
      .then(res => {
        let hasUnreadAny = false;
        const list = res.data.map(i => {
          let isUnread = false;
          if (i.unreadMembers && i.unreadMembers.includes(user._id)) {
            isUnread = true;
          }
          if (i._id === this.justClickedChatId) isUnread = false;
          if (isUnread) hasUnreadAny = true;
          
          return {
            ...i,
            timeStr: '刚刚', 
            targetAvatar: i.targetAvatar || '/images/default-room.png',
            hasUnread: isUnread,
            lastMessage: i.lastMessage || '[图片]' 
          };
        });
        this.setData({ chatList: list, hasUnreadChat: hasUnreadAny });
        
        if(this.justClickedChatId) {
            setTimeout(() => { this.justClickedChatId = null }, 1000);
        }
      });
  },

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

  goChat(e) {
    const { id, name } = e.currentTarget.dataset;
    const user = wx.getStorageSync('my_user_info');
    this.justClickedChatId = id;

    const idx = this.data.chatList.findIndex(c => c._id === id);
    if (idx > -1) {
        const upKey = `chatList[${idx}].hasUnread`;
        this.setData({ [upKey]: false });
        // 本地先消Tab红点
        this.checkTabRedDotLocal();
    }

    db.collection('chats').doc(id).update({
      data: { unreadMembers: _.pull(user._id) }
    });

    wx.navigateTo({ url: `/pages/chat/chat?id=${id}&name=${name}` });
  },

  // 本地计算Tab红点是否该消失
  checkTabRedDotLocal() {
      const hasChat = this.data.chatList.some(i => i.hasUnread);
      this.setData({ hasUnreadChat: hasChat });
  },

  readNotification(e) {
    const { id, read } = e.currentTarget.dataset;
    if (!read) {
      db.collection('notifications').doc(id).update({ data: { isRead: true } });
    }
  },

  handleReq(e) {
    const { id, act, idx } = e.currentTarget.dataset;
    const req = this.data.notifList[idx];
    if (!req.isRead) db.collection('notifications').doc(id).update({ data: { isRead: true } });

    if (act === 'reject') {
      db.collection('notifications').doc(id).update({ data: { status: 'rejected' } });
      this.sendNotification(req.sender._id, 'join_result', `房主拒绝了您加入 [${req.community}] 的申请`, req.roomId);
      wx.showToast({title:'已拒绝'});
    } else {
      wx.showLoading({title:'处理中...'});
      db.collection('rooms').doc(req.roomId).get().then(res => {
         const roomData = res.data;
         const rooms = roomData.rooms;
         if (rooms[req.roomIdx].status == 1) {
            wx.hideLoading(); return wx.showToast({title:'该房间已被占', icon:'none'});
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
            wx.hideLoading(); wx.showToast({title:'已同意'});
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
    wx.showModal({ title: '申请人资料', content: `${u.nickName} | ${['男','女'][u.gender-1]}`, showCancel: false });
  }
})