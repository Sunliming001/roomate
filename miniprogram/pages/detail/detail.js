const mock = require('../../utils/mock.js');
Page({
  data: { info: {} },
  onLoad(opts) {
    this.setData({ info: mock.getDetail(opts.id) });
  }
})