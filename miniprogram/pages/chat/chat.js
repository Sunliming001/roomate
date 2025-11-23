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
    memberMap: {} 
  },

  onLoad(opts) {
    this.setData({ chatId: opts.id, title: opts.name || '交流群' });
    this.userInfo = wx.getStorageSync('my_user_info');
    console.log('[调试-Chat] 进入页面, 我的ID:', this.userInfo._id);
    this.initChat();
  },

  initChat() {
    db.collection('chats').doc(this.data.chatId).get().then(res => {
      console.log('[调试-Chat] 获取聊天室详情:', res.data);
      this.setData({ chatInfo: res.data });
      this.fetchMemberInfo(res.data.members);

      if (res.data.unreadMembers && res.data.unreadMembers.includes(this.userInfo._id)) {
        console.log('[调试-Chat] 进场消除红点');
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
          
          const formattedMsgs = msgs.map(msg => {
            const isMe = msg.senderId === myId;
            const readBy = msg.readBy || []; 

            if (!isMe && !readBy.includes(myId)) {
               idsToMarkRead.push(msg._id);
            }

            let readStatusText = '';
            if (isMe) {
               const readerIds = readBy.filter(uid => uid !== myId);
               if (readerIds.length > 0) {
                   const names = readerIds.map(uid => that.data.memberMap[uid]?.nickName).filter(n => n);
                   if (names.length > 0) {
                       readStatusText = names.length > 2 ? `${names.slice(0, 2).join(',')}等${names.length}人 已读` : `${names.join(',')} 已读`;
                   } else {
                       readStatusText = `${readerIds.length}人 已读`;
                   }
               } else {
                   readStatusText = '未读';
               }
            }

            let avatar = msg.avatar;
            if (that.data.memberMap[msg.senderId]) {
               avatar = that.data.memberMap[msg.senderId].avatarUrl;
            }

            return {
              ...msg,
              isMe,
              avatar: avatar || '/images/default-room.png',
              readStatusText: readStatusText
            };
          });

          that.setData({ 
            messages: formattedMsgs,
            scrollId: 'bottom-pad' 
          });

          if (idsToMarkRead.length > 0) {
             that.markMessagesRead(idsToMarkRead);
          }
        },
        onError: function(err) {}
      });
  },

  markMessagesRead(ids) {
    ids.forEach(id => {
       db.collection('messages').doc(id).update({
          data: { readBy: _.addToSet(this.userInfo._id) }
       }).catch(console.error);
    });
  },

  onInput(e) { this.setData({ inputVal: e.detail.value }) },

  // --- 发送时加入详细日志 ---
  send() {
    const content = this.data.inputVal;
    if (!content) return;
    
    let unreadTargets = [];
    const myId = this.userInfo._id;

    if (this.data.chatInfo && this.data.chatInfo.members) {
       // 原始成员列表
       const allMembers = this.data.chatInfo.members;
       console.log('[调试-发送] 原始成员列表:', allMembers);
       console.log('[调试-发送] 我的ID:', myId);

       // 过滤
       unreadTargets = allMembers.filter(id => id !== myId);
       
       console.log('[调试-发送] 过滤后的未读目标(unreadTargets):', unreadTargets);
       
       // 双重检查：如果过滤后还包含我自己，打印警告
       if (unreadTargets.includes(myId)) {
           console.error('!!! [严重错误] 未读列表里依然包含我自己，请检查ID类型是否一致 !!!');
       }
    } else {
        console.error('[调试-发送] chatInfo 为空，无法计算未读人员');
    }

    const msg = {
      chatId: this.data.chatId, 
      content: content,
      senderId: this.userInfo._id, 
      avatar: this.userInfo.avatarUrl,
      createTime: db.serverDate(),
      readBy: [] 
    };

    const tempMsg = { ...msg, isMe: true, readStatusText: '...', _id: 'temp_'+Date.now() };
    this.setData({ messages: [...this.data.messages, tempMsg], inputVal: '', scrollId: 'bottom-pad' });

    db.collection('messages').add({ data: { ...msg, createTime: db.serverDate() } });

    // 更新会话
    console.log('[调试-发送] 正在更新 chats 集合, 写入 unreadMembers:', unreadTargets);
    db.collection('chats').doc(this.data.chatId).update({
      data: {
        lastMessage: content,
        updateTime: db.serverDate(),
        unreadMembers: unreadTargets 
      }
    }).then(() => {
        console.log('[调试-发送] chats 更新成功');
    }).catch(err => {
        console.error('[调试-发送] chats 更新失败', err);
    });
  },

  goBack() { wx.navigateBack(); },
  onUnload() { if(this.watcher) this.watcher.close(); }
})