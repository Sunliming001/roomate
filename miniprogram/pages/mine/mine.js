const app = getApp();
const mock = require('../../utils/mock.js');

Page({
  data: {
    paddingTop: app.globalData.statusBarHeight + 10,
    user: {},
    stats: {},
    // 当前选中的模块
    activeTab: 'pub', // 默认显示发布
    listData: []
  },

  onShow() {
    // 每次进入重新拉取最新用户信息
    const user = wx.getStorageSync('my_user_info');
    this.setData({ user });
    // ... 拉取统计数据 ...
  },
  goEdit() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
  },

  // 点击切换模块
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.loadList(tab);
  },

  loadList(tab) {
    let data = [];
    if (tab === 'pub') data = mock.getMyPublish();
    if (tab === 'fav') data = mock.getMyFavs();
    if (tab === 'contract') data = mock.getMyContracts();
    
    this.setData({ 
      activeTab: tab,
      listData: data 
    });
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` });
  }
})