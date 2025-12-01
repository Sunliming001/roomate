const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight,
    info: {},
    gallery: [],
    isFav: false,
    showJoinModal: false,
    showShareModal: false,
    userInfo: null
  },

  onShow() {
    this.setData({ userInfo: wx.getStorageSync('my_user_info') });
    if(this.roomId) this.checkFavStatus();
  },

  onLoad(opts) {
    this.roomId = opts.id;
    this.loadRoomDetail();
  },

  onPullDownRefresh() {
    this.loadRoomDetail(() => {
      this.checkFavStatus();
      wx.stopPullDownRefresh();
    });
  },

  loadRoomDetail(cb) {
    db.collection('rooms').doc(this.roomId).get({
      success: res => {
        const d = res.data;
        // 确保 memberIds 存在 (兼容旧数据)
        if (!d.memberIds) d.memberIds = [];
        this.processData(d);
        if(cb) cb();
      },
      fail: () => { if(cb) cb(); }
    });
  },

  processData(d) {
    const gallery = [];
    if (d.rooms) {
      d.rooms.forEach(r => {
        if(r.photos && r.photos.length) r.photos.forEach(p => gallery.push({ url: p, name: r.name }));
      });
    }
    if(gallery.length==0) gallery.push({ url: '/images/default-room.png', name: '暂无照片' });

    d.rooms.forEach(r => {
      if(r.status==1) {
         if(r.isMeIndex==0) { 
            r.occupantDisplay = {
               gender: d.publisher.gender == 2 ? 1 : 0, 
               age: '房主',
               job: d.publisher.job || '未知'
            };
         } else { 
            r.occupantDisplay = {
               gender: r.occupant.genderIndex, 
               age: ['00后','95后','90后','80后','其他'][r.occupant.ageIndex] || '未知',
               job: r.occupant.job || '保密'
            };
         }
      }
    });
    this.setData({ info: d, gallery });
  },

  goBack() { wx.navigateBack(); },
  
  previewImg(e) {
      const urls = this.data.gallery.map(i => i.url);
      wx.previewImage({ current: e.currentTarget.dataset.url, urls });
  },

  checkFavStatus() {
    if (!this.data.userInfo) return;
    db.collection('favorites').where({
      roomId: this.roomId,
      userId: this.data.userInfo._id
    }).count().then(res => {
      this.setData({ isFav: res.total > 0 });
    });
  },

  handleFav() {
    if (!this.data.userInfo) return wx.navigateTo({ url: '/pages/login/login' });
    const me = this.data.userInfo;
    const newFavStatus = !this.data.isFav;
    this.setData({ isFav: newFavStatus });

    if (!newFavStatus) {
      db.collection('favorites').where({ roomId: this.roomId, userId: me._id }).remove()
        .then(() => db.collection('rooms').doc(this.roomId).update({ data: { favCount: _.inc(-1) } }))
        .catch(() => this.setData({ isFav: true }));
    } else {
      db.collection('favorites').add({
        data: { userId: me._id, roomId: this.roomId, createTime: db.serverDate() }
      }).then(() => {
        db.collection('rooms').doc(this.roomId).update({ data: { favCount: _.inc(1) } });
        if (me._id !== this.data.info.publisher._id) {
          db.collection('notifications').add({
            data: { type: 'fav', targetUserId: this.data.info.publisher._id, sender: me, content: '收藏了你的房源', community: this.data.info.community, roomId: this.roomId, createTime: db.serverDate(), isRead: false }
          });
        }
        wx.showToast({ title: '已收藏', icon: 'none' });
      }).catch(() => {
        this.setData({ isFav: false });
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
    }
  },

  // --- 核心修复：聊天群组逻辑 ---
  handleChat() {
    if (!this.data.userInfo) return wx.navigateTo({ url: '/pages/login/login' });
    
    const me = this.data.userInfo;
    const owner = this.data.info.publisher;
    const roommates = this.data.info.memberIds || [];

    // 1. 组装群成员：房主 + 我 + 所有已入住室友
    // 使用 Set 去重 (防止我自己也是室友，或者房主也是室友导致ID重复)
    const memberSet = new Set([owner._id, me._id, ...roommates]);
    const allMembers = Array.from(memberSet);

    wx.showLoading({ title: '进入会话...' });
    
    // 2. 查找我是否已经在这个房间里有过聊天记录
    db.collection('chats').where({ 
        roomId: this.roomId,
        members: me._id 
    }).get({
      success: res => {
        if (res.data.length > 0) {
          const chat = res.data[0];
          
          // 3. 这是一个已存在的会话，检查成员是否需要更新
          // (例如：上次聊的时候还没室友，现在有室友了，要把室友拉进来)
          // 简单的做法是：每次点击都更新一次 members 列表，确保是最新的
          
          db.collection('chats').doc(chat._id).update({
             data: {
                members: allMembers
             }
          }).then(() => {
             // 甚至可以自动发一条系统消息提示新成员加入，这里先省略
             this.navToChat(chat._id, this.data.info.community);
          });
          
        } else {
          // 4. 我从没聊过，创建新群聊
          this.createChat(allMembers);
        }
      },
      fail: err => {
          console.error(err);
          wx.hideLoading();
          wx.showToast({title: '网络异常', icon: 'none'});
      }
    });
  },

  createChat(members) {
    db.collection('chats').add({
      data: {
        roomId: this.roomId, 
        roomName: this.data.info.community + " 交流群",
        members: members, 
        // 初始未读：除了我之外的所有人
        unreadMembers: members.filter(id => id !== this.data.userInfo._id), 
        lastMessage: '群聊已创建', 
        updateTime: db.serverDate(),
        targetAvatar: this.data.info.cover || '' 
      },
      success: res => { 
          this.navToChat(res._id, this.data.info.community + " 交流群"); 
      }
    });
  },

  navToChat(chatId, title) {
    wx.hideLoading();
    wx.navigateTo({ url: `/pages/chat/chat?id=${chatId}&name=${title}` });
  },

  // --- 分享相关 ---
  onShareAppMessage() {
    const title = `【友邻找室友】${this.data.info.community} 招室友啦！`;
    return {
      title: title,
      path: `/pages/detail/detail?id=${this.roomId}`,
      imageUrl: this.data.info.cover
    }
  },
  openShareModal() { this.setData({ showShareModal: true }); },
  closeShareModal() { this.setData({ showShareModal: false }); },
  handleShareTo(e) {
    const appName = e.currentTarget.dataset.app;
    const content = `【友邻】${this.data.info.community} 招室友！pages/detail/detail?id=${this.roomId}`;
    wx.setClipboardData({
      data: content,
      success: () => {
        this.closeShareModal();
        wx.showModal({ title: '口令已复制', content: `请打开 ${appName} 粘贴`, showCancel: false });
      }
    });
  },
  handleCopyLink() {
    wx.setClipboardData({
      data: `pages/detail/detail?id=${this.roomId}`,
      success: () => { this.closeShareModal(); wx.showToast({ title: '已复制' }); }
    });
  },

  // --- 加入逻辑 ---
  openJoinModal() {
    if (!this.data.userInfo) return wx.navigateTo({ url: '/pages/login/login' });
    if (this.data.info.publisher._id === this.data.userInfo._id) return wx.showToast({title: '不能加入自己的房源', icon: 'none'});
    this.setData({ showJoinModal: true });
  },
  closeJoinModal() { this.setData({ showJoinModal: false }); },
  confirmJoin(e) {
    const { idx, name } = e.currentTarget.dataset;
    const me = this.data.userInfo;
    wx.showLoading({ title: '发送申请...' });
    db.collection('notifications').add({
      data: {
        type: 'join_req', targetUserId: this.data.info.publisher._id, sender: me,
        roomId: this.roomId, roomIdx: idx, roomName: name, community: this.data.info.community,
        status: 'pending', createTime: db.serverDate(), isRead: false
      },
      success: () => {
        wx.hideLoading(); this.closeJoinModal();
        wx.showModal({ title: '申请已发送', content: '请等待房主审核', showCancel: false });
      },
      fail: () => { wx.hideLoading(); wx.showToast({title:'失败', icon:'none'}); }
    });
  }
})