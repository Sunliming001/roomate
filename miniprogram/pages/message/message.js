const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    paddingTop: app.globalData.statusBarHeight + 54,
    list: []
  },
  onShow() {
    // 获取消息列表
    // 这里简单查询所有chats，实际应该查询 members 包含 current user 的记录
    // 由于云开发权限限制，简单demo可以先设为“所有人可读”
    db.collection('chats')
      .orderBy('updateTime', 'desc')
      .get({
        success: res => {
          // 简单的格式化时间
          const list = res.data.map(item => ({
             id: item._id,
             title: item.roomName,
             content: item.lastMessage,
             time: '刚刚', // 实际项目需处理时间戳
             avatar: '/images/default-room.png' // 建议给个默认图
          }));
          this.setData({ list });
        }
      });
  },
  // 点击跳转聊天
  goChat(e) {
      const id = e.currentTarget.dataset.id;
      const name = e.currentTarget.dataset.name;
      wx.navigateTo({ url: `/pages/chat/chat?id=${id}&name=${name}` });
  }
})