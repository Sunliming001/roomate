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

  // --- 空函数：用于阻止事件冒泡 ---
  preventBubble() {
    // 这是一个空函数，专门用于 catchtap
  },

  onShareAppMessage() {
    const title = `【友邻找室友】${this.data.info.community} 招室友啦！`;
    const imageUrl = this.data.info.cover;
    return {
      title: title,
      path: `/pages/detail/detail?id=${this.roomId}`,
      imageUrl: imageUrl
    }
  },

  // --- 分享弹窗控制 ---
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
      success: () => {
        this.closeShareModal();
        wx.showToast({ title: '已复制' });
      }
    });
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

  handleChat() {
    if (!this.data.userInfo) return wx.navigateTo({ url: '/pages/login/login' });
    const me = this.data.userInfo;
    const owner = this.data.info.publisher;
    
    // 自己不能跟自己聊
    if(me._id === owner._id) {
         return wx.switchTab({ url: '/pages/message/message' });
    }

    wx.showLoading({ title: '进入会话...' });
    
    // 获取已入住成员
    const roommates = this.data.info.memberIds || [];
    const memberSet = new Set([owner._id, me._id, ...roommates]);
    const allMembers = Array.from(memberSet);

    db.collection('chats').where({ roomId: this.roomId, members: me._id }).get({
      success: res => {
        if (res.data.length > 0) {
          const chat = res.data[0];
          db.collection('chats').doc(chat._id).update({ data: { members: allMembers } });
          this.navToChat(chat._id, this.data.info.community);
        } else {
          this.createChat(allMembers);
        }
      }
    });
  },

  createChat(members) {
    db.collection('chats').add({
      data: {
        roomId: this.roomId, roomName: this.data.info.community + " 交流群",
        members: members, 
        unreadMembers: members.filter(id => id !== this.data.userInfo._id), 
        lastMessage: '群聊已创建', updateTime: db.serverDate(),
        targetAvatar: this.data.info.cover || '' 
      },
      success: res => { this.navToChat(res._id, this.data.info.community + " 交流群"); }
    });
  },

  navToChat(chatId, title) {
    wx.hideLoading();
    wx.navigateTo({ url: `/pages/chat/chat?id=${chatId}&name=${title}` });
  },

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