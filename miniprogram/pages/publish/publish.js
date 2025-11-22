const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    paddingTop: (app.globalData?.statusBarHeight || 20) + 20,
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
    this.setData({ formData: JSON.parse(JSON.stringify(this.data.initialData)) });
  },

  // 选位置 (同时解析城市)
  chooseLocation() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        // 尝试从地址字符串中提取城市名
        let city = '南京市'; // 默认兜底
        const cityMatch = res.address.match(/([^省]+市)/);
        if (cityMatch && cityMatch[1]) {
            city = cityMatch[1];
            if (city.length > 10) city = city.substring(city.length - 3); 
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

  // --- 核心修复：图片上传到云存储 ---
  uploadRoomPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const that = this;
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success(res) {
        const tempPath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });
        
        // 生成随机文件名
        const cloudPath = 'room-photos/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png';
        
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempPath,
          success: uploadRes => {
            // 获取 fileID (cloud://...) 这是一个永久地址
            const fileID = uploadRes.fileID;
            that.setData({ [`formData.rooms[${idx}].photos`]: [fileID] });
            wx.hideLoading();
          },
          fail: err => {
            console.error(err);
            wx.hideLoading();
            wx.showToast({ title: '上传失败', icon: 'none' });
          }
        })
      }
    });
  },

  submit() {
    const d = this.data.formData;
    if(!d.community || !d.location) return wx.showToast({title:'请选择位置', icon:'none'});
    
    const user = wx.getStorageSync('my_user_info');
    
    // 自动填入本人性别
    d.rooms.forEach(r => {
      if (r.status == 1 && r.isMeIndex == 0) {
        r.occupant.genderIndex = user.gender == 2 ? 1 : 0; 
      }
    });

    wx.showLoading({ title: '发布中' });
    db.collection('rooms').add({
      data: {
        ...d,
        publisher: user,
        createTime: db.serverDate(),
        minPrice: Math.min(...d.rooms.filter(r=>r.status==0).map(r=>parseFloat(r.price)||999999))
      },
      success: res => {
        wx.hideLoading();
        wx.showToast({title:'发布成功'});
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1000);
      }
    });
  }
})