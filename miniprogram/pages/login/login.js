Page({
  data: {
    userInfo: {
      avatar: '', // 默认头像需自己找一张放images文件夹，或者留空
      nickName: '',
      gender: 0,
      age: '',
      job: '',
      tags: {} // 使用对象存储选中状态 { "I人": true }
    },
    tagOptions: ['I人社恐', 'E人社牛', '宠物友好', '早睡早起', '夜猫子', '爱干净', '不可吸烟', '周末宅家', '喜欢做饭']
  },
  
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ 'userInfo.avatar': avatarUrl });
  },
  onNickNameChange(e) {
    this.setData({ 'userInfo.nickName': e.detail.value });
  },
  onGenderChange(e) {
    this.setData({ 'userInfo.gender': parseInt(e.detail.value) });
  },
  bindInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`userInfo.${key}`]: e.detail.value });
  },
  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = this.data.userInfo.tags;
    // 切换状态
    if (tags[tag]) delete tags[tag];
    else tags[tag] = true;
    this.setData({ 'userInfo.tags': tags });
  },
  saveUserInfo() {
    const u = this.data.userInfo;
    // 简单校验
    if (!u.nickName || !u.gender) {
      return wx.showToast({ title: '请补全核心信息', icon: 'none' });
    }
    
    // 转换tags为数组以便存储
    const finalData = {
      ...u,
      tagList: Object.keys(u.tags)
    };
    
    wx.setStorageSync('my_user_info', finalData);
    wx.showToast({ title: '注册成功', icon: 'success' });
    
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 1000);
  }
})