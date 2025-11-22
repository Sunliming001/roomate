// utils/mock.js

// 获取当前用户
const getCurrentUser = () => wx.getStorageSync('my_user_info') || null;

// 更新用户信息
const updateUserInfo = (info) => {
  wx.setStorageSync('my_user_info', info);
}

const getList = () => {
  let list = wx.getStorageSync('room_list_v4') || [];
  // 过滤掉已完成签约的 (status === 'signed')
  return list.filter(item => item.status !== 'signed');
}

// 获取我的签约
const getMyContracts = () => {
  let list = wx.getStorageSync('room_list_v4') || [];
  return list.filter(item => item.status === 'signed');
}

// 获取我的发布
const getMyPublish = () => {
  const user = getCurrentUser();
  if (!user) return [];
  let list = wx.getStorageSync('room_list_v4') || [];
  return list.filter(item => item.publisher.nickName === user.nickName); // 简单用昵称匹配，实际应用ID
}

// 获取我的收藏
const getMyFavs = () => {
  let list = getList();
  // 简单模拟：实际开发应存单独的fav表
  return list.filter(item => item.isFav);
}

// 发布房源
const addRoom = (data) => {
  let list = wx.getStorageSync('room_list_v4') || [];
  const currentUser = getCurrentUser();
  const newRoom = {
    id: new Date().getTime(),
    publisher: currentUser,
    createTime: new Date().toISOString().split('T')[0],
    favCount: 0,
    isFav: false,
    status: 'active', // active:招募中, signed:已签约
    ...data
  };
  list.unshift(newRoom);
  wx.setStorageSync('room_list_v4', list);
}

// 收藏逻辑
const toggleFav = (id) => {
  let list = wx.getStorageSync('room_list_v4') || [];
  let target = list.find(i => i.id == id);
  if (target) {
    target.isFav = !target.isFav;
    target.favCount = target.isFav ? (target.favCount || 0) + 1 : (target.favCount || 1) - 1;
    wx.setStorageSync('room_list_v4', list);
    
    // 生成系统消息
    if(target.isFav) addMessage('系统', `有人收藏了你的房源：${target.community}`);
  }
}

// 申请加入逻辑 (模拟群聊和签约)
const joinRoom = (id, gender) => {
  let list = wx.getStorageSync('room_list_v4') || [];
  let target = list.find(i => i.id == id);
  
  if (target) {
    // 1. 找到第一个空房间
    let emptyRoom = target.rooms.find(r => r.status === 0);
    if (emptyRoom) {
      emptyRoom.status = 1; // 标记为占用
      // 2. 检查是否满员
      const isFull = target.rooms.every(r => r.status === 1);
      
      if (isFull) {
        // 满员 -> 签约完成
        target.status = 'signed';
        addMessage('签约通知', `恭喜！${target.community} 已满员，系统已自动生成租房合约，请在“我的签约”查看。`);
      } else {
        addMessage('新室友', `有新室友加入了 ${target.community}，当前还缺 ${target.rooms.filter(r=>r.status===0).length} 人。`);
      }
      
      wx.setStorageSync('room_list_v4', list);
      return { success: true, isFull };
    }
  }
  return { success: false };
}

// 消息列表
const getMessages = () => wx.getStorageSync('app_msgs') || [];
const addMessage = (title, content) => {
  let msgs = getMessages();
  msgs.unshift({ title, content, time: new Date().toLocaleString() });
  wx.setStorageSync('app_msgs', msgs);
}

module.exports = {
  getCurrentUser, updateUserInfo, getList, addRoom, getDetail: (id) => getList().concat(getMyContracts()).find(i => i.id == id),
  toggleFav, joinRoom, getMessages, getMyContracts, getMyPublish, getMyFavs
}