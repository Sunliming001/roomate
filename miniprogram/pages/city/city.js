const app = getApp();

Page({
  data: {
    paddingTop: (app.globalData.statusBarHeight || 20) + 10,
    currentCity: '定位中...',
    hotCities: ['南京市', '上海市', '北京市', '广州市', '深圳市', '杭州市', '苏州市', '成都市', '武汉市', '重庆市', '西安市', '天津市']
  },

  onLoad(opts) {
    if(opts.current) {
      this.setData({ currentCity: opts.current });
    }
  },

  reLocate() {
    const that = this;
    this.setData({ currentCity: '定位中...' });
    wx.getLocation({
      type: 'gcj02',
      success(res) {
        that.setData({ currentCity: '南京市' }); // 模拟定位成功
        // 选中并返回
        app.globalData.selectedCity = '南京市';
        wx.navigateBack();
      },
      fail() {
        that.setData({ currentCity: '定位失败' });
      }
    });
  },

  selectCity(e) {
    const city = e.currentTarget.dataset.city;
    this.backWithCity(city);
  },

  onPickerChange(e) {
    const city = e.detail.value[1]; 
    this.backWithCity(city);
  },

  backWithCity(city) {
    app.globalData.selectedCity = city;
    wx.navigateBack();
  },

  goBack() {
    wx.navigateBack();
  }
})