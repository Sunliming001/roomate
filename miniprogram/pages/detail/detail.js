const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    info: {},
    isFav: false
  },
  onLoad(opts) {
    this.roomId = opts.id;
    this.getRoomDetail();
  },
  
  // 从云端获取详情
  getRoomDetail() {
    db.collection('rooms').doc(this.roomId).get({
      success: res => {
        this.setData({ info: res.data });
      }
    });
  },

  // 发起聊一聊 (核心逻辑)
  goChat() {
    const me = app.globalData.userInfo;
    const owner = this.data.info.publisher;

    if (me._id === owner._id) {
        return wx.showToast({ title: '这是你自己的房源', icon: 'none' });
    }

    wx.showLoading({ title: '建立会话...' });

    // 1. 检查是否已经存在会话
    db.collection('chats').where({
      // 查询包含 我 和 房主 的会话 (需配合云数据库查询指令，简化起见这里用 roomID 查询)
      roomId: this.roomId,
      // 实际生产中应该更严谨地查询 members 数组
    }).get({
      success: res => {
        if (res.data.length > 0) {
          // 已存在，直接跳转
          const chatId = res.data[0]._id;
          this.navToChat(chatId);
        } else {
          // 不存在，创建新会话
          this.createChat(me, owner);
        }
      }
    });
  },

  createChat(me, owner) {
    db.collection('chats').add({
      data: {
        roomId: this.roomId,
        roomName: this.data.info.community,
        members: [me, owner], // 存入双方信息
        lastMessage: '会话已创建',
        updateTime: db.serverDate()
      },
      success: res => {
        this.navToChat(res._id);
      }
    });
  },

  navToChat(chatId) {
    wx.hideLoading();
    // 跳转到聊天页
    wx.navigateTo({ url: `/pages/chat/chat?id=${chatId}&name=${this.data.info.community}` });
  },

  // ... (其他收藏、加入逻辑需适配 cloud database，此处略，原理同上) ...
})