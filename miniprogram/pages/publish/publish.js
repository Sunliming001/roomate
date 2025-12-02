const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    paddingTop: (app.globalData?.statusBarHeight || 20) + 20,
    initialData: {
      community: '', location: null, city: '',
      layout: { room: '', hall: 1, toilet: 1 },
      rooms: [], desc: '', totalPrice: '',
      pets: [] // 存储宠物策略: ['none'] 或 ['cat', 'dog']
    },
    formData: {},
    isMeOptions: ['是', '否'],
    genderOptions: ['男', '女'], 
    ageOptions: Array.from({length: 43}, (_, i) => (i + 18) + '岁'), 
    expectGenderOptions: ['不限', '男', '女'],
    
    // 宠物选项配置
    petOpts: [
        { key: 'none', name: '不接受' },
        { key: 'cat', name: '接受猫' },
        { key: 'dog', name: '接受狗' }
    ],

    isEditMode: false,
    editId: null
  },

  onLoad(options) {
    if (options.id) {
        this.setData({ isEditMode: true, editId: options.id });
        wx.setNavigationBarTitle({ title: '修改房源' });
        this.loadRoomData(options.id);
    } else {
        this.resetForm();
    }
  },

  resetForm() {
    this.setData({ 
      formData: JSON.parse(JSON.stringify(this.data.initialData)) 
    });
  },

  loadRoomData(id) {
    wx.showLoading({ title: '加载数据...' });
    db.collection('rooms').doc(id).get().then(res => {
        const d = res.data;
        if(!d.location) d.location = null;
        if(!d.pets) d.pets = []; // 兼容旧数据
        this.setData({ formData: d });
        wx.hideLoading();
    }).catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // --- 核心：宠物标签切换逻辑 ---
  togglePet(e) {
      const key = e.currentTarget.dataset.key;
      let pets = this.data.formData.pets || [];

      if (key === 'none') {
          // 如果点击“不接受”，则清空其他，只留none
          pets = ['none'];
      } else {
          // 如果点击猫或狗
          // 1. 先移除 'none'
          const noneIdx = pets.indexOf('none');
          if (noneIdx > -1) pets.splice(noneIdx, 1);

          // 2. 切换当前项
          const idx = pets.indexOf(key);
          if (idx > -1) {
              pets.splice(idx, 1);
          } else {
              pets.push(key);
          }
      }
      this.setData({ 'formData.pets': pets });
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
            that.setData({ [`formData.rooms[${idx}].photos`]: [uploadRes.fileID] });
            wx.hideLoading();
          },
          fail: err => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); }
        })
      }
    });
  },

  validateForm() {
    const d = this.data.formData;
    if(!d.community || !d.location) return '请选择小区位置';
    if(!d.layout.room) return '请填写房间数量';
    if(!d.totalPrice) return '请填写总租金';
    // 宠物必填校验（可选）
    if(!d.pets || d.pets.length === 0) return '请选择养宠要求';

    let roomSum = 0;
    for(let i=0; i<d.rooms.length; i++) {
        const r = d.rooms[i];
        const rName = `房间${i+1}`;
        if(!r.name) return `请填写${rName}的名称`;
        if(!r.area) return `请填写${rName}的面积`;
        if(!r.price) return `请填写${rName}的租金`; 
        if(!r.photos || r.photos.length === 0) return `请上传${rName}的照片`;
        if (r.status == 1 && r.isMeIndex == 1) {
            if(!r.occupant.job) return `请填写${rName}入住人的职业`;
        }
        roomSum += (parseFloat(r.price) || 0);
    }

    const totalInput = parseFloat(d.totalPrice);
    if (Math.abs(totalInput - roomSum) > 1) {
        return `总租金(${totalInput})与各房间之和(${roomSum})不符`;
    }
    return null; 
  },

  submit() {
    const errorMsg = this.validateForm();
    if (errorMsg) return wx.showToast({ title: errorMsg, icon: 'none', duration: 2000 });

    const d = this.data.formData;
    const user = wx.getStorageSync('my_user_info');
    
    d.rooms.forEach(r => {
      if (r.status == 1 && r.isMeIndex == 0) {
        r.occupant.genderIndex = user.gender == 2 ? 1 : 0; 
      }
    });

    wx.showLoading({ title: this.data.isEditMode ? '更新中...' : '发布中...' });

    if (this.data.isEditMode) {
        delete d._id;
        delete d._openid;
        d.minPrice = Math.min(...d.rooms.filter(r=>r.status==0).map(r=>parseFloat(r.price)||999999));

        db.collection('rooms').doc(this.data.editId).update({
            data: d
        }).then(() => {
            this.finishSubmit('修改成功');
        }).catch(err => {
            console.error(err);
            wx.hideLoading();
            wx.showToast({ title: '修改失败', icon: 'none' });
        });
    } else {
        db.collection('rooms').add({
          data: {
            ...d, 
            publisher: user, 
            createTime: db.serverDate(), 
            status: 'active',
            favCount: 0,
            minPrice: Math.min(...d.rooms.filter(r=>r.status==0).map(r=>parseFloat(r.price)||999999))
          },
          success: res => {
            this.finishSubmit('发布成功');
          }
        });
    }
  },

  finishSubmit(msg) {
    wx.hideLoading();
    wx.showToast({title: msg, icon: 'success'});
    if(!this.data.isEditMode) this.resetForm();
    setTimeout(() => {
      wx.switchTab({ 
        url: '/pages/index/index',
        success: function (e) {
          const page = getCurrentPages().pop();
          if (page) page.onShow(); 
        }
      });
    }, 1000);
  }
})