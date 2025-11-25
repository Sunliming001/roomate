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
    
    wx.showLoading({ title: '创建新身份...' });
    
    const finalData = {
      ...u,
      tagList: Object.keys(this.data.tags),
      createTime: db.serverDate()
    };

    // 1. 上传头像
    this.uploadAvatar(u.avatarUrl).then(cloudAvatarUrl => {
        finalData.avatarUrl = cloudAvatarUrl;
        
        // 2. 【核心修改】不再检查是否存在，直接创建新用户！
        // 这样每次登录都会获得一个新的 _id，相当于一个全新的账号
        // 旧的数据因为关联的是旧 _id，所以不会显示出来
        db.collection('users').add({
            data: finalData
        }).then(res => {
            // res._id 是云数据库刚刚生成的全新ID
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
      
      // 登录成功，启动 app.js 里的实时红点监听
      if (app.loginSuccess) {
          app.loginSuccess(userData);
      } else {
          app.globalData.userInfo = userData;
      }
      
      wx.hideLoading();
      wx.reLaunch({ url: '/pages/index/index' });
  }
})