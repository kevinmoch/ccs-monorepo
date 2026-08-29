// 外壳白名单的出厂默认值 —— 全仓唯一一份，service worker 与选项页共用。
//
// 曾经两边各存一份：storage 为空（刚装好、还没打开过选项页）时 SW 退回的是它自己那份，
// 于是只改选项页那份会得到「装完不拦截，去选项页原样保存一次才拦截」的怪相。
// 挂在 self 上是为了同时适配 importScripts（SW）和 <script>（选项页）两种加载方式。
self.CCS_DEFAULT_SHELL_WHITELIST = [
  'https://localhost:3000',
  'https://localhost.huawei.com:3000',
  'https://ccs.huawei.com:3000'
];
