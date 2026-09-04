const ENVELOPE = "__webskill_sandbox__";
let CHANNEL_ID = null;
let worker = null;
function post(payload) {
  parent.postMessage({ [ENVELOPE]: true, channelId: CHANNEL_ID, payload }, '*');
}
function startWorker(bootstrapSource) {
  if (worker || typeof bootstrapSource !== 'string') return;
  const blob = new Blob([bootstrapSource], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  // 注意：opaque origin 下 module Worker 无法加载（实证），classic Worker + data: URL 动态导入可用
  worker = new Worker(url);
  URL.revokeObjectURL(url);
  worker.addEventListener('message', (event) => post(event.data));
  worker.addEventListener('error', (event) => post({ type: 'sandbox-worker-error', message: event.message }));
  post({ type: 'sandbox-ready' });
}
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data[ENVELOPE] !== true) return;
  if (event.source !== parent) return;
  if (CHANNEL_ID === null) {
    if (typeof data.channelId !== 'string') return;
    CHANNEL_ID = data.channelId;
  } else if (data.channelId !== CHANNEL_ID) return;
  const payload = data.payload;
  if (payload && payload.type === 'sandbox-init') {
    startWorker(payload.bootstrapSource);
    return;
  }
  if (worker) worker.postMessage(payload);
});
