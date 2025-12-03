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
    showMore: false,
    headerAvatars: [], // 头部头像列表
    
    showContactModal: false,
    contactType: '微信号',
    contactValue: ''
  },

  onLoad(opts) {
    this.setData({ chatId: opts.id, title: opts.name || '交流群' });
    this.userInfo = wx.getStorageSync('my_user_info');
    this.initChat();
  },

  // --- UI 交互 ---
  onFocus(e) {
    this.setData({ inputBottom: e.detail.height, showMore: false, scrollId: 'bottom-pad' });
  },
  onBlur(e) { this.setData({ inputBottom: 0 }); },
  toggleMore() {
      this.setData({ showMore: !this.data.showMore, inputBottom: 0, scrollId: 'bottom-pad' });
      if(!this.data.showMore) wx.hideKeyboard();
  },
  closeMore() { if(this.data.showMore) this.setData({ showMore: false }); },

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
      const avatars = [];
      res.data.forEach(u => { 
          map[u._id] = u; 
          // 收集前5个头像用于头部
          if(avatars.length < 5) avatars.push(u.avatarUrl);
      });
      this.setData({ memberMap: map, headerAvatars: avatars });
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

            // 获取昵称和头像
            let avatar = msg.avatar;
            let nickName = '用户';
            if (that.data.memberMap[msg.senderId]) {
                const u = that.data.memberMap[msg.senderId];
                avatar = u.avatarUrl;
                nickName = u.nickName;
            }

            // 已读状态
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
            
            // 时间
            const msgDate = msg.createTime instanceof Date ? msg.createTime : new Date(msg.createTime);
            let timeStr = '';
            if (msgDate.getTime() - lastTime > 5 * 60 * 1000) {
                timeStr = that.formatMsgTime(msgDate);
                lastTime = msgDate.getTime();
            }

            return {
              ...msg, isMe, avatar: avatar || '/images/default-room.png', nickName,
              readStatusText, timeStr, showTime: !!timeStr
            };
          });

          that.setData({ messages: formattedMsgs, scrollId: 'bottom-pad' });
          if (idsToMarkRead.length > 0) that.markMessagesRead(idsToMarkRead);
        },
        onError: function(err) {}
      });
  },

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
  send() { this.doSend(this.data.inputVal, 'text'); },

  sendImage() {
      wx.chooseMedia({ count: 1, mediaType: ['image'], success: res => {
          const path = res.tempFiles[0].tempFilePath;
          wx.showLoading({title:'发送中'});
          const cloudPath = 'chat-img/' + Date.now() + Math.floor(Math.random()*1000) + '.png';
          wx.cloud.uploadFile({
              cloudPath, filePath: path,
              success: upRes => { wx.hideLoading(); this.doSend(upRes.fileID, 'image'); },
              fail: () => wx.hideLoading()
          });
      }});
  },

  sendLocation() {
      wx.chooseLocation({ success: res => {
          const locData = { name: res.name, address: res.address, latitude: res.latitude, longitude: res.longitude };
          this.doSend(locData, 'location');
      }});
  },

  sendContactReq() {
      this.doSend('我想和您交换联系方式，方便进一步沟通吗？', 'contact_req');
      this.setData({ showMore: false }); 
  },

  handleAcceptContact() { this.setData({ showContactModal: true }); },

  switchContactType() {
      const types = ['微信号', '手机号'];
      wx.showActionSheet({ itemList: types, success: (res) => { this.setData({ contactType: types[res.tapIndex] }); } });
  },

  onContactInput(e) { this.setData({ contactValue: e.detail.value }); },

  submitContact() {
      if (!this.data.contactValue) return wx.showToast({title:'请填写内容', icon:'none'});
      const info = { type: this.data.contactType, value: this.data.contactValue };
      this.doSend(info, 'contact_info');
      this.setData({ showContactModal: false, contactValue: '' });
  },

  closeContactModal() { this.setData({ showContactModal: false }); },

  doSend(content, type) {
    if (!content && type=='text') return;
    
    const me = wx.getStorageSync('my_user_info');
    let unreadTargets = [];
    if (this.data.chatInfo && this.data.chatInfo.members) {
       unreadTargets = this.data.chatInfo.members.filter(id => id !== me._id);
    }

    const msg = {
      chatId: this.data.chatId, content: content, msgType: type, 
      senderId: me._id, avatar: me.avatarUrl, createTime: db.serverDate(), readBy: [] 
    };

    const tempMsg = { ...msg, isMe: true, readStatusText: '...', _id: 'temp_'+Date.now(), createTime: new Date(), nickName: me.nickName };
    this.setData({ messages: [...this.data.messages, tempMsg], inputVal: '', scrollId: 'bottom-pad', showMore: false });

    db.collection('messages').add({ data: msg });

    let lastText = content;
    if (type == 'image') lastText = '[图片]';
    if (type == 'location') lastText = '[位置]';
    if (type == 'contact_req') lastText = '[联系方式申请]';
    if (type == 'contact_info') lastText = '[联系方式名片]';

    db.collection('chats').doc(this.data.chatId).update({
      data: { lastMessage: lastText, updateTime: db.serverDate(), unreadMembers: unreadTargets }
    });
  },
  
  previewImage(e) { wx.previewImage({ urls: [e.currentTarget.dataset.src] }); },

  openLocation(e) {
      const loc = e.currentTarget.dataset.loc;
      wx.openLocation({ latitude: parseFloat(loc.latitude), longitude: parseFloat(loc.longitude), name: loc.name, address: loc.address });
  },

  viewProfile(e) {
      const uid = e.currentTarget.dataset.uid;
      const user = this.data.memberMap[uid];
      if (user) {
          const tags = user.tagList ? user.tagList.join('、') : '无';
          const gender = ['未知','男','女'][user.gender];
          const age = user.ageIndex != null ? (user.ageIndex + 18) + '岁' : '未知';
          wx.showModal({
              title: user.nickName,
              content: `性别: ${gender}\n年龄: ${age}\n职业: ${user.job || '未填写'}\n标签: ${tags}`,
              showCancel: false, confirmText: '知道了'
          });
      }
  },

  goBack() { wx.navigateBack(); },
  onUnload() { if(this.watcher) this.watcher.close(); }
})