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
    filter: { gender: 0, priceIdx: 0, ensuite: false },
    
    // 分页相关
    page: 0,
    pageSize: 10,
    isOver: false, // 是否还有更多数据
    isLoading: false,

    // 租金滑块相关
    showPriceSlider: false,
    priceMin: 0,
    priceMax: 10000,
    leftPercent: 0,
    rightPercent: 100,
    widthPercent: 100,
    sliderWidth: 0 // 轨道像素宽度

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
      this.reload(); // 切换城市，重置加载
    } 
    else if (!this.data.userLoc) {
      this.getUserLocation();
    } 
    // 如果已有数据，不强制刷新，除非手动下拉
  },


  // 下拉刷新 -> 重置分页
  onPullDownRefresh() {
    app.pollBadgeStatus();
    this.reload(() => wx.stopPullDownRefresh());
  },

  // 触底加载下一页
  onReachBottom() {
    if (this.data.isOver || this.data.isLoading) return;
    this.setData({ page: this.data.page + 1 });
    this.loadData(true);
  },

  // 重置并加载第一页
  reload(cb) {
    this.setData({ page: 0, isOver: false, leftList: [], rightList: [] });
    this.loadData(false, cb);
  },

  getUserLocation() {
    const that = this;
    wx.getLocation({
      type: 'gcj02',
      success(res) { 
        that.setData({ userLoc: res });
        that.autoUpdateCity(res);
      },
      fail() { that.reload(); }
    });
  },

  // 根据经纬度找最近的房源城市 (无API Key方案)
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
          
          // 50公里内算同城
          if (closest._tempDist < 50000 && closest.city) {
             this.setData({ currentCity: closest.city });
          } else {
             this.setData({ currentCity: '南京市' });
          }
        } else {
          this.setData({ currentCity: '南京市' });
        }
        this.loadData();
      },
      fail: () => {
        this.setData({ currentCity: '南京市' });
        this.loadData();
      }
    });
  },

  onCityChange(e) {
    const city = e.detail.value[1] + "市"; 
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

  // --- 核心：支持分页的加载 ---
  loadData(isLoadMore = false, cb) {
    this.setData({ isLoading: true });
    if(!isLoadMore) wx.showLoading({ title: '加载中' });

    const whereCondition = { city: this.data.currentCity };
    if (this.data.searchKeyword) {
      whereCondition.community = db.RegExp({ regexp: this.data.searchKeyword, options: 'i' });
    }

    db.collection('rooms')
      .where(whereCondition)
      .skip(this.data.page * this.data.pageSize)
      .limit(this.data.pageSize)
      .orderBy('createTime', 'desc') // 按时间倒序
      .get({
      success: res => {
        let list = res.data;
        const pMin = this.data.priceMin;
        const pMax = this.data.priceMax;
        // 判断是否到底
        if (list.length < this.data.pageSize) {
            this.setData({ isOver: true });
        }

        const f = this.data.filter;

        // 本地筛选 (注意：分页+本地筛选可能导致某页数据被全滤掉显示为空，
        // 完美方案需云函数聚合，此处采用标准客户端处理)
        list = list.filter(item => item.status === 'active');

        list = list.filter(house => {
          if (!house.rooms) return false;
          return house.rooms.some(room => {
            if (parseInt(room.status) !== 0) return false; 
            if (f.ensuite && !room.hasEnsuite) return false; 
            // 租金范围筛选 (pMin ~ pMax)
            const price = parseFloat(room.price) || 0;
            if (price < pMin || price > pMax) return false;

            const dbExpect = parseInt(room.expectGender); 
            if (f.gender === 1 && dbExpect !== 1 && dbExpect !== 0) return false;
            if (f.gender === 2 && dbExpect !== 2 && dbExpect !== 0) return false;
            if (f.gender === 3 && dbExpect !== 0) return false;
            return true; 
          });
        });

        // 距离计算
        if(this.data.userLoc) {
          list.forEach(item => {
             if(item.location) {
                item._dist = this.calcDist(this.data.userLoc, item.location);
                item.distStr = item._dist < 1000 ? item._dist.toFixed(0)+'m' : (item._dist/1000).toFixed(1)+'km';
             }
          });
          // 分页模式下，距离排序只能在当前页内排，无法全量排
          list.sort((a, b) => (a._dist||99999) - (b._dist||99999));
        }

        // UI处理
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

        // 合并数据
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
      fail: () => {
          this.setData({ isLoading: false });
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
    onReady() {
    // 获取滑块轨道宽度
    this.getSliderWidth();
  },
  getSliderWidth() {
    const query = wx.createSelectorQuery();
    query.select('#slider-track').boundingClientRect(rect => {
        if(rect) this.setData({ sliderWidth: rect.width });
    }).exec();
  },
  // --- 租金滑块逻辑 ---
  togglePriceSlider() { 
    this.setData({ showPriceSlider: !this.data.showPriceSlider }, () => {
        if(this.data.showPriceSlider) this.getSliderWidth(); 
    });
},
   // 移动左滑块 (Min)
   onMoveMin(e) {
    const pageX = e.touches[0].pageX;
    const trackLeft = 30 * (wx.getSystemInfoSync().windowWidth / 750); // 估算padding left
    
    // 计算在轨道上的位置 [0, sliderWidth]
    let x = pageX - trackLeft;
    if (x < 0) x = 0;
    if (x > this.data.sliderWidth) x = this.data.sliderWidth;
    
    // 转为数值 (0 - 10000)
    let rawVal = (x / this.data.sliderWidth) * 10000;
    
    // 吸附到 500
    let snappedVal = Math.round(rawVal / 500) * 500;
    
    // 边界限制：不能超过 (右滑块 - 500)
    if (snappedVal >= this.data.priceMax) snappedVal = this.data.priceMax - 500;
    if (snappedVal < 0) snappedVal = 0;

    // 转回百分比用于 UI
    const percent = (snappedVal / 10000) * 100;

    this.setData({
        priceMin: snappedVal,
        leftPercent: percent,
        widthPercent: this.data.rightPercent - percent
    });
},

 // 移动右滑块 (Max)
 onMoveMax(e) {
  const pageX = e.touches[0].pageX;
  const trackLeft = 30 * (wx.getSystemInfoSync().windowWidth / 750); 
  
  let x = pageX - trackLeft;
  if (x < 0) x = 0;
  if (x > this.data.sliderWidth) x = this.data.sliderWidth;
  
  let rawVal = (x / this.data.sliderWidth) * 10000;
  let snappedVal = Math.round(rawVal / 500) * 500;
  
  // 边界限制：不能小于 (左滑块 + 500)
  if (snappedVal <= this.data.priceMin) snappedVal = this.data.priceMin + 500;
  if (snappedVal > 10000) snappedVal = 10000;

  const percent = (snappedVal / 10000) * 100;

  this.setData({
      priceMax: snappedVal,
      rightPercent: percent,
      widthPercent: percent - this.data.leftPercent
  });
},
resetPrice() {
  this.setData({
      priceMin: 0, priceMax: 10000,
      leftPercent: 0, rightPercent: 100, widthPercent: 100
  });
},

confirmPrice() {
  this.togglePriceSlider();
  this.loadData();
},
  goDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id='+e.currentTarget.dataset.id }) }
})