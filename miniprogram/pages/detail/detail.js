const app = getApp();
const db = wx.cloud.database();
Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight,
    info: {},
    gallery: []
  },
  onLoad(opts) {
    db.collection('rooms').doc(opts.id).get({
      success: res => {
        const d = res.data;
        // 构造相册
        const gallery = [];
        d.rooms.forEach(r => {
          if(r.photos && r.photos.length) {
            gallery.push({ url: r.photos[0], name: r.name });
          }
        });
        if(gallery.length==0) gallery.push({ url: '/images/default-room.png', name: '暂无照片' });
        
        // 处理显示用的入住信息
        d.rooms.forEach(r => {
          if(r.status==1) {
             if(r.isMe) {
                // 本人：用发布者信息
                r.occupantDisplay = {
                   gender: d.publisher.gender == 2 ? 1 : 0, // 0男 1女
                   age: '房主',
                   job: d.publisher.job || '未知'
                };
             } else {
                // 非本人：用填写的 occupant
                r.occupantDisplay = {
                   gender: r.occupant.genderIndex, // 0男 1女 (对应 publish genderOptions)
                   age: ['00后','95后','90后'][r.occupant.ageIndex] || '未知',
                   job: r.occupant.job || '未知'
                };
             }
          }
        });

        this.setData({ info: d, gallery });
      }
    });
  },
  goBack() { wx.navigateBack(); }
})