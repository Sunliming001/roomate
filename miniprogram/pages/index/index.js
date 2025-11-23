const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight || 20,
    leftList: [], 
    rightList: [],
    currentCity: '南京市', // 默认
    userLoc: null,
    searchKeyword: '',
    filter: { gender: 0, priceIdx: 0, ensuite: false }
  },

  onShow() {
    // 1. 检查登录
    const user = wx.getStorageSync('my_user_info');
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    // 2. 核心修复：检查是否有从城市页带回来的选择
    if (app.globalData.selectedCity) {
      console.log("检测到城市切换：", app.globalData.selectedCity);
      this.setData({ currentCity: app.globalData.selectedCity });
      // 清空标记，防止下次onShow重复处理
      app.globalData.selectedCity = null;
      // 重新加载数据
      this.loadData();
    } 
    // 3. 如果没有手动选过城市，且未定位，则定位
    else if (!this.data.userLoc) {
      this.getUserLocation();
    }
  },

  // 跳转到城市选择页
  toCityPage() {
    wx.navigateTo({
      url: `/pages/city/city?current=${this.data.currentCity}`
    });
  },

  getUserLocation() {
    const that = this;
    wx.getLocation({
      type: 'gcj02',
      success(res) { 
        that.setData({ userLoc: res });
        that.autoUpdateCity(res);
      },
      fail() { 
        that.loadData(); 
      }
    });
  },

  autoUpdateCity(loc) {
    // 智能推断逻辑：找最近的房源城市
    db.collection('rooms').limit(20).get({
      success: res => {
        let list = res.data;
        if (list.length > 0) {
          list.forEach(item => {
             if(item.location) item._tempDist = this.calcDist(loc, item.location);
             else item._tempDist = 9999999;
          });
          list.sort((a, b) => a._tempDist - b._tempDist);
          const closest = list[0];
          // 50km内算同城
          if (closest._tempDist < 50000 && closest.city) {
             this.setData({ currentCity: closest.city });
          }
        }
        this.loadData();
      },
      fail: () => {
        this.loadData();
      }
    });
  },

  // 搜索
  onSearchTap() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        that.setData({ searchKeyword: res.name });
        that.loadData();
      }
    });
  },
  clearSearch() {
      this.setData({ searchKeyword: '' });
      this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载中' });

    const whereCondition = { city: this.data.currentCity };
    if (this.data.searchKeyword) {
      whereCondition.community = db.RegExp({
        regexp: this.data.searchKeyword,
        options: 'i',
      });
    }

    db.collection('rooms').where(whereCondition).get({
      success: res => {
        let list = res.data;
        const f = this.data.filter;

        // 筛选逻辑
        list = list.filter(house => {
          if (!house.rooms || house.rooms.length === 0) return false;
          const hasMatchingRoom = house.rooms.some(room => {
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
          return hasMatchingRoom;
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

        // UI 处理
        list.forEach(item => {
           let cover = '';
           const vacantRoom = item.rooms.find(r => r.status == 0 && r.photos && r.photos.length > 0);
           if (vacantRoom) cover = vacantRoom.photos[0];
           else {
             const anyRoom = item.rooms.find(r => r.photos && r.photos.length > 0);
             cover = anyRoom ? anyRoom.photos[0] : '/images/default-room.png'; 
           }
           item.cover = cover;
           
           item.dots = item.rooms.map(r => {
             if (r.status == 0) return 'empty';
             let gender = 1; 
             if (r.isMe) gender = item.publisher.gender; 
             else gender = (r.occupant && r.occupant.genderIndex == 1) ? 2 : 1;
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