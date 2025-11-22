const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    paddingTop: (app.globalData?.statusBarHeight || 20) + 20,
    // 初始数据模板
    initialData: {
      community: '',
      layout: { room: '', hall: 1, toilet: 1 },
      rooms: [],
      desc: '',
      totalPrice: ''
    },
    formData: {}
  },

  onLoad() {
    // 深拷贝初始化数据
    this.setData({ 
      formData: JSON.parse(JSON.stringify(this.data.initialData)) 
    });
  },

  // --- 核心修复：位置选择 ---
  chooseLocation() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        // 成功回调，设置小区名
        that.setData({ 'formData.community': res.name });
      },
      fail(err) {
        console.error('地图调用失败', err);
        // 如果是权限原因，提示用户
        if (err.errMsg.indexOf('auth') > -1) {
          wx.showModal({
            title: '权限提示',
            content: '请在小程序设置中打开位置权限',
            showCancel: false,
            success: (res) => {
              if (res.confirm) wx.openSetting();
            }
          });
        }
      }
    });
  },

  // --- 核心修复：动态生成房间卡片 ---
  onRoomCountInput(e) {
    let count = parseInt(e.detail.value);
    if (isNaN(count) || count < 0) count = 0;
    if (count > 10) {
      wx.showToast({ title: '房间数量不能超过10', icon: 'none' });
      return; // 不更新界面，保持原样
    }

    let currentRooms = this.data.formData.rooms;
    let newRooms = [];

    for (let i = 0; i < count; i++) {
      // 如果之前有数据，就复用；没有则新建
      if (currentRooms[i]) {
        newRooms.push(currentRooms[i]);
      } else {
        newRooms.push({
          name: i === 0 ? '主卧' : `次卧 ${i}`, // 自动命名
          area: '',
          price: '',
          status: 0, // 0=空缺招募, 1=已住
          photos: [] // 存储图片路径
        });
      }
    }

    this.setData({
      'formData.layout.room': count,
      'formData.rooms': newRooms
    });
  },

  // 通用输入绑定
  bindInput(e) {
    const path = e.currentTarget.dataset.path;
    this.setData({ [path]: e.detail.value });
  },

  // 更新具体房间字段
  updateRoom(e) {
    const idx = e.currentTarget.dataset.idx;
    const field = e.currentTarget.dataset.field;
    const key = `formData.rooms[${idx}].${field}`;
    this.setData({ [key]: e.detail.value });
  },

  // 切换房间状态
  toggleRoomStatus(e) {
    const idx = e.currentTarget.dataset.idx;
    // 选中 = true = status 1 (已住)
    const status = e.detail.value ? 1 : 0;
    const key = `formData.rooms[${idx}].status`;
    this.setData({ [key]: status });
  },

  // 上传房间图片
  uploadRoomPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const that = this;

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempPath = res.tempFiles[0].tempFilePath;
        
        // 在真机上，这里建议上传到云存储 (wx.cloud.uploadFile)
        // 为了演示流畅，先直接显示临时路径，发布时再处理或直接存临时路径(不推荐但可用)
        // 如果你需要永久存储，请取消下方注释的代码：

        /* 
        const cloudPath = 'room-photos/' + new Date().getTime() + '-' + Math.floor(Math.random()*1000) + '.png';
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempPath,
          success: cRes => {
             const key = `formData.rooms[${idx}].photos`;
             that.setData({ [key]: [cRes.fileID] });
          }
        })
        */

        // 暂用临时路径演示 UI 变化
        const key = `formData.rooms[${idx}].photos`;
        that.setData({ [key]: [tempPath] });
      }
    });
  },

  // 提交发布
  submit() {
    const d = this.data.formData;
    
    // 校验
    if (!d.community) return wx.showToast({ title: '请选择小区', icon: 'none' });
    if (!d.layout.room || d.layout.room == 0) return wx.showToast({ title: '请填写房间数', icon: 'none' });
    if (!d.totalPrice) return wx.showToast({ title: '请填写总价', icon: 'none' });

    const user = app.globalData.userInfo || wx.getStorageSync('my_user_info');
    if (!user) return wx.navigateTo({ url: '/pages/login/login' });

    wx.showLoading({ title: '发布中...' });

    // 存入云数据库
    db.collection('rooms').add({
      data: {
        ...d,
        publisher: user,
        createTime: db.serverDate(),
        status: 'active',
        vacantCount: d.rooms.filter(r => r.status == 0).length // 自动计算空缺数
      },
      success: res => {
        wx.hideLoading();
        wx.showToast({ title: '发布成功' });
        
        // 清空表单
        this.setData({ formData: JSON.parse(JSON.stringify(this.data.initialData)) });
        
        // 返回首页
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1000);
      },
      fail: err => {
        wx.hideLoading();
        console.error(err);
        wx.showToast({ title: '发布失败', icon: 'none' });
      }
    });
  }
})