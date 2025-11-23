const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight,
    chatId: '',
    title: '聊天',
    messages: [],
    inputVal: '',
    scrollId: '',
    chatInfo: null // 存储聊天室详情(成员列表等)
  },

  onLoad(opts) {
    this.setData({ chatId: opts.id, title: opts.name || '交流群' });
    this.userInfo = wx.getStorageSync('my_user_info');
    
    // 1. 获取聊天室详情 & 清除我的红点
    this.initChat();
    
    // 2. 监听消息
    this.watchMessages();
  },

  initChat() {
    db.collection('chats').doc(this.data.chatId).get().then(res => {
      this.setData({ chatInfo: res.data });
      // 进入即读：从 unreadMembers 中移除自己
      if (res.data.unreadMembers && res.data.unreadMembers.includes(this.userInfo._id)) {
        db.collection('chats').doc(this.data.chatId).update({
          data: { unreadMembers: _.pull(this.userInfo._id) }
        });
      }
    });
  },

  watchMessages() {
    const that = this;
    this.watcher = db.collection('messages')
      .where({ chatId: that.data.chatId })
      .orderBy('createTime', 'asc')
      .watch({
        onChange: function(snapshot) {
          if(snapshot.docs.length === 0) return;
          const formattedMsgs = snapshot.docs.map(msg => ({
            ...msg,
            isMe: msg.senderId === that.userInfo._id
          }));
          that.setData({ 
            messages: formattedMsgs,
            scrollId: 'bottom-pad'
          });
        },
        onError: function(err) {}
      });
  },

  onInput(e) { this.setData({ inputVal: e.detail.value }) },

  send() {
    const content = this.data.inputVal;
    if (!content) return;
    
    // 1. 计算需要标记为未读的成员 (群里除了我以外的所有人)
    let unreadTargets = [];
    if (this.data.chatInfo && this.data.chatInfo.members) {
       unreadTargets = this.data.chatInfo.members.filter(id => id !== this.userInfo._id);
    }

    const msg = {
      chatId: this.data.chatId, content: content,
      senderId: this.userInfo._id, avatar: this.userInfo.avatarUrl,
      createTime: db.serverDate() // 用于排序
    };

    // 2. 写入消息
    db.collection('messages').add({ data: { ...msg, createTime: db.serverDate() } });

    // 3. 更新会话 (最后一条消息 + 未读红点)
    db.collection('chats').doc(this.data.chatId).update({
      data: {
        lastMessage: content,
        updateTime: db.serverDate(),
        // 重新设置未读人员名单
        unreadMembers: unreadTargets 
      }
    });

    this.setData({ inputVal: '' });
  },

  goBack() { wx.navigateBack(); },
  onUnload() { if(this.watcher) this.watcher.close(); }
})