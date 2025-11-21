// utils/mock.js

// 获取当前登录用户
const getCurrentUser = () => {
  // 优先从缓存取，如果没有则返回null
  return wx.getStorageSync('my_user_info') || null;
}

const initData = () => {
  const exists = wx.getStorageSync('room_list_v3');
  if (!exists) {
    // 造一条假数据，带上完整的发布者画像
    const initialData = [
      {
        id: 1,
        publisher: {
          nickName: '西瓜妹',
          avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200',
          job: 'UI设计',
          age: 26,
          tagList: ['爱干净', 'E人社牛', '猫狗双全']
        },
        community: '华润悦府',
        layout: { room: 3, hall: 2, toilet: 2 },
        rooms: [
          { name: '主卧', area: 25, price: 3500, status: 1 },
          { name: '次卧A', area: 18, price: 2800, status: 0 },
          { name: '次卧B', area: 15, price: 2200, status: 0 }
        ],
        totalPrice: 8500,
        moveInDate: '2023-12-01',
        cover: 'https://images.unsplash.com/photo-1502005229766-93976a1775d5?w=600',
        desc: '精装修，采光超好。',
        createTime: '2023-11-20'
      }
    ];
    wx.setStorageSync('room_list_v3', initialData);
  }
}

const getList = (keyword = '') => {
  initData();
  let list = wx.getStorageSync('room_list_v3') || [];
  
  // 搜索功能实现
  if (keyword) {
    list = list.filter(item => 
      item.community.includes(keyword) || item.desc.includes(keyword)
    );
  }
  return list;
}

const addRoom = (data) => {
  let list = getList();
  const currentUser = getCurrentUser();
  
  const newRoom = {
    id: new Date().getTime(),
    publisher: currentUser, // 使用真实注册信息
    createTime: new Date().toISOString().split('T')[0],
    ...data
  };
  list.unshift(newRoom);
  wx.setStorageSync('room_list_v3', list);
}

const getDetail = (id) => {
  let list = getList();
  return list.find(i => i.id == id);
}

module.exports = {
  getCurrentUser,
  getList,
  addRoom,
  getDetail
}