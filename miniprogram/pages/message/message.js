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

  // 临时ID防止闪烁
  justClickedChatId: null,

  onShow() {
    console.log('[调试-消息页] onShow 触发');
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh());
  },

  loadData(cb) {
    const p1 = this.loadChats();
    const p2 = this.loadNotifications();
    Promise.all([p1, p2]).then(() => {
      this.updateTabBarStatus();
      if (cb) cb();
    });
  },

  updateTabBarStatus() {
    const hasChat = this.data.chatList.some(item => item.hasUnread);
    const hasNotif = this.data.notifList.some(item => !item.isRead);
    
    this.setData({
        hasUnreadChat: hasChat,
        hasUnreadNotif: hasNotif
    });

    if (hasChat || hasNotif) {
        wx.showTabBarRedDot({ index: 1 });
    } else {
        wx.hideTabBarRedDot({ index: 1 });
    }
  },

  switchTab(e) {
    this.setData({ curTab: e.currentTarget.dataset.idx });
  },

  loadChats() {
    const user = wx.getStorageSync('my_user_info');
    return db.collection('chats').where({
        members: user._id
      })
      .orderBy('updateTime', 'desc').get()
      .then(res => {
        console.log('[调试-加载聊天] 数据库返回:', res.data.length);
        
        const list = res.data.map(i => {
          // 1. 安全获取未读数组
          let rawUnread = i.unreadMembers || [];
          
          // 2. 判断是否未读
          let isUnread = rawUnread.includes(user._id);
          
          // 3. 本地防闪烁：如果该ID是刚刚点击过的，强制设为已读
          if (i._id === this.justClickedChatId) {
             isUnread = false;
          }

          // 调试日志
          if (isUnread) {
              console.warn(`[调试] 发现红点: ${i.roomName}, 未读列表:`, rawUnread);
          }
          
          return {
            ...i,
            timeStr: '刚刚', 
            targetAvatar: i.targetAvatar || '/images/default-room.png',
            hasUnread: isUnread, 
            lastMessage: i.lastMessage || '[图片]' 
          };
        });

        this.setData({ chatList: list });
        
        // 稍微延迟清空临时ID
        if (this.justClickedChatId) {
            setTimeout(() => { this.justClickedChatId = null; }, 800);
        }
      });
  },

  loadNotifications() {
    const user = wx.getStorageSync('my_user_info');
    return db.collection('notifications').where({ targetUserId: user._id })
      .orderBy('createTime', 'desc').get()
      .then(res => {
        const list = res.data.map(i => {
          let title = '系统通知', icon = '🔔';
          if (i.type == 'fav') { title = '收到了新收藏'; icon = '⭐'; }
          if (i.type == 'join_result') { title = '申请结果通知'; icon = '📝'; }
          if (i.type == 'new_member') { title = '新室友加入'; icon = '👋'; }
          if (i.type == 'completed') { title = '招募完成'; icon = '🎉'; }
          
          return { ...i, title, icon, timeStr: '刚刚' };
        });
        this.setData({ notifList: list });
      });
  },

  goChat(e) {
    const { id, name } = e.currentTarget.dataset;
    const user = wx.getStorageSync('my_user_info');

    console.log('[调试-点击] 进入聊天:', name);
    
    // 1. 记录ID，防止返回时红点复活
    this.justClickedChatId = id;

    // 2. 本地立即消红点
    const idx = this.data.chatList.findIndex(c => c._id === id);
    if (idx > -1) {
        const upKey = `chatList[${idx}].hasUnread`;
        this.setData({ [upKey]: false });
        this.updateTabBarStatus(); // 更新底部Tab状态
    }

    // 3. 数据库异步消红点
    db.collection('chats').doc(id).update({
      data: { unreadMembers: _.pull(user._id) }
    }).then(() => {
        console.log('[调试] 数据库红点消除请求成功');
    }).catch(console.error);

    // 4. 跳转
    wx.navigateTo({
      url: `/pages/chat/chat?id=${id}&name=${name}`
    });
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
            data: {
               rooms: rooms,
               status: newStatus,
               memberIds: _.addToSet(req.sender._id)
            }
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
    wx.showModal({
      title: '申请人资料',
      content: `昵称: ${u.nickName}\n性别: ${['男','女'][u.gender-1]}\n职业: ${u.job}\n标签: ${u.tagList ? u.tagList.join(',') : '无'}`,
      showCancel: false
    });
  }
})