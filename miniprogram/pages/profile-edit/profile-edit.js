const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    paddingTop: (app.globalData?.statusBarHeight || 20) + 10,
    userInfo: {},
    tags: {},
    tagOptions: ['作息规律', '爱干净', '不抽烟', '宠物友好', 'I人', 'E人', '喜欢做饭', '夜猫子']
  },
  onLoad() {
    const u = wx.getStorageSync('my_user_info') || {};
    const tagsMap = {};
    if(u.tagList) u.tagList.forEach(t => tagsMap[t] = true);
    this.setData({ userInfo: u, tags: tagsMap });
  },
  onChooseAvatar(e) { this.setData({ 'userInfo.avatarUrl': e.detail.avatarUrl }) },
  onNickNameChange(e) { this.setData({ 'userInfo.nickName': e.detail.value }) },
  bindInput(e) { this.setData({ [`userInfo.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  onGenderChange(e) { this.setData({ 'userInfo.gender': parseInt(e.detail.value) }) },
  toggleTag(e) {
    const t = e.currentTarget.dataset.tag;
    const tags = this.data.tags;
    tags[t] ? delete tags[t] : tags[t] = true;
    this.setData({ tags });
  },
  save() {
    wx.showLoading({title: '保存中'});
    const u = this.data.userInfo;
    u.tagList = Object.keys(this.data.tags);
    
    // 更新云端
    db.collection('users').doc(u._id).update({
      data: {
        avatarUrl: u.avatarUrl,
        nickName: u.nickName,
        job: u.job,
        gender: u.gender,
        tagList: u.tagList
      },
      success: res => {
        wx.setStorageSync('my_user_info', u);
        app.globalData.userInfo = u;
        wx.hideLoading();
        wx.showToast({title: '保存成功'});
        setTimeout(() => wx.navigateBack(), 1000);
      }
    });
  }
})