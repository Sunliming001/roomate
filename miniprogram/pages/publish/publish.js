const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    paddingTop: (app.globalData?.statusBarHeight || 20) + 20,
    // 定义清晰的初始状态
    initialData: {
      community: '', location: null, city: '',
      layout: { room: '', hall: 1, toilet: 1 },
      rooms: [], desc: '', totalPrice: ''
    },
    formData: {},
    isMeOptions: ['是', '否'],
    genderOptions: ['男', '女'], 
    ageOptions: ['00后', '95后', '90后', '80后', '其他'],
    expectGenderOptions: ['不限', '男', '女'] 
  },

  onLoad() {
    this.resetForm();
  },

  resetForm() {
    this.setData({ 
      formData: JSON.parse(JSON.stringify(this.data.initialData)) 
    });
  },

  chooseLocation() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        let city = '南京市'; 
        const cityMatch = res.address.match(/([^省]+市)/);
        if (cityMatch && cityMatch[1]) {
            city = cityMatch[1];
            if (city.length > 10) city = city.substring(city.length - 3); 
            if (city.indexOf('省') > -1) city = city.split('省')[1];
        } else {
            const directCity = res.address.match(/^(.+?市)/);
            if(directCity) city = directCity[1];
        }
        that.setData({ 
          'formData.community': res.name,
          'formData.address': res.address,
          'formData.city': city, 
          'formData.location': db.Geo.Point(res.longitude, res.latitude)
        });
      },
      fail(err) {
        if (err.errMsg.indexOf('auth') > -1) wx.openSetting();
      }
    });
  },

  onRoomCountInput(e) {
    let count = parseInt(e.detail.value);
    if (isNaN(count) || count > 10) return;
    let currentRooms = this.data.formData.rooms;
    let newRooms = [];
    for (let i = 0; i < count; i++) {
      if (currentRooms[i]) newRooms.push(currentRooms[i]);
      else {
        newRooms.push({
          name: i==0?'主卧':`次卧${i}`, area: '', price: '',
          status: 0, hasEnsuite: false, expectGender: 0, 
          isMeIndex: 0, occupant: { genderIndex: 0, ageIndex: 0, job: '' },
          photos: []
        });
      }
    }
    this.setData({ 'formData.layout.room': count, 'formData.rooms': newRooms });
  },

  bindInput(e) { this.setData({ [e.currentTarget.dataset.path]: e.detail.value }); },
  updateRoomField(e) {
    const { idx, field } = e.currentTarget.dataset;
    this.setData({ [`formData.rooms[${idx}].${field}`]: e.detail.value });
  },
  toggleRoomStatus(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`formData.rooms[${idx}].status`]: e.detail.value ? 1 : 0 });
  },
  toggleEnsuite(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`formData.rooms[${idx}].hasEnsuite`]: e.detail.value });
  },
  onIsMeChange(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`formData.rooms[${idx}].isMeIndex`]: e.detail.value });
  },
  onOccGenderChange(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`formData.rooms[${idx}].occupant.genderIndex`]: e.detail.value });
  },
  onOccAgeChange(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`formData.rooms[${idx}].occupant.ageIndex`]: e.detail.value });
  },
  onExpectGenderChange(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`formData.rooms[${idx}].expectGender`]: e.detail.value });
  },

  uploadRoomPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const that = this;
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success(res) {
        const tempPath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });
        const cloudPath = 'room-photos/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png';
        wx.cloud.uploadFile({
          cloudPath: cloudPath, filePath: tempPath,
          success: uploadRes => {
            const fileID = uploadRes.fileID;
            that.setData({ [`formData.rooms[${idx}].photos`]: [fileID] });
            wx.hideLoading();
          },
          fail: err => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); }
        })
      }
    });
  },

  submit() {
    const d = this.data.formData;
    if(!d.community || !d.location) return wx.showToast({title:'请选择位置', icon:'none'});
    
    const user = wx.getStorageSync('my_user_info');
    d.rooms.forEach(r => {
      if (r.status == 1 && r.isMeIndex == 0) {
        r.occupant.genderIndex = user.gender == 2 ? 1 : 0; 
      }
    });

    wx.showLoading({ title: '发布中' });
    db.collection('rooms').add({
      data: {
        ...d, publisher: user, createTime: db.serverDate(), status: 'active',
        minPrice: Math.min(...d.rooms.filter(r=>r.status==0).map(r=>parseFloat(r.price)||999999))
      },
      success: res => {
        wx.hideLoading();
        wx.showToast({title:'发布成功', icon: 'success'});
        
        // --- 核心修复：重置表单并跳转 ---
        this.resetForm();
        
        // 延迟跳转，让用户看到成功提示
        setTimeout(() => {
          wx.switchTab({ 
            url: '/pages/index/index',
            success: function (e) {
              // 触发首页刷新
              var page = getCurrentPages().pop();
              if (page == undefined || page == null) return;
              page.onLoad(); 
            }
          });
        }, 1000);
      }
    });
  }
})