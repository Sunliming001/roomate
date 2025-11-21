const app = getApp();
const mock = require('../../utils/mock.js');

Page({
  data: {
    paddingTop: app.globalData.statusBarHeight + 10, // 动态计算顶部距离
    // ... 其他原有 data ...
    formData: {
      // ... 保持原有结构 ...
      community: '',
      layout: { room: 0, hall: 1, toilet: 1 },
      rooms: [],
      photos: [], // 确保有图片数组
    }
  },
  // ... 其他函数保持不变 ...
  
  // 修复：发布逻辑确保刷新首页
  submit() {
    const d = this.data.formData;
    if (!d.community || !d.layout.room) {
      return wx.showToast({ title: '请填写小区和户型', icon: 'none' });
    }
    mock.addRoom(d); // 存入缓存
    
    wx.showToast({ title: '发布成功', icon: 'success' });
    
    // 延迟跳转，给用户看提示的时间
    setTimeout(() => {
      // 重点：跳转回首页
      wx.switchTab({
        url: '/pages/index/index',
        success: function (e) {
          // 强制刷新首页数据
          var page = getCurrentPages().pop();
          if (page == undefined || page == null) return;
          page.onShow();
        }
      });
    }, 1500);
  }
})