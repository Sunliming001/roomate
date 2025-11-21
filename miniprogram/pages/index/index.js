const app = getApp();
const mock = require('../../utils/mock.js');

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight,
    navHeight: 44,
    currentCity: '南京市',
    searchPlaceholder: '万科翡翠花园',
    leftList: [],
    rightList: []
  },

  onShow() {
    // ------------------------------------------------------
    // 1. 核心修复：检查用户是否登录
    // ------------------------------------------------------
    const user = mock.getCurrentUser();
    if (!user) {
      // 如果没拿到用户信息，强制跳转到登录页
      wx.reLaunch({ url: '/pages/login/login' });
      return; // 阻止后续代码执行
    }

    // 2. 如果已登录，才加载数据
    this.loadData();
  },

  // ... 其他函数 (onCityChange, openMapSearch, loadData, goDetail) 保持不变 ...
  
  onCityChange(e) {
    const city = e.detail.value[1];
    this.setData({ currentCity: city });
    this.loadData();
  },

  openMapSearch() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        that.setData({ searchPlaceholder: res.name || '已选择位置' });
        wx.showToast({ title: '正在搜索...', icon: 'loading' });
      }
    });
  },

  loadData() {
    const list = mock.getList();
    const processedList = list.map(item => {
      const vacantCount = item.rooms ? item.rooms.filter(r => r.status === 0).length : 0;
      return { ...item, vacantCount };
    });

    const left = [];
    const right = [];
    processedList.forEach((item, index) => {
      if (index % 2 === 0) left.push(item);
      else right.push(item);
    });

    this.setData({ leftList: left, rightList: right });
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` });
  }
})