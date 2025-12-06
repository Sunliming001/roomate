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
    
    // 将 wx.getLocation 替换为 wx.getFuzzyLocation
    wx.getFuzzyLocation({
      type: 'wgs84', // 模糊定位通常建议使用 wgs84
      success(res) {
        console.log('模糊定位成功', res);
        
        // 注意：getFuzzyLocation 返回的是经纬度，无法直接获得“南京市”这三个字。
        // 如果你想变成真实的城市名，需要接入腾讯地图SDK进行逆地址解析。
        // 这里为了保持你原有的逻辑，依然模拟定位到南京市。
        
        that.setData({ currentCity: '南京市' }); 
        
        // 选中并返回
        app.globalData.selectedCity = '南京市';
        wx.navigateBack();
      },
      fail(err) {
        console.error('定位失败', err);
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