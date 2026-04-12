// app.js
App({
  globalData: {
    // PoC 配置：通过 IDE 的"预览/本地开发"指向部署好的 Next.js 站点
    // 真机测试时必须使用 HTTPS 域名（微信小程序 web-view 仅允许业务域名下的 HTTPS 页面）
    webBaseUrl: 'https://themarketbrew.com',
    // 本地调试时可临时切换为局域网 HTTPS（需要 ngrok / Caddy 反代），
    // 注意：web-view 组件不支持 http://localhost 直连
    // webBaseUrl: 'https://your-ngrok-id.ngrok.app',
  },
  onLaunch() {
    // 可在此调用 wx.login 获取 code，为后续 POST /auth/wechat-login 做准备
    // PoC 阶段只记录 launch 时间即可
    console.log('[app] launched at', Date.now());
  },
});
