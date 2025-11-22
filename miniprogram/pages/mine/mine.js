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
    const user = mock.getCurrentUser();
    if(!user) return wx.navigateTo({ url: '/pages/login/login' });
    
    this.setData({ 
      user,
      stats: {
        pub: mock.getMyPublish().length,
        fav: mock.getMyFavs().length,
        contract: mock.getMyContracts().length
      }
    });
    // 刷新当前列表
    this.loadList(this.data.activeTab);
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