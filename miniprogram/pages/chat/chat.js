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
    chatInfo: null,
    memberMap: {},
    inputBottom: 0,
    showMore: false // 控制功能面板
  },

  onLoad(opts) {
    this.setData({ chatId: opts.id, title: opts.name || '交流群' });
    this.userInfo = wx.getStorageSync('my_user_info');
    this.initChat();
  },

  onFocus(e) {
    this.setData({ 
      inputBottom: e.detail.height,
      showMore: false, // 键盘弹起时关闭面板
      scrollId: 'bottom-pad' 
    });
  },
  onBlur(e) { this.setData({ inputBottom: 0 }); },

  toggleMore() {
      this.setData({ 
          showMore: !this.data.showMore,
          inputBottom: 0, // 关闭键盘
          scrollId: 'bottom-pad'
      });
      if(!this.data.showMore) wx.hideKeyboard();
  },
  closeMore() {
      if(this.data.showMore) this.setData({ showMore: false });
  },

  initChat() {
    db.collection('chats').doc(this.data.chatId).get().then(res => {
      this.setData({ chatInfo: res.data });
      this.fetchMemberInfo(res.data.members);
      if (res.data.unreadMembers && res.data.unreadMembers.includes(this.userInfo._id)) {
        db.collection('chats').doc(this.data.chatId).update({
          data: { unreadMembers: _.pull(this.userInfo._id) }
        });
      }
    });
  },

  fetchMemberInfo(memberIds) {
    db.collection('users').where({ _id: _.in(memberIds) }).get().then(res => {
      const map = {};
      res.data.forEach(u => { map[u._id] = u; });
      this.setData({ memberMap: map });
      this.watchMessages();
    }).catch(err => {
      this.watchMessages(); 
    });
  },

  watchMessages() {
    const that = this;
    if(this.watcher) this.watcher.close();

    this.watcher = db.collection('messages')
      .where({ chatId: that.data.chatId })
      .orderBy('createTime', 'asc')
      .watch({
        onChange: function(snapshot) {
          if (!snapshot.docs) return;
          const msgs = snapshot.docs;
          const myId = that.userInfo._id;
          const idsToMarkRead = []; 
          
          let lastTime = 0;

          const formattedMsgs = msgs.map(msg => {
            const isMe = msg.senderId === myId;
            const readBy = msg.readBy || []; 
            if (!isMe && !readBy.includes(myId)) idsToMarkRead.push(msg._id);

            let readStatusText = '';
            if (isMe) {
               const readerIds = readBy.filter(uid => uid !== myId);
               if (readerIds.length > 0) {
                   const names = readerIds.map(uid => that.data.memberMap[uid]?.nickName).filter(n => n);
                   readStatusText = names.length > 0 ? `${names.length}人已读` : '已读';
               } else {
                   readStatusText = '未读';
               }
            }

            let avatar = msg.avatar;
            if (that.data.memberMap[msg.senderId]) avatar = that.data.memberMap[msg.senderId].avatarUrl;
            
            // --- 时间显示逻辑 ---
            const msgDate = msg.createTime instanceof Date ? msg.createTime : new Date(msg.createTime);
            let timeStr = '';
            // 如果距离上一条超过 5 分钟，显示时间
            if (msgDate.getTime() - lastTime > 5 * 60 * 1000) {
                timeStr = that.formatMsgTime(msgDate);
                lastTime = msgDate.getTime();
            }

            return {
              ...msg, isMe, avatar: avatar || '/images/default-room.png',
              readStatusText,
              timeStr, showTime: !!timeStr
            };
          });

          that.setData({ messages: formattedMsgs, scrollId: 'bottom-pad' });
          if (idsToMarkRead.length > 0) that.markMessagesRead(idsToMarkRead);
        },
        onError: function(err) {}
      });
  },

  // 时间格式化辅助函数
  formatMsgTime(date) {
      const now = new Date();
      const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
      const h = date.getHours().toString().padStart(2,'0');
      const m = date.getMinutes().toString().padStart(2,'0');
      if (isToday) return `${h}:${m}`;
      return `${date.getMonth()+1}-${date.getDate()} ${h}:${m}`;
  },

  markMessagesRead(ids) {
    ids.forEach(id => {
       db.collection('messages').doc(id).update({ data: { readBy: _.addToSet(this.userInfo._id) } }).catch(console.error);
    });
  },

  onInput(e) { this.setData({ inputVal: e.detail.value }) },

  // 发送文本
  send() { this.doSend(this.data.inputVal, 'text'); },

  // 发送图片
  sendImage() {
      wx.chooseMedia({
          count: 1, mediaType: ['image'],
          success: res => {
              const path = res.tempFiles[0].tempFilePath;
              wx.showLoading({title:'发送中'});
              const cloudPath = 'chat-img/' + Date.now() + Math.floor(Math.random()*1000) + '.png';
              wx.cloud.uploadFile({
                  cloudPath, filePath: path,
                  success: upRes => {
                      wx.hideLoading();
                      this.doSend(upRes.fileID, 'image');
                  },
                  fail: () => wx.hideLoading()
              });
          }
      });
  },

  // 发送位置
  sendLocation() {
      wx.chooseLocation({
          success: res => {
              const locData = { name: res.name, address: res.address, latitude: res.latitude, longitude: res.longitude };
              this.doSend(locData, 'location');
          }
      });
  },

  // 统一发送逻辑
  doSend(content, type) {
    if (!content && type=='text') return;
    
    const me = wx.getStorageSync('my_user_info');
    let unreadTargets = [];
    if (this.data.chatInfo && this.data.chatInfo.members) {
       unreadTargets = this.data.chatInfo.members.filter(id => id !== me._id);
    }

    const msg = {
      chatId: this.data.chatId, 
      content: content,
      msgType: type, // 增加消息类型
      senderId: me._id, 
      avatar: me.avatarUrl,
      createTime: db.serverDate(),
      readBy: [] 
    };

    // 乐观更新
    const tempMsg = { ...msg, isMe: true, readStatusText: '...', _id: 'temp_'+Date.now(), createTime: new Date() };
    this.setData({ messages: [...this.data.messages, tempMsg], inputVal: '', scrollId: 'bottom-pad', showMore: false });

    db.collection('messages').add({ data: msg });

    // 更新会话摘要
    let lastText = content;
    if (type == 'image') lastText = '[图片]';
    if (type == 'location') lastText = '[位置]';

    db.collection('chats').doc(this.data.chatId).update({
      data: {
        lastMessage: lastText,
        updateTime: db.serverDate(),
        unreadMembers: unreadTargets 
      }
    });
  },
  
  // 查看大图
  previewImage(e) {
      wx.previewImage({ urls: [e.currentTarget.dataset.src] });
  },

  // 打开地图
  openLocation(e) {
      const loc = e.currentTarget.dataset.loc;
      wx.openLocation({ latitude: loc.latitude, longitude: loc.longitude, name: loc.name, address: loc.address });
  },

  goBack() { wx.navigateBack(); },
  onUnload() { if(this.watcher) this.watcher.close(); }
})