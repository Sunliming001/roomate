const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    userInfo: { gender: 1, ageIndex: null },
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

  onChooseAvatar(e) { this.setData({ 'userInfo.avatarUrl': e.detail.avatarUrl }) },
  onNickNameChange(e) { this.setData({ 'userInfo.nickName': e.detail.value }) },
  bindInput(e) { this.setData({ 'userInfo.job': e.detail.value }) },
  setGender(e) { this.setData({ 'userInfo.gender': e.currentTarget.dataset.v }) },
  onAgeChange(e) { this.setData({ 'userInfo.ageIndex': parseInt(e.detail.value) }); },

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
    // 长度校验放在这里
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
  
  submit() {
    const u = this.data.userInfo;
    if(!u.avatarUrl) return wx.showToast({title:'请上传头像', icon:'none'});
    if(!u.nickName) return wx.showToast({title:'请填写昵称', icon:'none'});
    if(!u.job) return wx.showToast({title:'请填写职业', icon:'none'});
    if(u.ageIndex === null || u.ageIndex === undefined) return wx.showToast({title:'请选择年龄', icon:'none'});
    
    const selectedTags = Object.keys(this.data.tags);
    if (selectedTags.length === 0) return wx.showToast({title:'请至少选1个标签', icon:'none'});

    wx.showLoading({ title: '创建新身份...' });
    
    const finalData = {
      ...u,
      tagList: selectedTags,
      createTime: db.serverDate()
    };

    this.uploadAvatar(u.avatarUrl).then(cloudAvatarUrl => {
        finalData.avatarUrl = cloudAvatarUrl;
        db.collection('users').add({
            data: finalData
        }).then(res => {
            this.finishLogin({ ...finalData, _id: res._id });
        }).catch(err => {
            console.error(err);
            wx.hideLoading();
            wx.showToast({title: '注册失败', icon: 'none'});
        });
    }).catch(err => {
        console.error(err);
        wx.hideLoading();
        wx.showToast({title: '图片上传失败', icon: 'none'});
    });
  },

  uploadAvatar(filePath) {
      if (filePath.indexOf('cloud://') === 0) return Promise.resolve(filePath);
      return new Promise((resolve, reject) => {
          const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random()*1000) + '.png';
          wx.cloud.uploadFile({
              cloudPath: cloudPath, filePath: filePath,
              success: res => resolve(res.fileID), fail: err => reject(err)
          });
      });
  },

  finishLogin(userData) {
      wx.setStorageSync('my_user_info', userData);
      if (app.loginSuccess) {
          app.loginSuccess(userData);
      } else {
          app.globalData.userInfo = userData;
      }
      wx.hideLoading();
      wx.reLaunch({ url: '/pages/index/index' });
  }
})