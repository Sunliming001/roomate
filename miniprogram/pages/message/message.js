const app = getApp();
const db = wx.cloud.database();
Page({
  data: {
    paddingTop: app.globalData.statusBarHeight + 44,
    list: []
  },
  onShow() {
    // 实际应查询 members 包含当前用户的会话
    db.collection('chats').orderBy('updateTime', 'desc').get({
      success: res => {
        const list = res.data.map(i => ({
          ...i,
          timeStr: '刚刚', // 需处理时间戳
          targetAvatar: '/images/room-icon.png' // 简单用房源图
        }));
        this.setData({ list });
      }
    });
  },
  goChat(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/chat/chat?id=${id}&name=${name}` });
  }
})