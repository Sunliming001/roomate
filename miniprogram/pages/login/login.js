const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    userInfo: { gender: 1 },
    // 选中的标签字典 { '标签名': true }
    tags: {},
    // 预设标签库
    tagOptions: [
      '作息规律', '爱干净', '不抽烟', '宠物友好', 
      'I人', 'E人', '社牛', '社恐',
      '喜欢做饭', '夜猫子', '早睡早起', '安静',
      '二次元', '游戏开黑', '健身达人', '追剧',
      '音乐', '摄影', '旅行', '极简主义'
    ],
    // 用户手动添加的额外标签列表
    extraTags: [],
    inputTagVal: ''
  },

  onChooseAvatar(e) { this.setData({ 'userInfo.avatarUrl': e.detail.avatarUrl }) },
  onNickNameChange(e) { this.setData({ 'userInfo.nickName': e.detail.value }) },
  bindInput(e) { this.setData({ 'userInfo.job': e.detail.value }) },
  setGender(e) { this.setData({ 'userInfo.gender': e.currentTarget.dataset.v }) },
  
  // 切换标签选中状态
  toggleTag(e) {
    const t = e.currentTarget.dataset.tag;
    const tags = this.data.tags;
    
    if (tags[t]) {
      // 如果已选中，则取消
      delete tags[t];
    } else {
      // --- 修改点：限制最多选4个 ---
      if (Object.keys(tags).length >= 4) {
        return wx.showToast({ title: '最多选4个标签', icon: 'none' });
      }
      tags[t] = true;
    }
    this.setData({ tags });
  },

  // 输入自定义标签
  onTagInput(e) {
    this.setData({ inputTagVal: e.detail.value });
  },

  // 添加自定义标签
  addCustomTag() {
    const val = this.data.inputTagVal.trim();
    if (!val) return;
    if (val.length > 6) return wx.showToast({ title: '标签太长啦', icon: 'none' });
    
    const tags = this.data.tags;

    // 如果当前还没选中这个标签，且数量已满4个，则阻止
    if (!tags[val] && Object.keys(tags).length >= 4) {
        return wx.showToast({ title: '最多选4个标签', icon: 'none' });
    }

    // 检查是否已存在于预设或额外列表中
    if (this.data.tagOptions.includes(val) || this.data.extraTags.includes(val)) {
      tags[val] = true; // 直接选中
      this.setData({ tags, inputTagVal: '' });
      return;
    }

    // 添加到额外列表并选中
    const extra = this.data.extraTags;
    extra.push(val);
    tags[val] = true;

    this.setData({
      extraTags: extra,
      tags: tags,
      inputTagVal: ''
    });
  },
  
  submit() {
    const u = this.data.userInfo;
    if(!u.avatarUrl || !u.nickName) return wx.showToast({title:'请完善头像昵称', icon:'none'});
    
    // 至少选一个标签
    const selectedTags = Object.keys(this.data.tags);
    if (selectedTags.length === 0) return wx.showToast({title:'请至少选个标签', icon:'none'});

    wx.showLoading({ title: '创建新身份...' });
    
    const finalData = {
      ...u,
      tagList: selectedTags,
      createTime: db.serverDate()
    };

    this.uploadAvatar(u.avatarUrl).then(cloudAvatarUrl => {
        finalData.avatarUrl = cloudAvatarUrl;
        
        // 注册新用户
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