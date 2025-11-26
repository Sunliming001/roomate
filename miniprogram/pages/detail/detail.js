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
    showShareModal: false, // 控制分享弹窗
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

  // --- 核心：原生微信分享设置 ---
  onShareAppMessage() {
    const title = `【友邻找室友】${this.data.info.community} 招室友啦！`;
    const imageUrl = this.data.info.cover; // 使用房源封面
    return {
      title: title,
      path: `/pages/detail/detail?id=${this.roomId}`, // 别人点开后跳回这里
      imageUrl: imageUrl
    }
  },

  // --- 分享交互逻辑 ---
  openShareModal() { this.setData({ showShareModal: true }); },
  closeShareModal() { this.setData({ showShareModal: false }); },

  // 复制链接/口令
  handleShareTo(e) {
    const appName = e.currentTarget.dataset.app;
    const content = `【友邻·找室友】我在${this.data.info.community}发现了一个很棒的房子！快来看看：pages/detail/detail?id=${this.roomId} (请复制到微信打开)`;
    
    wx.setClipboardData({
      data: content,
      success: () => {
        this.closeShareModal();
        wx.showModal({
          title: '口令已复制',
          content: `请打开 ${appName} 粘贴分享。由于平台限制，无法直接跳转。`,
          showCancel: false,
          confirmText: '知道了'
        });
      }
    });
  },

  handleCopyLink() {
    const link = `pages/detail/detail?id=${this.roomId}`;
    wx.setClipboardData({
      data: link,
      success: () => {
        this.closeShareModal();
        wx.showToast({ title: '链接已复制', icon: 'success' });
      }
    });
  },

  // --- 原有逻辑保持不变 ---
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
    wx.showLoading({ title: '进入会话...' });
    let members = [owner._id, me._id]; 
    db.collection('chats').where({ roomId: this.roomId }).get({
      success: res => {
        if (res.data.length > 0) {
          const chat = res.data[0];
          if (!chat.members.includes(me._id)) {
             db.collection('chats').doc(chat._id).update({ data: { members: _.addToSet(me._id) } });
          }
          this.navToChat(chat._id, this.data.info.community);
        } else {
          this.createChat(members);
        }
      }
    });
  },
  createChat(members) {
    db.collection('chats').add({
      data: {
        roomId: this.roomId, roomName: this.data.info.community + " 交流群",
        members: members, lastMessage: '群聊已创建', updateTime: db.serverDate(),
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