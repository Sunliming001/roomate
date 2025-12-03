const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    paddingTop: (app.globalData?.statusBarHeight || 20) + 10,
    userInfo: {},
    tags: {},
    tagOptions: [
      '作息规律', '爱干净', '不抽烟', '宠物友好', 
      'I人', 'E人', '社牛', '社恐',
      '喜欢做饭', '夜猫子', '早睡早起', '安静',
      '二次元', '游戏开黑', '健身达人', '追剧',
      '音乐', '摄影', '旅行', '极简主义'
    ],
    ageOptions: Array.from({length: 43}, (_, i) => (i + 18) + '岁'),
    extraTags: [], 
    inputTagVal: ''
  },

  onLoad() {
    const u = wx.getStorageSync('my_user_info') || {};
    const tagsMap = {};
    const extras = [];
    if (u.tagList) {
      u.tagList.forEach(t => {
        tagsMap[t] = true;
        if (!this.data.tagOptions.includes(t)) extras.push(t);
      });
    }
    this.setData({ userInfo: u, tags: tagsMap, extraTags: extras });
  },

  onChooseAvatar(e) { this.setData({ 'userInfo.avatarUrl': e.detail.avatarUrl }) },
  onNickNameChange(e) { this.setData({ 'userInfo.nickName': e.detail.value }) },
  bindInput(e) { this.setData({ [`userInfo.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  onGenderChange(e) { this.setData({ 'userInfo.gender': parseInt(e.detail.value) }) },
  onAgeChange(e) { this.setData({ 'userInfo.ageIndex': parseInt(e.detail.value) }) },

  toggleTag(e) {
    const t = e.currentTarget.dataset.tag;
    const tags = this.data.tags;
    if (tags[t]) delete tags[t];
    else {
       if (Object.keys(tags).length >= 4) return wx.showToast({ title: '最多选4个', icon: 'none' });
       tags[t] = true;
    }
    this.setData({ tags });
  },

  onTagInput(e) { this.setData({ inputTagVal: e.detail.value }) },

  addCustomTag() {
    const val = this.data.inputTagVal.trim();
    if (!val) return;
    // 长度校验
    if (val.length > 6) return wx.showToast({ title: '标签太长', icon: 'none' });
    
    const tags = this.data.tags;
    if (!tags[val] && Object.keys(tags).length >= 4) return wx.showToast({ title: '最多选4个', icon: 'none' });
    
    tags[val] = true; 
    if (!this.data.tagOptions.includes(val) && !this.data.extraTags.includes(val)) {
       const ex = this.data.extraTags;
       ex.push(val);
       this.setData({ extraTags: ex });
    }
    this.setData({ tags, inputTagVal: '' });
  },

  save() {
    const u = this.data.userInfo;
    u.tagList = Object.keys(this.data.tags);
    
    if (!u.nickName) return wx.showToast({title:'昵称不能为空', icon:'none'});
    if (!u.job) return wx.showToast({title:'职业不能为空', icon:'none'});
    if (u.ageIndex === null || u.ageIndex === undefined) return wx.showToast({title:'年龄不能为空', icon:'none'});
    if (u.tagList.length === 0) return wx.showToast({title:'请至少选1个标签', icon:'none'});
    
    wx.showLoading({title: '保存中'});
    
    this.uploadAvatar(u.avatarUrl).then(cloudUrl => {
        u.avatarUrl = cloudUrl;
        db.collection('users').doc(u._id).update({
          data: {
            avatarUrl: u.avatarUrl,
            nickName: u.nickName,
            job: u.job,
            gender: u.gender,
            ageIndex: u.ageIndex,
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
    });
  },

  uploadAvatar(filePath) {
      if (!filePath || filePath.indexOf('cloud://') === 0) return Promise.resolve(filePath);
      return new Promise((resolve) => {
          const cloudPath = 'avatars/' + Date.now() + '.png';
          wx.cloud.uploadFile({
              cloudPath: cloudPath, filePath: filePath,
              success: res => resolve(res.fileID),
              fail: () => resolve(filePath) 
          });
      });
  }
})