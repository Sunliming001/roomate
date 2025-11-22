const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    userInfo: { gender: 1 },
    tags: {},
    tagOptions: ['作息规律', '爱干净', '不抽烟', '宠物友好', 'I人', 'E人', '喜欢做饭']
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
  submit() {
    const u = this.data.userInfo;
    if(!u.avatarUrl || !u.nickName) return wx.showToast({title:'请完善头像昵称', icon:'none'});
    
    wx.showLoading({ title: '注册中...' });
    
    const finalData = {
      ...u,
      tagList: Object.keys(this.data.tags),
      createTime: db.serverDate()
    };

    // 写入云端
    db.collection('users').add({
      data: finalData,
      success: res => {
        finalData._id = res._id;
        wx.setStorageSync('my_user_info', finalData); // 存入缓存
        app.globalData.userInfo = finalData;
        wx.hideLoading();
        // 跳转首页
        wx.reLaunch({ url: '/pages/index/index' });
      },
      fail: err => {
        console.error(err);
        wx.hideLoading();
        wx.showToast({title: '注册失败', icon:'none'});
      }
    });
  }
})