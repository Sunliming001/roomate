const app = getApp();
const db = wx.cloud.database(); // 获取数据库引用

Page({
  data: {
    userInfo: { gender: 1 },
    tags: {},
    tagOptions: ['爱干净', '作息规律', '不抽烟', '宠物友好', 'I人', 'E人', '好相处']
  },
  onChooseAvatar(e) { this.setData({ 'userInfo.avatarUrl': e.detail.avatarUrl }) },
  onNickNameChange(e) { this.setData({ 'userInfo.nickName': e.detail.value }) },
  bindInput(e) { this.setData({ 'userInfo.job': e.detail.value }) },
  setGender(e) { this.setData({ 'userInfo.gender': e.currentTarget.dataset.v }) },
  toggleTag(e) {
    const t = e.currentTarget.dataset.tag;
    const tags = this.data.tags;
    tags[t] ? delete tags[t] : tags[t] = true;
    this.setData({ tags });
  },

  // 提交到云数据库
  submitToCloud() {
    const u = this.data.userInfo;
    if(!u.avatarUrl || !u.nickName) return wx.showToast({title:'请完善信息', icon:'none'});
    
    const finalData = {
      ...u,
      tagList: Object.keys(this.data.tags),
      createTime: db.serverDate() // 服务器时间
    };

    wx.showLoading({ title: '注册中...' });

    // 1. 存入 Users 集合
    db.collection('users').add({
      data: finalData,
      success: res => {
        // 2. 存入本地缓存，方便后续使用
        finalData._id = res._id; // 记录云端ID
        wx.setStorageSync('my_user_info', finalData);
        app.globalData.userInfo = finalData;
        
        wx.hideLoading();
        wx.showToast({ title: '欢迎加入' });
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1000);
      },
      fail: err => {
        console.error(err);
        wx.hideLoading();
        wx.showToast({ title: '注册失败，请重试', icon: 'none' });
      }
    });
  }
})