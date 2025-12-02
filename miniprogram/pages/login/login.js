const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    userInfo: { gender: 1 },
    tags: {},
    tagOptions: [
      '作息规律', '爱干净', '不抽烟', '宠物友好', 
      'I人', 'E人', '社牛', '社恐',
      '喜欢做饭', '夜猫子', '早睡早起', '安静',
      '二次元', '游戏开黑', '健身达人', '追剧',
      '音乐', '摄影', '旅行', '极简主义'
    ],
    extraTags: [],
    inputTagVal: '',
    // 新增：用于存储这就跳转的目标ID
    redirectId: null 
  },

  // --- 核心修复：接收重定向参数 ---
  onLoad(options) {
    if (options.redirectId) {
        console.log('检测到重定向需求，目标房间ID:', options.redirectId);
        this.setData({ redirectId: options.redirectId });
    }
  },

  onChooseAvatar(e) { this.setData({ 'userInfo.avatarUrl': e.detail.avatarUrl }) },
  onNickNameChange(e) { this.setData({ 'userInfo.nickName': e.detail.value }) },
  bindInput(e) { this.setData({ [`userInfo.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  setGender(e) { this.setData({ 'userInfo.gender': e.currentTarget.dataset.v }) },
  
  toggleTag(e) {
    const t = e.currentTarget.dataset.tag;
    const tags = this.data.tags;
    
    if (tags[t]) {
      delete tags[t];
    } else {
       if (Object.keys(tags).length >= 4) {
         return wx.showToast({ title: '最多选4个', icon: 'none' });
       }
       tags[t] = true;
    }
    this.setData({ tags });
  },

  onTagInput(e) { this.setData({ inputTagVal: e.detail.value }) },

  addCustomTag() {
    const val = this.data.inputTagVal.trim();
    if (!val) return;
    if (val.length > 6) return wx.showToast({ title: '标签太长', icon: 'none' });
    
    const tags = this.data.tags;
    if (!tags[val] && Object.keys(tags).length >= 4) {
        return wx.showToast({ title: '最多选4个', icon: 'none' });
    }
    
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
    if(!u.avatarUrl || !u.nickName) return wx.showToast({title:'请完善头像昵称', icon:'none'});
    
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
        
        // 直接创建新用户
        db.collection('users').add({
            data: finalData
        }).then(res => {
            this.finishLogin({ ...finalData, _id: res._id });
        }).catch(err => {
            console.error('注册失败', err);
            wx.hideLoading();
            wx.showToast({title: '注册失败', icon: 'none'});
        });

    }).catch(err => {
        console.error('头像上传失败', err);
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

  // --- 核心修复：登录完成后的跳转逻辑 ---
  finishLogin(userData) {
      wx.setStorageSync('my_user_info', userData);
      if (app.loginSuccess) {
          app.loginSuccess(userData);
      } else {
          app.globalData.userInfo = userData;
      }
      
      wx.hideLoading();

      // 判断去向
      if (this.data.redirectId) {
          // 如果有重定向ID，说明是点分享进来的，跳回详情页
          wx.redirectTo({
              url: `/pages/detail/detail?id=${this.data.redirectId}`
          });
      } else {
          // 正常登录，去首页
          wx.reLaunch({ url: '/pages/index/index' });
      }
  }
})