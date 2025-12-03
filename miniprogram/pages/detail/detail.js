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
    const user = wx.getStorageSync('my_user_info');
    if (!user) {
        wx.redirectTo({ url: `/pages/login/login?redirectId=${this.roomId}` });
        return;
    }
    this.loadRoomDetail();
  },

  onPullDownRefresh() {
    this.loadRoomDetail(() => {
      this.checkFavStatus();
      wx.stopPullDownRefresh();
    });
  },

  goBack() { 
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },

  loadRoomDetail(cb) {
    db.collection('rooms').doc(this.roomId).get({
      success: res => {
        const d = res.data;
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

    let petText = '';
    const pets = d.pets || [];
    if (pets.includes('none')) {
        petText = '🚫 不接受养宠';
    } else if (pets.length > 0) {
        const map = { 'cat': '🐱 接受猫', 'dog': '🐶 接受狗' };
        const labels = pets.filter(k => k !== 'none').map(k => map[k] || k);
        petText = labels.join('  ');
    } else {
        petText = '⭕ 宠物要求不限';
    }
    d.petDisplay = petText;

    // --- 1. 处理入住者信息 ---
    d.rooms.forEach(r => {
      if(r.status==1) {
         if(r.isMeIndex==0) { 
            r.occupantDisplay = {
               gender: d.publisher.gender == 2 ? 1 : 0, 
               age: d.publisher.ageIndex != null ? (d.publisher.ageIndex + 18) + '岁' : '未知',
               job: d.publisher.job || '未知'
            };
         } else { 
            r.occupantDisplay = {
               gender: r.occupant.genderIndex, 
               age: ['00后','95后','90后','80后','其他'].includes(r.occupant.ageIndex) 
                    ? r.occupant.ageIndex // 兼容旧数据字符串
                    : (r.occupant.ageIndex != null ? (parseInt(r.occupant.ageIndex) + 18) + '岁' : '未知'),
               job: r.occupant.job || '保密'
            };
         }
      }
    });

    // --- 2. 处理房主详细信息 (性别、年龄、职业、标签) ---
    d.publisherDisplay = {
        genderStr: ['未知', '男', '女'][d.publisher.gender],
        ageStr: d.publisher.ageIndex != null ? (d.publisher.ageIndex + 18) + '岁' : '未知',
        job: d.publisher.job || '未知',
        tags: d.publisher.tagList || []
    };

    this.setData({ info: d, gallery });
  },
  
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
    const me = this.data.userInfo;
    const owner = this.data.info.publisher;
    const roommates = this.data.info.memberIds || [];
    if(me._id === owner._id) return wx.switchTab({ url: '/pages/message/message' });

    wx.showLoading({ title: '进入会话...' });
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
      },
      fail: () => wx.hideLoading()
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

  onShareAppMessage() {
    return {
      title: `【友邻】${this.data.info.community} 招室友！`,
      path: `/pages/detail/detail?id=${this.roomId}`,
      imageUrl: this.data.info.cover
    }
  },
  openShareModal() { this.setData({ showShareModal: true }); },
  closeShareModal() { this.setData({ showShareModal: false }); },
  handleShareTo(e) {
    const appName = e.currentTarget.dataset.app;
    wx.setClipboardData({
      data: `【友邻】${this.data.info.community} 招室友！pages/detail/detail?id=${this.roomId}`,
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

  openJoinModal() {
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
  },
  preventBubble() {}
})