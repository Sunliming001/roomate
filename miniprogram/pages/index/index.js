const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight || 20,
    leftList: [], 
    rightList: [],
    currentCity: '南京市', 
    userLoc: null,
    searchKeyword: '',
    filter: { gender: 0, priceIdx: 0, ensuite: false }
  },

  onShow() {
    // --- 修复：增加防死循环保护 ---
    const user = wx.getStorageSync('my_user_info');
    
    if (!user) {
      // 延迟 500ms 再跳转，避免程序启动瞬间卡死
      setTimeout(() => {
        // 检查当前页面栈，防止重复跳转
        const pages = getCurrentPages();
        const curPage = pages[pages.length - 1];
        if (curPage && curPage.route === 'pages/index/index') {
           wx.reLaunch({ url: '/pages/login/login' });
        }
      }, 500);
      app.checkTabBarBadge();
      return;
    }

    // 正常逻辑
    if (app.globalData.selectedCity) {
      this.setData({ currentCity: app.globalData.selectedCity });
      app.globalData.selectedCity = null;
      this.loadData();
    } 
    else if (!this.data.userLoc) {
      this.getUserLocation();
    } else {
      this.loadData();
    }
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh());
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

  onCityChange(e) {
    const city = e.detail.value[1] + "市"; 
    this.setData({ currentCity: city });
    this.loadData();
  },

  toCityPage() {
    wx.navigateTo({ url: `/pages/city/city?current=${this.data.currentCity}` });
  },

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

  loadData(cb) {
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

        // 1. 过滤已完成
        list = list.filter(item => item.status === 'active');

        // 2. 筛选
        list = list.filter(house => {
          if (!house.rooms || house.rooms.length === 0) return false;
          const hasMatchingRoom = house.rooms.some(room => {
            if (parseInt(room.status) !== 0) return false; 
            if (f.ensuite && !room.hasEnsuite) return false; 
            const price = parseFloat(room.price) || 0;
            if (f.priceIdx === 1 && price >= 2000) return false;
            if (f.priceIdx === 2 && (price < 2000 || price > 3000)) return false;
            if (f.priceIdx === 3 && price <= 3000) return false;

            const dbExpect = parseInt(room.expectGender); 
            // 0全部, 1招男, 2招女, 3不限
            if (f.gender === 1) { // 招男
               if (dbExpect !== 1 && dbExpect !== 0) return false;
            }
            else if (f.gender === 2) { // 招女
               if (dbExpect !== 2 && dbExpect !== 0) return false;
            }
            else if (f.gender === 3) { // 不限
               if (dbExpect !== 0) return false;
            }
            return true; 
          });
          return hasMatchingRoom; 
        });

        // 3. 排序
        if(this.data.userLoc) {
          list.forEach(item => {
             if(item.location) {
                item._dist = this.calcDist(this.data.userLoc, item.location);
                item.distStr = item._dist < 1000 ? item._dist.toFixed(0)+'m' : (item._dist/1000).toFixed(1)+'km';
             }
          });
          list.sort((a, b) => (a._dist||99999) - (b._dist||99999));
        }

        // 4. UI处理
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
        if(cb) cb();
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