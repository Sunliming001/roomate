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
    memberMap: {} // 缓存成员信息 { id: { nickName: 'xx', avatarUrl: 'xx' } }
  },

  onLoad(opts) {
    this.setData({ chatId: opts.id, title: opts.name || '交流群' });
    this.userInfo = wx.getStorageSync('my_user_info');
    
    this.initChat();
  },

  initChat() {
    db.collection('chats').doc(this.data.chatId).get().then(res => {
      this.setData({ chatInfo: res.data });
      
      // 1. 获取成员信息 (为了显示 "张三已读")
      this.fetchMemberInfo(res.data.members);

      // 2. 进场即读：把自己从未读列表移除 (消除消息列表页的红点)
      if (res.data.unreadMembers && res.data.unreadMembers.includes(this.userInfo._id)) {
        db.collection('chats').doc(this.data.chatId).update({
          data: { unreadMembers: _.pull(this.userInfo._id) }
        });
      }
    });
  },

  fetchMemberInfo(memberIds) {
    db.collection('users').where({
      _id: _.in(memberIds)
    }).get().then(res => {
      const map = {};
      res.data.forEach(u => { map[u._id] = u; });
      this.setData({ memberMap: map });
      // 获取完名字后再启动监听，确保能显示名字
      this.watchMessages();
    }).catch(err => {
      console.error('获取成员失败', err);
      this.watchMessages(); // 失败也要启动监听
    });
  },

  // --- 核心：实时消息监听与已读标记 ---
  watchMessages() {
    const that = this;
    this.watcher = db.collection('messages')
      .where({ chatId: that.data.chatId })
      .orderBy('createTime', 'asc')
      .watch({
        onChange: function(snapshot) {
          if (!snapshot.docs) return;
          
          const msgs = snapshot.docs;
          const myId = that.userInfo._id;
          
          // 1. 筛选出需要我标记为"已读"的消息
          // 条件：不是我发的 && readBy数组里还没有我
          const unreadIds = [];
          
          const formattedMsgs = msgs.map(msg => {
            const isMe = msg.senderId === myId;
            const readBy = msg.readBy || [];

            // 如果这消息不是我发的，且我还没读，加入待标记列表
            if (!isMe && !readBy.includes(myId)) {
               unreadIds.push(msg._id);
            }

            // 2. 处理显示逻辑 (头像、已读文案)
            let avatar = msg.avatar;
            if (that.data.memberMap[msg.senderId]) {
               avatar = that.data.memberMap[msg.senderId].avatarUrl;
            }

            // 生成已读文案
            let statusText = '';
            if (isMe) {
               // 排除自己后的已读列表
               const otherReaders = readBy.filter(uid => uid !== myId);
               
               if (otherReaders.length === 0) {
                   statusText = '未读';
               } else {
                   // 尝试转昵称
                   const names = otherReaders.map(uid => that.data.memberMap[uid]?.nickName).filter(n => n);
                   if (names.length > 0) {
                       // 如果人多，只显示前2个名字 + 人数
                       if (names.length > 2) {
                           statusText = `${names.slice(0, 2).join(',')}等${names.length}人已读`;
                       } else {
                           statusText = `${names.join(', ')} 已读`;
                       }
                   } else {
                       // 兜底显示人数
                       statusText = `${otherReaders.length}人已读`;
                   }
               }
            }

            return {
              ...msg,
              isMe,
              avatar: avatar || '/images/default-room.png',
              readStatusText: statusText
            };
          });

          that.setData({ 
            messages: formattedMsgs,
            scrollId: 'bottom-pad' // 自动滚动到底部
          });

          // 3. 执行已读标记 (只要我在这个页面，来了新消息就立刻标记)
          if (unreadIds.length > 0) {
             that.markMessagesRead(unreadIds);
          }
        },
        onError: function(err) { console.error(err); }
      });
  },

  // 批量标记已读
  markMessagesRead(ids) {
    // 遍历更新 (小程序端限制，只能循环)
    ids.forEach(id => {
       db.collection('messages').doc(id).update({
          data: {
             readBy: _.addToSet(this.userInfo._id) // 原子操作：加入我的ID
          }
       });
    });
  },

  onInput(e) { this.setData({ inputVal: e.detail.value }) },

  send() {
    const content = this.data.inputVal;
    if (!content) return;
    
    // 计算给谁发红点 (群里除了我以外的人)
    let unreadTargets = [];
    if (this.data.chatInfo && this.data.chatInfo.members) {
       unreadTargets = this.data.chatInfo.members.filter(id => id !== this.userInfo._id);
    }

    const msg = {
      chatId: this.data.chatId, 
      content: content,
      senderId: this.userInfo._id, 
      avatar: this.userInfo.avatarUrl,
      createTime: db.serverDate(),
      readBy: [] // 初始 readBy 为空
    };

    // 1. 发送消息
    db.collection('messages').add({ data: { ...msg, createTime: db.serverDate() } });

    // 2. 更新会话 (红点和最新消息)
    db.collection('chats').doc(this.data.chatId).update({
      data: {
        lastMessage: content,
        updateTime: db.serverDate(),
        unreadMembers: unreadTargets 
      }
    });

    this.setData({ inputVal: '' });
  },

  goBack() { wx.navigateBack(); },
  onUnload() { if(this.watcher) this.watcher.close(); }
})