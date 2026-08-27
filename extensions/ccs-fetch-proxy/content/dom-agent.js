(function(){var q=class extends Error{code;details;constructor(e,t,r){super(t),this.name="WebSkillError",this.code=e,this.details=r}},Ie=["text","number","boolean","select","textarea","file","password","date"],Wt={type:"object",properties:{question:{type:"string",description:"A single question. Use it only when one answer is genuinely all you need."},fields:{type:"array",maxItems:20,description:"Collect several answers in one form. Use this whenever you need more than one piece of information, so the user fills everything in once instead of answering a chain of questions.",items:{type:"object",properties:{name:{type:"string",description:"Key this answer is returned under."},label:{type:"string",description:"Short label shown next to the input."},type:{type:"string",enum:[...Ie],description:'Input kind. Use "date" for dates; the value comes back as a YYYY-MM-DD string.'},required:{type:"boolean"},description:{type:"string",description:"Help text shown under the input."},defaultValue:{description:"A value the user already stated in this conversation; it is filled into the input for them. Only pass it when the user actually said it — do not guess."},options:{type:"array",items:{type:"object",properties:{label:{type:"string"},value:{}},required:["label","value"]},description:'Choices for a "select" field. Required when type is "select".'}},required:["name","label","type"]}},choices:{type:"array",items:{type:"string"},description:"Closed set of acceptable answers for the single-question form. Provide it whenever the answer must be one of a known finite set, for example when asking which installed skill to use. The user then picks from a list instead of typing free text."},suggestion:{type:"string",description:"A value you believe the user is likely to answer, based only on the profile in the system prompt. It is shown as a suggestion the user may accept; it is never filled in for them. Omit it when nothing in the profile supports a value."},suggestionReason:{type:"string",description:"Short reason for the suggestion, shown next to it so the user can judge whether to accept it."}}};function Ce(e,t){if(e==="allow-all")return!0;if(e==="deny-all"||!e||typeof e!="object")return!1;var r=e.allow;if(!Array.isArray(r))return!1;var n;try{n=new URL(t)}catch{return!1}for(var o=n.hostname.toLowerCase(),i=0;i<r.length;i++){var a=r[i];if(!(typeof a!="string"||a==="")){if(a.indexOf("://")!==-1){try{if(new URL(a).origin===n.origin)return!0}catch{}continue}var s=a.toLowerCase();if(s.indexOf("*.")===0){var c=s.slice(2);if(o===c||o.endsWith("."+c))return!0}else if(o===s)return!0}}return!1}function Le(e){try{return new URL(e).hostname}catch{return"(unparseable-url)"}}function _e(){return`var isNetworkAllowed = ${Ce.toString()};
var networkUrlHost = ${Le.toString()};`}function Y(e){return typeof e=="string"?e:e.length===0?"self":e.join(" >>> ")}function ue(e){return typeof e=="string"?e==="self"?[]:[e]:e}function Re(e){return"frames"in e?e.frames:[{frame:"self",include:e.include,...e.exclude?{exclude:e.exclude}:{}}]}function le(e){return"frames"in e?e.frames:[{frame:"self",include:e.include,...e.exclude?{exclude:e.exclude}:{}}]}var Xt=String.raw`
'use strict';

var pending = new Map();
var bridgeSeq = 0;
var networkPolicy = 'deny-all';

${_e()}

function resolveUrl(raw) {
  try {
    return new URL(raw, self.location.href).href;
  } catch (e) {
    return String(raw);
  }
}

function networkGate(rawUrl) {
  var url = resolveUrl(rawUrl);
  if (isNetworkAllowed(networkPolicy, url)) return null;
  var host = networkUrlHost(url);
  self.postMessage({ type: 'network-blocked', host: host });
  var err = new Error('Network request blocked by sandbox network policy: ' + host);
  err.code = 'NETWORK_BLOCKED';
  return err;
}

if (typeof self.fetch === 'function') {
  var originalFetch = self.fetch;
  self.fetch = function (input, init) {
    var raw = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    var blocked = networkGate(raw);
    if (blocked) return Promise.reject(blocked);
    return originalFetch.call(this, input, init);
  };
}

if (typeof XMLHttpRequest !== 'undefined') {
  var originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var blocked = networkGate(url);
    if (blocked) throw blocked;
    return originalXhrOpen.apply(this, arguments);
  };
}

if (typeof WebSocket !== 'undefined') {
  var OriginalWebSocket = WebSocket;
  self.WebSocket = function (url, protocols) {
    var blocked = networkGate(url);
    if (blocked) throw blocked;
    return protocols === undefined
      ? new OriginalWebSocket(url)
      : new OriginalWebSocket(url, protocols);
  };
  self.WebSocket.prototype = OriginalWebSocket.prototype;
}

if (typeof EventSource !== 'undefined') {
  var OriginalEventSource = EventSource;
  self.EventSource = function (url, config) {
    var blocked = networkGate(url);
    if (blocked) throw blocked;
    return config === undefined ? new OriginalEventSource(url) : new OriginalEventSource(url, config);
  };
  self.EventSource.prototype = OriginalEventSource.prototype;
}

function loadModule(source) {
  var url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source);
  return import(url);
}

function assertSerializable(value) {
  try {
    structuredClone(value);
  } catch (e) {
    var err = new Error('Script returned a non-serializable value: ' + String((e && e.message) || e));
    err.code = 'TOOL_EXECUTION_FAILED';
    throw err;
  }
}

function postError(type, id, code, message, extra) {
  var msg = { type: type, id: id, ok: false, error: { code: code, message: message } };
  if (extra) Object.assign(msg, extra);
  self.postMessage(msg);
}

function callCapability(kind, payload) {
  var request = Object.assign({ kind: kind, id: 'br-' + (++bridgeSeq) }, payload);
  return new Promise(function (resolve, reject) {
    pending.set(request.id, { resolve: resolve, reject: reject });
    self.postMessage({ type: 'bridge', request: request });
  }).then(function (response) {
    if (!response.ok) {
      var err = new Error((response.error && response.error.message) || 'capability call failed');
      err.code = (response.error && response.error.code) || 'TOOL_EXECUTION_FAILED';
      throw err;
    }
    return response.value;
  });
}

function makeContext(msg) {
  var ctx = {
    skillName: msg.skillName,
    runId: msg.runId,
    readReference: function (path) {
      return callCapability('readReference', { path: path });
    },
    readAsset: function (path) {
      return callCapability('readAsset', { path: path });
    },
    fetchData: function (sourceId, params) {
      return callCapability('fetchData', { sourceId: sourceId, params: params });
    },
    readAssetBinary: function (path) {
      // 线上是 number[]（与 writeArtifact 同口径），还给脚本的必须是 Uint8Array
      return callCapability('readAssetBinary', { path: path }).then(function (bytes) {
        return new Uint8Array(bytes);
      });
    },
    writeArtifact: function (path, content, options) {
      return callCapability('writeArtifact', {
        path: path,
        content: typeof content === 'string' ? content : Array.from(content || []),
        mimeType: options && options.mimeType,
        metadata: options && options.metadata,
      });
    },
    confirm: function (message) {
      return callCapability('confirm', { message: message });
    },
  };
  // 能力位而非能力函数：其余能力无条件挂上去（拿不到时桥对面报错），
  // documentSurface 是个供探测的布尔值，无条件挂上去就变成恒真谎言。
  if (msg.documentSurface) ctx.documentSurface = true;
  // 上传文件同理：宿主没接就不能给出「存在但必然失败」的假出口（分册 17 FR-17.1）
  if (msg.uploadFiles) {
    ctx.listUploadFiles = function () {
      return callCapability('listUploadFiles', {});
    };
    ctx.readUploadFile = function (fileId) {
      return callCapability('readUploadFile', { fileId: fileId }).then(function (bytes) {
        return new Uint8Array(bytes);
      });
    };
  }
  return ctx;
}

self.onmessage = async function (event) {
  var msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'bridge-response') {
    var entry = pending.get(msg.response && msg.response.id);
    if (entry) {
      pending.delete(msg.response.id);
      entry.resolve(msg.response);
    }
    return;
  }

  if (msg.type === 'load') {
    if (msg.networkPolicy !== undefined) networkPolicy = msg.networkPolicy;
    try {
      var mod = await loadModule(msg.source);
      self.postMessage({
        type: 'load-result',
        id: msg.id,
        ok: true,
        definition: {
          description: typeof mod.description === 'string' ? mod.description : undefined,
          inputSchema: mod.inputSchema !== undefined ? mod.inputSchema : undefined,
          hasRun: typeof mod.run === 'function',
        },
      });
    } catch (e) {
      postError('load-result', msg.id, (e && e.code) || 'TOOL_EXECUTION_FAILED', String((e && e.message) || e));
    }
    return;
  }

  if (msg.type === 'execute') {
    if (msg.networkPolicy !== undefined) networkPolicy = msg.networkPolicy;
    var stdout = [];
    var stderr = [];
    var originals = {
      log: console.log, info: console.info, debug: console.debug,
      warn: console.warn, error: console.error,
    };
    console.log = console.info = console.debug = function () {
      stdout.push(Array.from(arguments).map(String).join(' '));
    };
    console.warn = console.error = function () {
      stderr.push(Array.from(arguments).map(String).join(' '));
    };
    try {
      var mod2 = await loadModule(msg.source);
      if (typeof mod2.run !== 'function') {
        throw new Error('Script does not export a run function');
      }
      var value = await mod2.run(msg.args, makeContext(msg));
      assertSerializable(value);
      self.postMessage({
        type: 'execute-result', id: msg.id, ok: true,
        value: value === undefined ? null : value,
        stdout: stdout, stderr: stderr,
      });
    } catch (e2) {
      postError(
        'execute-result', msg.id,
        (e2 && e2.code) || 'TOOL_EXECUTION_FAILED',
        String((e2 && e2.message) || e2),
        { stdout: stdout, stderr: stderr },
      );
    } finally {
      console.log = originals.log; console.info = originals.info; console.debug = originals.debug;
      console.warn = originals.warn; console.error = originals.error;
    }
  }
};
`,Ue="__webskill_sandbox__",qt=`const ENVELOPE = ${JSON.stringify(Ue)};
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
`,Me=new Set(["image/gif"]),Pe=[.9,.7,.5],de=.75,De=5;async function Fe(e,t){const r=e.size;if(r<=t)return{blob:e,originalBytes:r,compressedBytes:r,scaled:!1};if(Me.has(e.type))throw new q("ATTACHMENT_TYPE_REJECTED",`GIF cannot be compressed without dropping animation; the file is ${z(r)} which exceeds the ${z(t)} limit`);if(typeof createImageBitmap!="function"||typeof OffscreenCanvas!="function")throw new q("ATTACHMENT_TOO_LARGE",`Image is ${z(r)} which exceeds the ${z(t)} limit, and this browser cannot re-encode images`);const n=await createImageBitmap(e);try{let o=n.width,i=n.height,a=!1,s;for(let c=0;c<De;c+=1){for(const l of Pe){const g=await He(n,o,i,l),S={blob:g,originalBytes:r,compressedBytes:g.size,scaled:a,quality:l};if(g.size<=t)return S;(!s||g.size<s.compressedBytes)&&(s=S)}o=Math.max(1,Math.round(o*de)),i=Math.max(1,Math.round(i*de)),a=!0}throw new q("ATTACHMENT_TOO_LARGE",`Image is still ${z(s?.compressedBytes??r)} after compression, which exceeds the ${z(t)} limit`)}finally{n.close()}}async function He(e,t,r,n){const o=new OffscreenCanvas(t,r),i=o.getContext("2d");if(!i)throw new q("ATTACHMENT_TOO_LARGE","Failed to acquire a 2D canvas context for image compression");return i.drawImage(e,0,0,t,r),o.convertToBlob({type:"image/jpeg",quality:n})}function z(e){return`${(e/1024/1024).toFixed(1)} MB`}function Be(e){return"reason"in e}var $e=new Set(["IMG","CANVAS","SVG"]);function je(e){return $e.has(e.tagName.toUpperCase())}function fe(e){let t="";for(let n=0;n<e.length;n+=32768)t+=String.fromCharCode(...e.subarray(n,n+32768));return btoa(t)}function he(e){const t=e.indexOf(",");if(!e.startsWith("data:")||t===-1)return;const r=e.slice(5,t);if(r.endsWith(";base64"))return{mimeType:r.slice(0,-7),data:e.slice(t+1)}}async function K(e,t,r,n){const o=await Fe(r,n),i=o.blob.type.split(";")[0]?.trim().toLowerCase()??"";if(!ne.has(i))throw new Error(`the bytes normalized to "${i===""?"no content type":i}", which is not one of ${[...ne].join(", ")}`);const a=await o.blob.arrayBuffer();return{id:e,mimeType:i,data:fe(new Uint8Array(a)),level:t,originalBytes:o.originalBytes,bytes:o.compressedBytes}}async function Ve(e,t,r){const n=e.currentSrc!==""?e.currentSrc:e.src;if(n==="")throw new Error("the <img> element has no resolved source");const o=Math.max(e.naturalWidth,e.naturalHeight)>re,i=he(n);if(i){const s=Uint8Array.from(atob(i.data),c=>c.charCodeAt(0));return K(t,"src",await Ee(new Blob([s],{type:i.mimeType}),o),r)}const a=await fetch(n,{mode:"cors"});if(a.type==="opaque")throw new Error("the response is opaque, so its bytes cannot be read");if(!a.ok)throw new Error(`fetching the source returned HTTP ${a.status}`);return K(t,"src",await Ee(await a.blob(),o),r)}async function ze(e,t,r){const n=he(e.toDataURL("image/png"));if(n===void 0)throw new Error("the canvas produced an unreadable data URL");const o=Uint8Array.from(atob(n.data),i=>i.charCodeAt(0));return K(t,"canvas",new Blob([o],{type:n.mimeType}),r)}var Ge="http://www.w3.org/2000/svg",pe={width:300,height:150},re=2048;function ge(e,t){const r=e.getAttribute?.(t);if(r==null)return;const n=Number.parseFloat(r);return Number.isFinite(n)&&n>0?n:void 0}function me(e){const t=e.getBoundingClientRect?.();if(t!==void 0&&t.width>0&&t.height>0)return{width:t.width,height:t.height};const{naturalWidth:r,naturalHeight:n}=e;if(typeof r=="number"&&typeof n=="number"&&r>0&&n>0)return{width:r,height:n};const{width:o,height:i}=e;if(typeof o=="number"&&typeof i=="number"&&o>0&&i>0)return{width:o,height:i};const a=ge(e,"width"),s=ge(e,"height");if(a!==void 0&&s!==void 0)return{width:a,height:s};const c=e.getAttribute?.("viewBox")?.trim().split(/[\s,]+/);if(c?.length===4){const l=Number.parseFloat(c[2]??""),g=Number.parseFloat(c[3]??"");if(Number.isFinite(l)&&Number.isFinite(g)&&l>0&&g>0)return{width:l,height:g}}}function We(e){const t=me(e)??pe,r=Math.min(1,re/Math.max(t.width,t.height));return{width:Math.max(1,Math.round(t.width*r)),height:Math.max(1,Math.round(t.height*r))}}var Xe=2e3;async function ve(e){const t=new Image;t.src=e;const r=typeof t.decode=="function"?t.decode():new Promise((o,i)=>{t.onload=()=>o(),t.onerror=()=>i(new Error("the browser could not decode the serialized SVG"))});let n;try{await Promise.race([r,new Promise((o,i)=>{n=setTimeout(()=>i(new Error("decoding the serialized SVG timed out")),Xe)})])}finally{n!==void 0&&clearTimeout(n)}return t}function qe(e,t,r){const{data:n}=e.getImageData(0,0,t,r);for(let o=3;o<n.length;o+=4)if(n[o]!==0)return!1;return!0}async function we(e){return await new Promise((t,r)=>{e.toBlob(n=>{n===null?r(new Error("the canvas could not be encoded as PNG")):t(n)},"image/png")})}async function Ye(e,t,r){if(typeof Image!="function"||typeof document>"u")throw new Error("this environment has no DOM image pipeline, so SVG cannot be rasterized");const{width:n,height:o}=We(e),i=e.cloneNode(!0);i.setAttribute("xmlns",Ge),i.setAttribute("width",String(n)),i.setAttribute("height",String(o));const a=new XMLSerializer().serializeToString(i),s=await ve(`data:image/svg+xml;base64,${fe(new TextEncoder().encode(a))}`),c=document.createElement("canvas");c.width=n,c.height=o;const l=c.getContext("2d");if(l===null)throw new Error("a 2D canvas context is unavailable");if(l.drawImage(s,0,0,n,o),qe(l,n,o))throw new Error("the SVG rendered blank once detached from the page, so its appearance most likely comes from page CSS or external assets that do not apply inside an <img>");return K(t,"canvas",await we(c),r)}var ne=new Set(["image/png","image/jpeg","image/gif","image/webp"]),be=1024;function Ke(e){return[86,80,56,88].every((t,r)=>e[12+r]===t)&&((e[20]??0)&2)!==0}function Je(e){const t=(n,...o)=>o.every((i,a)=>e[n+a]===i);if(t(0,137,80,78,71,13,10,26,10))return"image/png";if(t(0,255,216,255))return"image/jpeg";if(t(0,71,73,70,56))return"image/gif";if(t(0,82,73,70,70)&&t(8,87,69,66,80))return"image/webp";if(t(0,66,77))return"image/bmp";const r=new TextDecoder("utf-8",{fatal:!1}).decode(e.subarray(0,be));if(/<svg[\s>]/i.test(r))return"image/svg+xml"}async function ye(e){if(typeof document>"u"||typeof Image!="function"||typeof URL?.createObjectURL!="function")throw new Error("this environment has no DOM image pipeline, so the image cannot be re-encoded");const t=URL.createObjectURL(e);try{const r=await ve(t),n={width:r.naturalWidth,height:r.naturalHeight},o=n.width>0&&n.height>0?n:pe,i=Math.min(1,re/Math.max(o.width,o.height)),a=Math.max(1,Math.round(o.width*i)),s=Math.max(1,Math.round(o.height*i)),c=document.createElement("canvas");c.width=a,c.height=s;const l=c.getContext("2d");if(l===null)throw new Error("a 2D canvas context is unavailable");return l.drawImage(r,0,0,a,s),await we(c)}finally{URL.revokeObjectURL(t)}}async function Ee(e,t=!1){const r=e.type.split(";")[0]?.trim().toLowerCase()??"",n=new Uint8Array(await e.slice(0,be).arrayBuffer()),o=Je(n);if(o!==void 0&&ne.has(o)){const a=o===r?e:new Blob([e],{type:o}),s=o==="image/gif"||o==="image/webp"&&Ke(n);return t||s?await ye(a):a}const i=o??(r.startsWith("image/")?r:void 0);if(i===void 0)throw new Error(`the response is not a recognizable image (the server described it as "${e.type===""?"no content type":e.type}")`);return await ye(new Blob([e],{type:i}))}async function Qe(e,t){const{id:r,maxBytes:n}=t,o=e.tagName.toUpperCase();if(o==="IMG")try{return await Ve(e,r,n)}catch(i){return{id:r,reason:`L1 could not read the image source: ${oe(i)}`,triedLevels:["src"]}}if(o==="CANVAS")try{return await ze(e,r,n)}catch(i){return{id:r,reason:`L2 could not read the canvas: ${oe(i)}`,triedLevels:["canvas"]}}if(o==="SVG")try{return await Ye(e,r,n)}catch(i){return{id:r,reason:`L2 could not rasterize the SVG: ${oe(i)}`,triedLevels:["canvas"]}}return{id:r,reason:`<${e.tagName.toLowerCase()}> is not a capturable element`,triedLevels:[]}}function oe(e){return e instanceof DOMException&&e.name==="SecurityError"?"the canvas is tainted by cross-origin data":e instanceof TypeError?"the request was blocked, most likely by CORS":e instanceof Error?e.message:String(e)}var Ze=/(?:^|[^a-z])(btn|button|actions?|click(?:able)?|link|menu|nav|tabs?|trigger|operate|operations?|handle|entry|toolbar|[a-z]*icons?(?:[-_][a-z0-9]+)?)(?:[^a-z]|$)/i,et=/[a-z]*icons?[-_]([a-z0-9][a-z0-9-_]*)$/i,tt=["to","routerlink","data-href","data-url"],rt=new Set(["generic","img","cell"]),Se="unlabeled control",nt=5,ot=e=>`${e.getAttribute("class")??""} ${e.getAttribute("id")??""}`;function it(e,t){if(t===null)return!1;try{return t.getComputedStyle(e).cursor==="pointer"}catch{return!1}}function at(e,t){if(t.interactiveHint?.(e)===!0)return!0;const r=e.getAttribute("tabindex");if(r!==null&&r.trim()!==""&&r.trim()!=="-1")return!0;const n=e.getAttribute("title");return n!==null&&n.trim()!==""||Ze.test(ot(e))?!0:it(e,t.view)}function st(e){for(const t of(e.getAttribute("class")??"").split(/\s+/)){const r=et.exec(t);if(r===null)continue;const n=r[1]?.split("__")[0];if(n!==void 0&&n!=="")return n}}function ct(e,t){if(t!==void 0)for(const r of t)for(const n of r.selectors)try{if(e.matches(n))return r.role}catch{}}function ut(e,t){const r=Ae(e,t);if(r!==void 0)return r;for(const o of tt){const i=e.getAttribute(o);if(i!==null&&i.trim()!=="")return i.trim()}const n=e.closest("a[href]");if(n!==null&&n.getAttribute("role")===null)return Ae(n,t)}function Ae(e,t){const r=e.getAttribute("href")??e.getAttribute("xlink:href");if(r===null)return;const n=r.trim();if(!(n===""||n==="#"||/^javascript:/i.test(n)))try{const o=new URL(n,t.baseURI);return o.protocol==="http:"||o.protocol==="https:"?o.href:void 0}catch{return}}function lt(e,t){const r=e.parentElement?.children;let n=0;if(r!==void 0){for(const[a,s]of[...r].entries())if(s===e){n=a+1;break}}const o=n>0?`${Se} #${n}`:Se;let i=e.parentElement;for(let a=0;a<nt&&i!==null;a+=1){const s=t(i);if(s!==void 0&&s!=="")return`${o} in "${s}"`;i=i.parentElement}return o}function dt(e){const{element:t,role:r,doc:n,hasActionableDescendant:o,context:i}=e,a=ct(t,i.roleHints);if(a!==void 0)return{role:a};if(!rt.has(r)||o&&r!=="img"||!at(t,i))return;const s=ut(t,n);return s!==void 0?{role:"link",href:s}:{role:"button"}}var Te=new Set(["password","hidden"]),ft=new Set(["button","checkbox","combobox","form","link","radio","searchbox","switch","textbox"]),ht=new Set(["article","dialog","feed","grid","group","list","listitem","main","navigation","region","row","rowgroup","table","tabpanel","tree","treeitem"]),pt={A:"link",ARTICLE:"article",BUTTON:"button",CANVAS:"img",H1:"heading",H2:"heading",H3:"heading",H4:"heading",H5:"heading",H6:"heading",IMG:"img",LI:"listitem",NAV:"navigation",OL:"list",P:"paragraph",SELECT:"combobox",SVG:"img",TABLE:"table",TD:"cell",TEXTAREA:"textbox",TH:"columnheader",TR:"row",UL:"list"},gt={button:"button",checkbox:"checkbox",radio:"radio",submit:"button"},ke=200,C=e=>{const t=e.replace(/\s+/g," ").trim();return t.length>ke?`${t.slice(0,ke)}…`:t};function mt(e){const t=e;return typeof t.href=="string"&&t.href!==""?t.href:e.getAttribute("href")??void 0}function vt(e){const t=e.getAttribute("role");if(t!==null&&t.trim()!=="")return t.trim();if(e.tagName==="INPUT"){const r=(e.getAttribute("type")??"text").toLowerCase();return gt[r]??"textbox"}return pt[e.tagName.toUpperCase()]??"generic"}function wt(e){let t="";for(const r of e.childNodes)r.nodeType===3&&(t+=r.nodeValue??"");return C(t)}var bt=new Set(["INPUT","TEXTAREA","SELECT"]);function yt(e){const t=e.labels;if(t&&t.length>0){const n=[...t].map(o=>o.textContent??"").filter(o=>o.trim()!=="").join(" ");if(n.trim()!=="")return C(n)}const r=e.closest("label")?.textContent??"";if(r.trim()!=="")return C(r);for(const n of["placeholder","title"]){const o=e.getAttribute(n);if(o!==null&&o.trim()!=="")return C(o)}}function ie(e,t){const r=e.getAttribute("aria-label");if(r!==null&&r.trim()!=="")return C(r);const n=e.getAttribute("aria-labelledby");if(n!==null){const i=n.split(/\s+/).map(a=>t.getElementById(a)?.textContent??"").filter(a=>a.trim()!=="");if(i.length>0)return C(i.join(" "))}if(e.tagName==="IMG"){const i=e.getAttribute("alt");if(i!==null&&i.trim()!=="")return C(i)}if(bt.has(e.tagName))return yt(e);const o=wt(e);return o===""?void 0:o}function Et(e){if(e.tagName==="INPUT"){const t=(e.getAttribute("type")??"text").toLowerCase();if(Te.has(t))return;const r=e.value;return r===""?void 0:C(r)}if(e.tagName==="TEXTAREA"||e.tagName==="SELECT"){const t=e.value;return t===""?void 0:C(t)}if(e.getAttribute("role")==="combobox"){const t=e.getAttribute("data-value");return t===null||t===""?void 0:C(t)}}function St(e,t){if(e.hasAttribute("hidden")||e.getAttribute("aria-hidden")==="true")return!0;const r=e.getAttribute("style")??"";if(/display\s*:\s*none|visibility\s*:\s*hidden/i.test(r))return!0;if(t!==null){const n=t.getComputedStyle(e);if(n.display==="none"||n.visibility==="hidden")return!0}return!1}var At=new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE"]),J="[role=dialog][open], dialog[open], [aria-modal=true]",Tt="Not captured: this image is smaller than the icon threshold";function kt(e,t){if(t<=0)return!1;const r=me(e);return r===void 0?!1:r.width*r.height<t}function Q(e,t,r,n,o,i,a,s,c){if(t.has(e)||At.has(e.tagName)||St(e,n))return;const l=[];for(const d of e.children){const h=Q(d,t,r,n,o,i,a,s,c);h!==void 0&&l.push(h)}let g=ie(e,r);const S=Et(e);let T=vt(e),x;if(c!==void 0){const d=dt({element:e,role:T,doc:r,hasActionableDescendant:l.some(h=>h.ref!==void 0&&i?.isAction(h.ref)===!0),context:c});d!==void 0&&(T=d.role,x=d.href,g===void 0&&(g=C(st(e)??lt(e,h=>ie(h,r)))))}const m=x??(T==="link"?mt(e):void 0);if(T==="generic"&&g===void 0&&S===void 0&&l.length===0)return;if(c!==void 0&&T==="generic"&&g===void 0&&S===void 0&&l.length===1)return l[0];const f={role:T,...g!==void 0?{name:g}:{},...S!==void 0?{value:S}:{},...a!==void 0?{frame:a}:{},...m!==void 0?{href:m}:{},...s!==void 0?{provenance:s}:{},...l.length>0?{children:l}:{}},u=i?.issue(e,T,a);return u!==void 0&&(f.ref=u),o!==void 0&&je(e)&&(kt(e,o.minImageArea)?f.imageNote=Tt:o.targets.push({element:e,node:f})),f}function xt(e,t){const r=o=>{for(let i=o;i!==null;i=i.parentElement)if(t.has(i))return!0;return!1},n=[];e.tagName==="IFRAME"&&!r(e)&&n.push(e);for(const o of e.querySelectorAll("iframe"))r(o)||n.push(o);return n}function Ot(e){for(const t of["aria-label","title","name","id"]){const r=e.getAttribute(t);if(r!==null&&r.trim()!=="")return C(r)}return"unnamed"}function xe(e,t){try{const r=new URL(e,t);return r.protocol==="http:"||r.protocol==="https:"?r.href:void 0}catch{return}}function Nt(e,t){try{const n=e.contentWindow?.location?.href;if(n!==void 0&&n!=="about:blank"){const o=xe(n,t.baseURI);if(o!==void 0)return o}}catch{}const r=e.getAttribute("src");if(!(r===null||r.trim()===""))return xe(r,t.baseURI)}function It(e){try{const t=e.contentDocument;return t===null||t.body===null?void 0:t}catch{return}}var Ct=class{#e=new Map;#n=new WeakMap;#t;#r;constructor(e,t){this.#t=e,this.#r=t}useSets(e,t){this.#t=e,this.#r=t}prune(){for(const[e,t]of this.#e)t.element.isConnected||this.#e.delete(e)}issue(e,t,r){if(!this.#t.has(e)||this.#r.has(e))return;const n=ft.has(t)?"action":ht.has(t)?"anchor":void 0;if(n===void 0)return;const o=this.#n.get(e);if(o!==void 0&&this.#e.has(o))return this.#e.set(o,{element:e,kind:n,...r!==void 0?{frame:r}:{}}),o;const i=new Uint8Array(8);crypto.getRandomValues(i);const a=[...i].map(s=>s.toString(16).padStart(2,"0")).join("");return this.#e.set(a,{element:e,kind:n,...r!==void 0?{frame:r}:{}}),this.#n.set(e,a),a}isAction(e){return this.#e.get(e)?.kind==="action"}get table(){return this.#e}};function Lt(e={}){let t;const r=new Map,n=new Set,o=()=>e.document??globalThis.document,i=u=>e.promoteRoles===!0?{view:u,...e.interactiveHint!==void 0?{interactiveHint:e.interactiveHint}:{},...e.roleHints!==void 0?{roleHints:e.roleHints}:{}}:void 0;function a(u,d){const h=ue(u),p=Y(u);let b=d;const w=[];for(const[E,F]of h.entries()){const R=`step ${E+1} ("${F}") of frame path "${p}"`,U=b.querySelector(F);if(U===null||U.tagName!=="IFRAME")return{note:{frame:p,reason:"not-found",message:`Frame ${R} was not found in the page.`}};const H=U;let M,P;try{M=H.contentDocument,P=H.contentWindow?.location.origin}catch{M=null}if(M===null||P===void 0)return{note:{frame:p,reason:"cross-origin",message:`Frame ${R} is cross-origin and was not read.`}};const O=Y(h.slice(0,E+1)),W=r.get(O);if(W===void 0)r.set(O,P);else if(W!==P)return{note:{frame:p,reason:"origin-changed",message:`Frame ${R} now points at ${P} instead of the authorized ${W}; the grant was revoked.`}};b=M,w.push(H)}return{doc:b,frames:w}}const s=(u,d)=>{const h=new Set,p=new Set;if(d===void 0||d.include.length===0)return{actionable:h,excluded:p};for(const b of d.include)for(const w of u.querySelectorAll(b)){h.add(w);for(const E of w.querySelectorAll("*"))h.add(E)}for(const b of d.exclude??[])for(const w of u.querySelectorAll(b)){p.add(w);for(const E of w.querySelectorAll("*"))p.add(E)}return{actionable:h,excluded:p}},c=u=>e.actionScope===void 0?void 0:le(e.actionScope).find(d=>Y(d.frame)===u);function l(u,d,h){const p=o();if(p===void 0)return{nodes:[],frameNotes:[],nestedFrames:[],anchored:!1};t??=new Ct(new Set,new Set),t.prune();const b=t,w=[],E=[],F=[],R=new Set,U=[],H=new Set;for(const v of Re(u)){if(v.include.length===0)continue;const k=Y(v.frame),A=a(v.frame,p);if("note"in A){E.push(A.note),w.push({role:"note",name:A.note.message,frame:k});continue}for(const B of A.frames)H.add(B);U.push({scope:v,label:k,doc:A.doc})}function M(v,k,A,B,$,I,j,L){for(const N of v)for(const y of xt(N,A)){if(H.has(y)||R.has(y))continue;R.add(y);const D=Ot(y);if(e.discoverNestedFrames===!0){const X=Nt(y,k);if(X!==void 0){F.push({url:X,hint:D,...I!==void 0?{frame:I}:{}});continue}const V=It(y);if(V!==void 0&&P(V,y,B,$,I,j,L))continue}w.push({role:"note",name:`A nested frame "${D}" inside "${$}" is not part of the authorized scope and was not read. Ask the user to authorize it if its content is needed.`,...I!==void 0?{frame:I}:{}})}}function P(v,k,A,B,$,I,j){const L=new Set;for(const V of A.exclude??[])for(const ce of v.querySelectorAll(V))L.add(ce);const N=new Set,y=new Set;if(I.has(k)){N.add(v.body);for(const V of v.body.querySelectorAll("*"))N.add(V);for(const V of c(B)?.exclude??[])for(const ce of v.querySelectorAll(V))y.add(ce)}b.useSets(N,y);const D=v.defaultView,X=Q(v.body,L,v,D,d,b,$,"inline-frame",i(D));return X!==void 0&&w.push(X),M([v.body],v,L,A,B,$,N,y),b.useSets(I,j),X!==void 0}let O=h===void 0;for(const{scope:v,label:k,doc:A}of U){const B=A.defaultView,$=k==="self"?void 0:k,I=s(A,c(k));b.useSets(I.actionable,I.excluded);const j=new Set;for(const N of v.exclude??[])for(const y of A.querySelectorAll(N))j.add(y);let L=[];for(const N of v.include)for(const y of A.querySelectorAll(N))L.includes(y)||L.push(y);if(h!==void 0){const N=L.some(D=>D===h||D.contains(h)),y=[...j].some(D=>D===h||D.contains(h));if(!N||y)continue;L=[h],O=!0}for(const N of L){const y=Q(N,j,A,B,d,b,$,void 0,i(B));y!==void 0&&w.push(y)}M(L,A,j,v,k,$,I.actionable,I.excluded)}if(h!==void 0)return{nodes:w,frameNotes:E,nestedFrames:F,anchored:O};m();const W=p.defaultView,Gt=s(p,c("self"));for(const v of n){b.useSets(new Set([v,...v.querySelectorAll("*")]),Gt.excluded);const k=Q(v,new Set,p,W,d,b,void 0,"modal-elevated",i(W));k!==void 0&&w.push(k)}for(const v of p.querySelectorAll(J)){if(n.has(v))continue;const k=ie(v,p)??"dialog";w.push({role:"note",name:`The dialog "${k}" is open but outside the authorized scope because it was opened manually. Ask the user to let you open it instead.`})}return{nodes:w,frameNotes:E,nestedFrames:F,anchored:O}}async function g(u,d,h){const p=[],{nodes:b,frameNotes:w,nestedFrames:E,anchored:F}=l(u,{targets:p,minImageArea:d.minImageArea??0},h),R=p.slice(0,d.maxImages),U=[];let H=0;for(const[M,P]of R.entries()){const O=await Qe(P.element,{id:`img-${M+1}`,maxBytes:d.maxImageBytes});if(Be(O)){P.node.imageNote=O.reason,H+=1;continue}P.node.imageId=O.id,U.push({id:O.id,mimeType:O.mimeType,data:O.data,level:O.level})}for(const M of p.slice(d.maxImages))M.node.imageNote="Not captured: the per-message image limit was reached";return{nodes:b,images:U,imagesOmitted:p.length-R.length,imageFailures:H,anchored:F,...w.length>0?{frameNotes:w}:{},...E.length>0?{nestedFrames:E}:{}}}function S(u,d){if(d===void 0)return l(u,void 0).nodes;if(!d.images||d.maxImages<=0){const{nodes:h,frameNotes:p,nestedFrames:b}=l(u,void 0);return Promise.resolve({nodes:h,...p.length>0?{frameNotes:p}:{},...b.length>0?{nestedFrames:b}:{}})}return g(u,d)}async function T(u,d,h){const p=t?.table.get(d)?.element;if(p===void 0||!p.isConnected)return{rejected:"unknown-ref"};if(h?.images===!0&&h.maxImages>0){const{anchored:R,...U}=await g(u,h,p);return R?U:{rejected:"out-of-scope"}}const{nodes:b,frameNotes:w,nestedFrames:E,anchored:F}=l(u,void 0,p);return F?{nodes:b,...w.length>0?{frameNotes:w}:{},...E.length>0?{nestedFrames:E}:{}}:{rejected:"out-of-scope"}}function x(){const u=o();return u===void 0?new Set:new Set(u.querySelectorAll(J))}function m(){for(const u of n)u.isConnected&&u.matches(J)||n.delete(u)}return{read:S,readSubtree:T,resolve:u=>t?.table.get(u)?.element,handleKindOf:u=>t?.table.get(u)?.kind,frameOf:u=>t?.table.get(u)?.frame,modalSnapshot:x,elevateNewModals:u=>{m();for(const d of x())if(!u.has(d))return n.add(d),d},modalStateOf:u=>{m();const d=u.closest(J);return d===null?"none":n.has(d)?"elevated":"unelevated"},inActionScope:u=>{const d=u.ownerDocument,h=f(d);if(h===void 0)return!1;const p=s(d,c(h));return p.actionable.has(u)&&!p.excluded.has(u)}};function f(u){const d=o();if(d!==void 0){if(u===d)return"self";if(e.actionScope!==void 0)for(const h of le(e.actionScope)){if(ue(h.frame).length===0)continue;const p=a(h.frame,d);if(!("note"in p)&&p.doc===u)return Y(h.frame)}}}}var _t=(()=>{const e=new Uint8Array(8);return crypto.getRandomValues(e),[...e].map(t=>t.toString(16).padStart(2,"0")).join("")})();function G(e){const t=e?.location.href;return t===void 0?void 0:`${_t}\0${t}`}var Rt=new Set(["INPUT","TEXTAREA"]);function Ut(e){if(e.hasAttribute("hidden")||e.getAttribute("aria-hidden")==="true")return!0;const t=e.getAttribute("style")??"";if(/display\s*:\s*none|visibility\s*:\s*hidden/i.test(t))return!0;const r=e.ownerDocument.defaultView;if(r!==null){const n=r.getComputedStyle(e);if(n.display==="none"||n.visibility==="hidden")return!0}return!1}var Oe=e=>(e.getAttribute("type")??"text").toLowerCase(),Mt=e=>e.tagName==="INPUT"&&Te.has(Oe(e)),Z=e=>e?.textContent?.replace(/\s+/g," ").trim()??"";function ee(e){const t=e.getAttribute("aria-labelledby");if(t!==null&&t.trim()!==""){const c=e.ownerDocument,l=t.split(/\s+/).map(g=>Z(c.getElementById(g))).filter(g=>g!=="").join(" ");if(l!=="")return l}const r=e.getAttribute("aria-label");if(r!==null&&r.trim()!=="")return r.trim();const n=e.labels;if(n&&n.length>0){const c=[...n].map(l=>Z(l)).filter(l=>l!=="").join(" ");if(c!=="")return c}const o=Z(e);if(o!=="")return o;const i=Z(e.closest("label"));if(i!=="")return i;const a=e.getAttribute("placeholder");if(a!==null&&a.trim()!=="")return a.trim();const s=e.getAttribute("title");return s!==null&&s.trim()!==""?s.trim():void 0}function Pt(e){const t=e.getAttribute("role");if(t!==null&&t.trim()!=="")return t.trim();if(e.tagName==="INPUT"){const r=Oe(e);return r==="checkbox"||r==="radio"?r:r==="button"||r==="submit"?"button":"textbox"}return e.tagName==="BUTTON"?"button":e.tagName==="A"?"link":e.tagName==="TEXTAREA"?"textbox":e.tagName==="SELECT"?"combobox":e.tagName==="FORM"?"form":"generic"}var ae=e=>{const t=ee(e);return{role:Pt(e),...t!==void 0?{name:t}:{},...Mt(e)?{secret:!0}:{}}};function Dt(e,t){const r=e.tagName==="INPUT"?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,n=Object.getOwnPropertyDescriptor(r,"value")?.set;n?n.call(e,t):e.value=t,e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}))}var _=e=>(e??"").replace(/\s+/g," ").trim().toLowerCase();function se(e){const t=e.ownerDocument.defaultView,r=e.getBoundingClientRect(),n={bubbles:!0,cancelable:!0,composed:!0,detail:1,button:0,clientX:r.left+r.width/2,clientY:r.top+r.height/2},o={...n,pointerId:1,pointerType:"mouse",isPrimary:!0},i=t?.PointerEvent;i!==void 0&&e.dispatchEvent(new i("pointerdown",{...o,buttons:1})),e.dispatchEvent(new MouseEvent("mousedown",{...n,buttons:1}))&&e.focus?.(),i!==void 0&&e.dispatchEvent(new i("pointerup",{...o,buttons:0})),e.dispatchEvent(new MouseEvent("mouseup",{...n,buttons:0})),e.click()}async function te(e,t=2e3){const r=Date.now()+t;for(;;){const n=e();if(n!==void 0)return n;if(Date.now()>=r)return;await new Promise(o=>setTimeout(o,25))}}async function Ft(e,t){const r=ae(e),n=s=>({ok:!1,target:r,reason:s});if(t==="")return n("The select action needs a value.");if(e.tagName==="SELECT"){const s=e,c=[...s.options].find(l=>_(l.label)===_(t)||_(l.value)===_(t));return c===void 0?n(`No option named "${t}" is available.`):(s.value=c.value,s.dispatchEvent(new Event("input",{bubbles:!0})),s.dispatchEvent(new Event("change",{bubbles:!0})),_(s.selectedOptions[0]?.label)===_(c.label)?{ok:!0,target:r}:n(`The control did not accept "${t}".`))}const o=e.ownerDocument;se(e);const i=await te(()=>o.querySelector("[role=listbox], [role=grid], [role=menu]")??void 0);if(i==null)return n("The options panel did not open.");const a=[...i.querySelectorAll("[role=option], [role=gridcell], [role=menuitem], option")].find(s=>_(ee(s))===_(t));return a===void 0?n(`No option named "${t}" is available.`):(a.click(),await te(()=>{const s=`${ee(e)??""} ${e.value??""}`;return _(s).includes(_(t))?!0:void 0})===!0?{ok:!0,target:r}:n(`The control did not settle on "${t}".`))}function Ht(e,t,r){const n=_(t);if(n!=="true"&&n!=="false")return{ok:!1,target:r,reason:'Use "true" or "false".'};const o=n==="true",i=e.getAttribute("aria-checked")??e.getAttribute("aria-pressed"),a=i!==null?i==="true":e.tagName==="INPUT"?e.checked:void 0;return a===void 0?{ok:!1,target:r,reason:"The element is not a toggle."}:a===o?{ok:!0,target:r,noop:!0}:(se(e),{ok:!0,target:r})}function Bt(e,t){try{const r=new DataTransfer;for(const n of t)r.items.add(n);e.files=r.files}catch(r){return`This browser cannot attach files programmatically: ${r instanceof Error?r.message:String(r)}`}e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}))}function $t(e){const{reader:t}=e,r=(a,s)=>{const c=t.frameOf(a);return{...s,...c!==void 0?{frame:c}:{}}},n=a=>{const s=t.resolve(a);if(s===void 0)return;const c=r(a,ae(s));return t.modalStateOf(s)==="elevated"?{...c,elevated:!0}:c},o=async()=>{const a=(e.document??globalThis.document)?.defaultView,s={role:"document"};if(a==null)return{ok:!1,target:s,reason:"No browsing context is available."};if(a.history.length<=1)return{ok:!0,target:s,noop:!0};const c=G(a);return a.history.back(),await te(()=>{const l=G(a);return l!==void 0&&l!==c?l:void 0},500)===void 0?{ok:!0,target:s,noop:!0}:{ok:!0,target:s,navigated:!0,documentUrl:a.location.href}};return{execute:async a=>{if(a.action==="back")return await o();const s=t.resolve(a.ref);if(s===void 0)return{ok:!1,target:{role:"generic"},reason:"The element reference is unknown or expired."};const c=r(a.ref,ae(s)),l=f=>({ok:!1,target:c,reason:f});if(t.handleKindOf(a.ref)==="anchor")return l("That reference points at a container, which cannot be acted on. Use it with perceive_page to read inside it, then act on an element found there.");if(t.modalStateOf(s)==="unelevated")return l("That dialog is not in the authorized scope because it was opened manually. Ask me to open it, or add it to the host allowlist.");if(t.modalStateOf(s)!=="elevated"&&!t.inActionScope(s))return l("The element is no longer inside the actionable scope.");if(Ut(s))return l("The element is not visible.");if(s.hasAttribute("disabled"))return l("The element is disabled.");const g=t.modalSnapshot(),S=s.ownerDocument.defaultView,T=G(S),x=async f=>{if(!f.ok)return f;const u=await te(()=>{const w=t.elevateNewModals(g);if(w!==void 0)return{modal:w};const E=G(S);return E!==void 0&&E!==T?{key:E}:void 0},500),d=u!==void 0&&"modal"in u?u.modal:t.elevateNewModals(g),h=d===void 0?void 0:ee(d)??"dialog",p=G(S);return{...f,...h!==void 0?{elevatedModal:h}:{},...p!==void 0&&T!==void 0&&p!==T?{navigated:!0,documentUrl:S?.location.href}:{}}};if(a.action==="click")return se(s),await x({ok:!0,target:c});if(a.action==="fill")return Rt.has(s.tagName)?s.hasAttribute("readonly")?l("The element is read-only."):(Dt(s,a.value??""),await x({ok:!0,target:c})):l("The element is not a text control.");if(a.action==="select"){const f=await Ft(s,a.value??"");return f.ok?await x({...f,target:c}):{...f,target:c}}if(a.action==="set")return await x(Ht(s,a.value??"",c));if(a.action==="attach"){const f=await e.pickFiles?.();if(f===void 0||f.length===0)return{ok:!1,target:c,reason:"The user cancelled the file selection."};if(s.tagName!=="INPUT"||s.type!=="file")return l("The element is not a file input.");const u=Bt(s,f);return u!==void 0?l(u):await x({ok:!0,target:c})}const m=s.tagName==="FORM"?s:s.form;return m?(m.requestSubmit(),await x({ok:!0,target:c})):l("The element does not belong to a form.")},describe:n}}function Ne(e,t=[]){for(const r of e)r.ref!==void 0&&t.push(r.ref),r.children!==void 0&&Ne(r.children,t);return t}function jt(e={}){const t=Lt({...e.document!==void 0?{document:e.document}:{},...e.actionScope!==void 0?{actionScope:e.actionScope}:{},...e.promoteRoles!==void 0?{promoteRoles:e.promoteRoles}:{},...e.interactiveHint!==void 0?{interactiveHint:e.interactiveHint}:{},...e.roleHints!==void 0?{roleHints:e.roleHints}:{},...e.discoverNestedFrames!==void 0?{discoverNestedFrames:e.discoverNestedFrames}:{}}),r=$t({reader:t,...e.document!==void 0?{document:e.document}:{},...e.pickFiles!==void 0?{pickFiles:e.pickFiles}:{}}),n=()=>{const o=e.document??globalThis.document,i=G(o?.defaultView);if(i===void 0)return;const a=o.defaultView?.location.href,s=o.title;return{key:i,...a!==void 0?{url:a}:{},...s!==void 0&&s!==""?{title:s}:{}}};return{async handle(o){try{if(o.type==="perceive"){const i=o.capture===void 0?t.read(o.scope):await t.read(o.scope,o.capture),a=Array.isArray(i)?{nodes:i}:i,s=[];for(const l of Ne(a.nodes)){const g=r.describe(l);g!==void 0&&s.push({ref:l,...g})}const c=n();return{type:"perceive-result",result:a,targets:s,...c!==void 0?{document:c}:{}}}return{type:"execute-result",outcome:await r.execute(o.request)}}catch(i){return{type:"error",code:i instanceof q?i.code:"TOOL_EXECUTION_FAILED",message:i instanceof Error?i.message:String(i)}}}}}var Vt={include:["body"],exclude:["input[type=password]","input[type=hidden]",'[autocomplete^="cc-"]',"[data-ccs-no-ai]"]},zt=[];(()=>{const e="ccs-fetch-proxy",t=EventTarget.prototype.addEventListener,r=Event.prototype.stopImmediatePropagation,n=window.postMessage.bind(window),o=new WeakSet,i=new Set(["click","mousedown","mouseup","pointerdown","pointerup"]);let a;function s(){if(a!==void 0)return a;try{const m=document,f=m.permissionsPolicy??m.featurePolicy;a=!!((typeof f?.features=="function"?f.features().includes("unload"):!1)&&typeof f?.allowsFeature=="function"&&!f.allowsFeature("unload"))}catch{a=!1}return a}function c(m,f,u){m==="unload"&&s()||(i.has(m)&&this instanceof Element&&o.add(this),t.call(this,m,f,u))}EventTarget.prototype.addEventListener=c;function l(){EventTarget.prototype.addEventListener===c&&(EventTarget.prototype.addEventListener=t)}const g=jt({actionScope:Vt,promoteRoles:!0,interactiveHint:m=>o.has(m),roleHints:zt,discoverNestedFrames:!0});let S;const T=m=>{n({__ccsExt:!0,proto:e,to:"iso",...m},location.origin)};async function x(m,f,u){try{const d=u;if(f!==(d?.type==="execute"?"act":"perceive"))throw new Error(`op/payload mismatch: op=${String(f)} type=${String(d?.type)}`);const h=await g.handle(d);T({kind:"CCS_EXT_DOM_EXECUTE_RESULT",reqId:m,ok:!0,result:{reply:h,documentUrl:location.href}})}catch(d){T({kind:"CCS_EXT_DOM_EXECUTE_RESULT",reqId:m,ok:!1,error:d?.message??String(d)})}}t.call(window,"message",(m=>{if(m.source!==window||m.origin!==location.origin)return;const f=m.data;if(!(!f||f.__ccsExt!==!0||f.proto!==e)&&f.to==="dom"){if(r.call(m),f.kind==="CCS_EXT_HANDSHAKE"){S===void 0&&typeof f.token=="string"&&(S=f.token);return}S===void 0||f.token!==S||(f.kind==="CCS_EXT_DOM_DISARM"?l():f.kind==="CCS_EXT_DOM_EXECUTE"&&typeof f.reqId=="string"&&x(f.reqId,f.op,f.payload))}}))})()})();
