const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    chatId: '',
    messages: [],
    inputVal: '',
    scrollId: ''
  },
  onLoad(opts) {
    this.setData({ chatId: opts.id });
    wx.setNavigationBarTitle({ title: opts.name || '聊天' });
    this.userInfo = app.globalData.userInfo;
    
    // 开始监听消息
    this.watchMessages();
  },

  // 实时监听消息 (云开发 Watch 功能)
  watchMessages() {
    const that = this;
    this.watcher = db.collection('messages')
      .where({ chatId: that.data.chatId })
      .orderBy('createTime', 'asc')
      .watch({
        onChange: function(snapshot) {
          // snapshot.docs 是最新的消息列表
          const formattedMsgs = snapshot.docs.map(msg => ({
            ...msg,
            isMe: msg.senderId === that.userInfo._id // 判断是否是自己发的
          }));
          
          that.setData({ 
            messages: formattedMsgs,
            scrollId: 'bottom-pad' // 自动滚动到底部
          });
        },
        onError: function(err) {
          console.error('the watch closed because of error', err);
        }
      });
  },

  onInput(e) { this.setData({ inputVal: e.detail.value }) },

  // 发送消息
  send() {
    const content = this.data.inputVal;
    if (!content) return;

    const msg = {
      chatId: this.data.chatId,
      content: content,
      senderId: this.userInfo._id,
      avatar: this.userInfo.avatarUrl,
      createTime: new Date() // 注意：watch排序建议用 db.serverDate()，但本地乐观更新用Date
    };

    // 1. 写入消息集合
    db.collection('messages').add({
      data: { ...msg, createTime: db.serverDate() }
    });

    // 2. 更新会话列表的最后一条消息
    db.collection('chats').doc(this.data.chatId).update({
      data: {
        lastMessage: content,
        updateTime: db.serverDate()
      }
    });

    // 清空输入框
    this.setData({ inputVal: '' });
  },

  onUnload() {
    // 退出页面关闭监听
    if(this.watcher) this.watcher.close();
  }
})