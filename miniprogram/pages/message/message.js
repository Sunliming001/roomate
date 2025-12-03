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
    userAvatarsCache: {} // 头像缓存
  },

  justClickedChatId: null,

  onShow() {
    this.loadData();
    app.globalData.messagePageCallback = () => {
        this.loadData();
    };
  },

  onHide() {
    app.globalData.messagePageCallback = null;
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh());
  },

  // --- 核心修复：跳转首页 ---
  goHome() {
    wx.switchTab({
      url: '/pages/index/index',
      fail: (err) => console.error('跳转首页失败:', err)
    });
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

  // 加载聊天列表 (带头像缓存)
  loadChats() {
    const user = wx.getStorageSync('my_user_info');
    if (!user) return Promise.resolve();

    return db.collection('chats').where({ members: user._id })
      .orderBy('updateTime', 'desc').get()
      .then(async res => {
        const chats = res.data;
        
        // 1. 提取ID
        let allMemberIds = new Set();
        chats.forEach(c => c.members.forEach(uid => allMemberIds.add(uid)));
        
        // 2. 批量获取头像
        const idsToFetch = Array.from(allMemberIds).filter(id => !this.data.userAvatarsCache[id]);
        if (idsToFetch.length > 0) {
            const uRes = await db.collection('users').where({ _id: _.in(idsToFetch) }).get();
            const newCache = { ...this.data.userAvatarsCache };
            uRes.data.forEach(u => newCache[u._id] = u.avatarUrl);
            this.setData({ userAvatarsCache: newCache });
        }

        // 3. 组装数据
        let hasUnreadAny = false;
        const list = chats.map(i => {
          let isUnread = i.unreadMembers && i.unreadMembers.includes(user._id);
          if (i._id === this.justClickedChatId) isUnread = false;
          if (isUnread) hasUnreadAny = true;
          
          const avatars = i.members.map(mid => this.data.userAvatarsCache[mid]).filter(a => a).slice(0, 4);

          return {
            ...i,
            timeStr: '刚刚', 
            memberAvatars: avatars,
            targetAvatar: '/images/default-room.png', 
            hasUnread: isUnread,
            lastMessage: i.lastMessage || '[图片]' 
          };
        });
        this.setData({ chatList: list, hasUnreadChat: hasUnreadAny });
        
        if(this.justClickedChatId) setTimeout(() => { this.justClickedChatId = null }, 1000);
      });
  },

  // 加载通知
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
    }

    db.collection('chats').doc(id).update({
      data: { unreadMembers: _.pull(user._id) }
    }).catch(console.error);

    wx.navigateTo({ url: `/pages/chat/chat?id=${id}&name=${name}` });
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

    if (!req.isRead) db.collection('notifications').doc(id).update({ data: { isRead: true } });

    if (act === 'reject') {
      db.collection('notifications').doc(id).update({ data: { status: 'rejected' } });
      this.sendNotification(req.sender._id, 'join_result', `房主拒绝了您的申请`, req.roomId);
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
            this.sendNotification(req.sender._id, 'join_result', `恭喜！房主同意您加入`, req.roomId);
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
    wx.showModal({ title: '申请人资料', content: `${u.nickName} | ${['男','女'][u.gender-1]}`, showCancel: false });
  }
})