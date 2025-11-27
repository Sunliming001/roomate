const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    paddingTop: app.globalData.statusBarHeight + 10,
    user: {},
    stats: { pub: 0, fav: 0, join: 0 },
    activeTab: 'pub', 
    listData: []
  },

  onShow() {
    const user = wx.getStorageSync('my_user_info');
    if(!user) return wx.navigateTo({ url: '/pages/login/login' });
    this.setData({ user });
    this.loadAllData();
    app.checkTabBarBadge();
  },

  onPullDownRefresh() {
    this.loadAllData(() => wx.stopPullDownRefresh());
  },

  goEdit() { wx.navigateTo({ url: '/pages/profile-edit/profile-edit' }); },

  // --- 核心修复：通过全局变量传参跳转到 TabBar 页面 ---
  goEditRoom(e) {
    const id = e.currentTarget.dataset.id;
    console.log('点击修改房源:', id);
    
    // 1. 设置全局变量
    app.globalData.editRoomId = id;
    
    // 2. 切换到发布页 Tab
    wx.switchTab({
      url: '/pages/publish/publish'
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.loadList(tab);
  },

  loadAllData(cb) {
    const user = this.data.user;
    const p1 = db.collection('rooms').where({ 'publisher._id': user._id }).count();
    const p2 = db.collection('favorites').where({ userId: user._id }).count();
    const p3 = db.collection('rooms').where({ memberIds: user._id }).count();

    Promise.all([p1, p2, p3]).then(res => {
      this.setData({
        stats: { pub: res[0].total, fav: res[1].total, join: res[2].total }
      });
      this.loadList(this.data.activeTab);
      if(cb) cb();
    });
  },

  loadList(tab) {
    const user = this.data.user;
    wx.showLoading({ title: '加载中' });

    if (tab === 'pub') {
      db.collection('rooms').where({ 'publisher._id': user._id }).orderBy('createTime', 'desc').get().then(res => {
        this.processList(res.data);
        wx.hideLoading();
      });
    } 
    else if (tab === 'join') {
      db.collection('rooms').where({ memberIds: user._id }).orderBy('createTime', 'desc').get().then(res => {
        let list = res.data;
        list = list.filter(item => item.publisher._id !== user._id);
        this.processList(list);
        wx.hideLoading();
      });
    } 
    else if (tab === 'fav') {
      db.collection('favorites').where({ userId: user._id }).get().then(res => {
        const roomIds = res.data.map(i => i.roomId);
        if (roomIds.length === 0) {
          this.processList([]); 
          wx.hideLoading();
          return;
        }
        db.collection('rooms').where({ _id: _.in(roomIds) }).get().then(roomsRes => {
          this.processList(roomsRes.data);
          wx.hideLoading();
        });
      });
    }
  },

  processList(list) {
    list.forEach(item => {
        let cover = '';
        const vacantRoom = item.rooms.find(r => r.status == 0 && r.photos && r.photos.length > 0);
        if (vacantRoom) cover = vacantRoom.photos[0];
        else {
           const anyRoom = item.rooms.find(r => r.photos && r.photos.length > 0);
           cover = anyRoom ? anyRoom.photos[0] : '/images/default-room.png';
        }
        item.cover = cover;
        const prices = item.rooms.filter(r => r.status == 0).map(r => parseFloat(r.price)||0);
        item.minPrice = prices.length ? Math.min(...prices) : '暂无';
    });
    this.setData({ listData: list });
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` });
  }
})