const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight || 20,
    leftList: [], 
    rightList: [],
    currentCity: '南京市', // 默认城市
    userLoc: null,
    searchKeyword: '',
    // 筛选状态
    filter: { gender: 0, priceIdx: 0, ensuite: false }
  },

  onShow() {
    // -----------------------------------------------------------
    // 🛑 核心修复：强制登录检查
    // -----------------------------------------------------------
    const user = wx.getStorageSync('my_user_info');
    if (!user) {
      // 如果没登录，强制跳转到登录页，不执行后面逻辑
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    
    // 登录了才获取位置和数据
    this.getUserLocation();
  },

  getUserLocation() {
    const that = this;
    wx.getLocation({
      type: 'gcj02',
      success(res) { 
        that.setData({ userLoc: res }); 
        that.loadData(); 
      },
      fail() { that.loadData(); }
    });
  },

  // 城市切换
  onCityChange(e) {
    const city = e.detail.value[1] + "市";
    this.setData({ currentCity: city });
    this.loadData();
  },

  onSearchInput(e) { this.setData({ searchKeyword: e.detail.value }); },
  onSearch() { this.loadData(); },

  loadData() {
    wx.showLoading({ title: '加载中' });

    const whereCondition = { city: this.data.currentCity };
    if (this.data.searchKeyword) {
      whereCondition.community = db.RegExp({ regexp: this.data.searchKeyword, options: 'i' });
    }

    db.collection('rooms').where(whereCondition).get({
      success: res => {
        let list = res.data;
        const f = this.data.filter;

        // 本地筛选逻辑
        list = list.filter(house => {
          if (!house.rooms) return false;
          return house.rooms.some(room => {
            if (room.status != 0) return false;
            if (f.ensuite && !room.hasEnsuite) return false;
            const price = parseFloat(room.price) || 0;
            if (f.priceIdx === 1 && price >= 2000) return false;
            if (f.priceIdx === 2 && (price < 2000 || price > 3000)) return false;
            if (f.priceIdx === 3 && price <= 3000) return false;
            if (f.gender > 0) {
               if (f.gender === 1 && room.expectGender !== 1 && room.expectGender !== 0) return false;
               if (f.gender === 2 && room.expectGender !== 2 && room.expectGender !== 0) return false;
               if (f.gender === 3 && room.expectGender !== 0) return false;
            }
            return true;
          });
        });

        // 距离排序
        if(this.data.userLoc) {
          list.forEach(item => {
             if(item.location) {
                item._dist = this.calcDist(this.data.userLoc, item.location);
                item.distStr = item._dist < 1000 ? item._dist.toFixed(0)+'m' : (item._dist/1000).toFixed(1)+'km';
             }
          });
          list.sort((a, b) => (a._dist||99999) - (b._dist||99999));
        }

        // UI 数据处理
        list.forEach(item => {
           // 封面
           let cover = '';
           const vacant = item.rooms.find(r => r.status == 0 && r.photos && r.photos.length > 0);
           if (vacant) cover = vacant.photos[0];
           else {
             const any = item.rooms.find(r => r.photos && r.photos.length > 0);
             cover = any ? any.photos[0] : '/images/default-room.png';
           }
           item.cover = cover;
           
           // 圆点
           item.dots = item.rooms.map(r => {
             if (r.status == 0) return 'empty';
             let gender = 1;
             if (r.isMe) gender = item.publisher.gender;
             else gender = (r.occupant.genderIndex === 1) ? 2 : 1;
             return gender == 2 ? 'female' : 'male';
           });
        });

        const left=[], right=[];
        list.forEach((item, i) => (i%2==0?left:right).push(item));
        this.setData({ leftList: left, rightList: right });
        wx.hideLoading();
      }
    });
  },
  
  calcDist(loc1, loc2) {
    var radLat1 = loc1.latitude * Math.PI / 180.0;
    var radLat2 = loc2.latitude * Math.PI / 180.0;
    var a = radLat1 - radLat2;
    var b = loc1.longitude * Math.PI / 180.0 - loc2.longitude * Math.PI / 180.0;
    var s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a/2),2) + Math.cos(radLat1)*Math.cos(radLat2)*Math.pow(Math.sin(b/2),2)));
    s = s * 6378.137 * 1000;
    return s;
  },
  
  goDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id='+e.currentTarget.dataset.id }) },
  onFilterGender(e) { this.setData({'filter.gender': parseInt(e.detail.value)}); this.loadData(); },
  onFilterPrice(e) { this.setData({'filter.priceIdx': parseInt(e.detail.value)}); this.loadData(); },
  toggleEnsuite() { this.setData({'filter.ensuite': !this.data.filter.ensuite}); this.loadData(); }
})