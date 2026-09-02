/**
 * 外壳主帧的 document-start 引导脚本。
 *
 * 对应 Electron preload 的 `setupMainFrame()` 上半段：注入 main-world.js、握手、
 * 使能。**不含**转发逻辑——那半在 `src/lib/android-bridge.ts` 里，因为它要调
 * Capacitor 插件，而插件桥在 document-start 时还没就绪。
 *
 * 与 frame-boot.js 的分工：那个演子帧（被 ERP 页面注入），这个演外壳（顶层）。
 * 两者共用同一个原生 authToken，但走的是完全不同的通路：子帧用 WebMessage 桥，
 * 外壳用 Capacitor 插件。
 */
(function () {
  var PROTO = 'ccs-fetch-proxy';
  var AUTH_TOKEN = '__CCS_AUTH_TOKEN__';

  function postTo(to, msg) {
    var out = { __ccsExt: true, proto: PROTO, to: to, authToken: AUTH_TOKEN };
    for (var k in msg) {
      if (Object.prototype.hasOwnProperty.call(msg, k)) out[k] = msg[k];
    }
    try {
      window.postMessage(out, location.origin);
    } catch (_) {
      /* 正在导航离开 */
    }
  }

  // main-world.js 由原生替换进来。顶层实例负责安装 window.ccsExt*。
  var __ccsPayload = '__CCS_PAYLOAD__';

  // 顺序敏感：HANDSHAKE 必须第一条，main-world.js 只认第一条来定 bridgeToken；
  // 页面脚本此时还没机会运行，所以这一条一定是我们的。
  postTo('main', { kind: 'CCS_EXT_HANDSHAKE' });
  postTo('main', { kind: 'CCS_EXT_ENABLE' });

  // 能力 6（下载观察窗）在 Android 上不实现。ENABLE 会无条件装上
  // window.ccsExtDownloads，这里摘掉它，让外壳的存在性判断自然走降级路径——
  // 留一个只会超时的桩比没有更糟。
  //
  // 时序：postMessage 是异步的，上面两条要等当前同步代码跑完才被 message
  // 监听器处理。同步 delete 会跑在安装**之前**，删一个还不存在的东西（实测
  // 过：hasDownloads 依然为 true）。setTimeout(0) 排在 postMessage 任务之后，才删得掉。
  var drop = function () {
    try {
      delete window.ccsExtDownloads;
    } catch (_) {
      /* 不可配置属性，忽略 */
    }
  };
  window.addEventListener('ccs-ext-downloads-ready', drop);
  setTimeout(drop, 0);
})();
