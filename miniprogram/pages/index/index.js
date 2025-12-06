const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight || 20,
    // 新增：顶部导航栏右侧留白宽度
    headerPaddingRight: 0, 
    
    leftList: [], 
    rightList: [],
    currentCity: '南京市', 
    userLoc: null,
    searchKeyword: '',
    filter: { gender: 0, priceIdx: 0, ensuite: false },
    
    // 分页
    page: 0, pageSize: 10, isOver: false, isLoading: false,

    // 滑块
    showPriceSlider: false, priceMin: 0, priceMax: 10000,
    leftPercent: 0, rightPercent: 100, widthPercent: 100, sliderWidth: 0
  },

  // --- 核心修复：计算胶囊位置，防止遮挡 ---
  onLoad() {
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      const system = wx.getSystemInfoSync();
      // 计算右侧留白：屏幕宽度 - 胶囊左边距 + 一点额外间隙(10px)
      const rightSpace = system.windowWidth - menu.left + 10;
      this.setData({ headerPaddingRight: rightSpace });
    } catch (e) {
      // 兜底：如果获取失败，给一个大概的值 (90px)
      this.setData({ headerPaddingRight: 90 });
    }
  },

  onShow() {
    const user = wx.getStorageSync('my_user_info');
    if (!user) {
      setTimeout(() => {
        const pages = getCurrentPages();
        const curPage = pages[pages.length - 1];
        if (curPage && curPage.route === 'pages/index/index') {
           wx.reLaunch({ url: '/pages/login/login' });
        }
      }, 500);
      return;
    }

    app.pollBadgeStatus();

    if (app.globalData.selectedCity) {
      this.setData({ currentCity: app.globalData.selectedCity });
      app.globalData.selectedCity = null;
      this.reload();
    } 
    else if (!this.data.userLoc) {
      this.getUserLocation();
    } else {
      this.loadData();
    }
  },

  onPullDownRefresh() {
    app.pollBadgeStatus();
    this.reload(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.isOver || this.data.isLoading) return;
    this.setData({ page: this.data.page + 1 });
    this.loadData(true);
  },

  reload(cb) {
    this.setData({ page: 0, isOver: false, leftList: [], rightList: [] });
    this.loadData(false, cb);
  },

  getUserLocation() {
    const that = this;
    wx.getFuzzyLocation({
      type: 'wgs84',
      success(res) { 
        // res 包含 latitude 和 longitude
        console.log('模糊定位成功:', res);
        that.setData({ userLoc: res });
        that.autoUpdateCity(res);
      },
      fail(err) { 
        console.error('定位失败或拒绝:', err);
        // 失败则默认使用南京市加载数据
        that.reload(); 
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
      fail: () => { this.loadData(); }
    });
  },

  onCityChange(e) {
    const val = e.detail.value; 
    let city = val[1];
    if (city === '市辖区' || city === '县') city = val[0];
    if (city.endsWith('市市')) city = city.slice(0, -1);
    this.setData({ currentCity: city });
    this.reload();
  },

  toCityPage() {
    wx.navigateTo({ url: `/pages/city/city?current=${this.data.currentCity}` });
  },

  onSearchTap() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        that.setData({ searchKeyword: res.name });
        that.reload();
      }
    });
  },
  
  clearSearch() {
      this.setData({ searchKeyword: '' });
      this.reload();
  },

  onSearchInput(e) { this.setData({ searchKeyword: e.detail.value }); },
  onSearch() { this.reload(); },

  onFilterGender(e) { this.setData({'filter.gender': parseInt(e.detail.value)}); this.reload(); },
  onFilterPrice(e) { this.setData({'filter.priceIdx': parseInt(e.detail.value)}); this.reload(); },
  toggleEnsuite() { this.setData({'filter.ensuite': !this.data.filter.ensuite}); this.reload(); },
  
  onSortChange(e) {
      const idx = parseInt(e.detail.value);
      const types = ['new', 'hot'];
      this.setData({ sortType: types[idx] });
      this.reload();
  },

  onPetChange(e) {
      const idx = parseInt(e.detail.value);
      const pets = ['不限', '不接受养宠', '接受养猫', '接受养狗'];
      this.setData({ 'filter.pet': pets[idx] });
      this.reload();
  },

  // 加载逻辑
  loadData(isLoadMore = false, cb) {
    this.setData({ isLoading: true });
    if(!isLoadMore) wx.showLoading({ title: '加载中' });

    const whereCondition = { city: this.data.currentCity };
    if (this.data.searchKeyword) {
      whereCondition.community = db.RegExp({ regexp: this.data.searchKeyword, options: 'i' });
    }

    let query = db.collection('rooms').where(whereCondition);

    // 排序
    if (this.data.sortType === 'hot') {
        query = query.orderBy('favCount', 'desc');
    } else {
        query = query.orderBy('createTime', 'desc');
    }

    query.skip(this.data.page * this.data.pageSize)
      .limit(this.data.pageSize)
      .get({
      success: res => {
        let list = res.data;
        if (list.length < this.data.pageSize) this.setData({ isOver: true });

        const f = this.data.filter;
        const pMin = this.data.priceMin;
        const pMax = this.data.priceMax;

        // 筛选
        list = list.filter(item => item.status === 'active');

        list = list.filter(house => {
          // 宠物
          if (f.pet && f.pet !== '不限') {
              const housePets = house.pets || [];
              if (f.pet === '不接受养宠') { if (!housePets.includes('none')) return false; } 
              else if (f.pet === '接受养猫') { if (!housePets.includes('cat')) return false; } 
              else if (f.pet === '接受养狗') { if (!housePets.includes('dog')) return false; }
          }

          if (!house.rooms) return false;
          return house.rooms.some(room => {
            if (parseInt(room.status) !== 0) return false; 
            if (f.ensuite && !room.hasEnsuite) return false; 
            
            const price = parseFloat(room.price) || 0;
            if (price < pMin || price > pMax) return false;
            if (f.priceIdx === 1 && price >= 2000) return false;
            if (f.priceIdx === 2 && (price < 2000 || price > 3000)) return false;
            if (f.priceIdx === 3 && price <= 3000) return false;

            const dbExpect = parseInt(room.expectGender); 
            if (f.gender === 1) { if (dbExpect !== 1 && dbExpect !== 0) return false; }
            else if (f.gender === 2) { if (dbExpect !== 2 && dbExpect !== 0) return false; }
            else if (f.gender === 3) { if (dbExpect !== 0) return false; }
            return true; 
          });
        });

        // 距离
        if(this.data.userLoc && this.data.sortType !== 'hot') {
          list.forEach(item => {
             if(item.location) {
                item._dist = this.calcDist(this.data.userLoc, item.location);
                item.distStr = item._dist < 1000 ? item._dist.toFixed(0)+'m' : (item._dist/1000).toFixed(1)+'km';
             }
          });
          // 仅在默认排序下考虑距离，或者不强排距离只显示
        }

        // UI
        list.forEach(item => {
           let cover = '';
           const vacantRoom = item.rooms.find(r => r.status == 0 && r.photos && r.photos.length > 0);
           item.cover = vacantRoom ? vacantRoom.photos[0] : (item.rooms.find(r=>r.photos.length)?.photos[0] || '/images/default-room.png');
           
           item.dots = item.rooms.map(r => {
             if (r.status == 0) return 'empty';
             let gender = 1; 
             if (r.isMe) gender = item.publisher.gender; 
             else gender = (r.occupant && r.occupant.genderIndex == 1) ? 2 : 1;
             return gender == 2 ? 'female' : 'male';
           });
        });

        if (isLoadMore) {
            const oldLeft = this.data.leftList;
            const oldRight = this.data.rightList;
            list.forEach((item, i) => (i%2==0 ? oldLeft : oldRight).push(item));
            this.setData({ leftList: oldLeft, rightList: oldRight });
        } else {
            const left=[], right=[];
            list.forEach((item, i) => (i%2==0?left:right).push(item));
            this.setData({ leftList: left, rightList: right });
        }

        this.setData({ isLoading: false });
        wx.hideLoading();
        if(cb) cb();
      },
      fail: () => { this.setData({ isLoading: false }); wx.hideLoading(); if(cb) cb(); }
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
  onReady() { this.getSliderWidth(); },
  getSliderWidth() { const query = wx.createSelectorQuery(); query.select('#slider-track').boundingClientRect(rect => { if(rect) this.setData({ sliderWidth: rect.width }); }).exec(); },
  togglePriceSlider() { this.setData({ showPriceSlider: !this.data.showPriceSlider }, () => { if(this.data.showPriceSlider) this.getSliderWidth(); }); },
  onMoveMin(e) {
      const pageX = e.touches[0].pageX; const trackLeft = 30 * (wx.getSystemInfoSync().windowWidth / 750); let x = pageX - trackLeft; if (x < 0) x = 0; if (x > this.data.sliderWidth) x = this.data.sliderWidth; let rawVal = (x / this.data.sliderWidth) * 10000; let snappedVal = Math.round(rawVal / 500) * 500; if (snappedVal >= this.data.priceMax) snappedVal = this.data.priceMax - 500; if (snappedVal < 0) snappedVal = 0; const percent = (snappedVal / 10000) * 100; this.setData({ priceMin: snappedVal, leftPercent: percent, widthPercent: this.data.rightPercent - percent });
  },
  onMoveMax(e) {
      const pageX = e.touches[0].pageX; const trackLeft = 30 * (wx.getSystemInfoSync().windowWidth / 750); let x = pageX - trackLeft; if (x < 0) x = 0; if (x > this.data.sliderWidth) x = this.data.sliderWidth; let rawVal = (x / this.data.sliderWidth) * 10000; let snappedVal = Math.round(rawVal / 500) * 500; if (snappedVal <= this.data.priceMin) snappedVal = this.data.priceMin + 500; if (snappedVal > 10000) snappedVal = 10000; const percent = (snappedVal / 10000) * 100; this.setData({ priceMax: snappedVal, rightPercent: percent, widthPercent: percent - this.data.leftPercent });
  },
  updateSlider(minP, maxP) { /* ... */ },
  resetPrice() { this.setData({ priceMin: 0, priceMax: 10000, leftPercent: 0, rightPercent: 100, widthPercent: 100 }); },
  confirmPrice() { this.togglePriceSlider(); this.reload(); },
  goDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id='+e.currentTarget.dataset.id }) }
})