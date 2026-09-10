(function(){var q=class extends Error{code;details;constructor(e,t,n){super(t),this.name="WebSkillError",this.code=e,this.details=n}},Ie=["text","number","boolean","select","textarea","file","password","date"],nn={type:"object",properties:{question:{type:"string",description:"A single question. Use it only when one answer is genuinely all you need."},fields:{type:"array",maxItems:20,description:"Collect several answers in one form. Use this whenever you need more than one piece of information, so the user fills everything in once instead of answering a chain of questions.",items:{type:"object",properties:{name:{type:"string",description:"Key this answer is returned under."},label:{type:"string",description:"Short label shown next to the input."},type:{type:"string",enum:[...Ie],description:'Input kind. Use "date" for dates; the value comes back as a YYYY-MM-DD string.'},required:{type:"boolean"},description:{type:"string",description:"Help text shown under the input."},defaultValue:{description:"A value the user already stated in this conversation; it is filled into the input for them. Only pass it when the user actually said it — do not guess."},options:{type:"array",items:{type:"object",properties:{label:{type:"string"},value:{}},required:["label","value"]},description:'Choices for a "select" field. Required when type is "select".'}},required:["name","label","type"]}},choices:{type:"array",items:{type:"string"},description:"Closed set of acceptable answers for the single-question form. Provide it whenever the answer must be one of a known finite set, for example when asking which installed skill to use. The user then picks from a list instead of typing free text."},suggestion:{type:"string",description:"A value you believe the user is likely to answer, based only on the profile in the system prompt. It is shown as a suggestion the user may accept; it is never filled in for them. Omit it when nothing in the profile supports a value."},suggestionReason:{type:"string",description:"Short reason for the suggestion, shown next to it so the user can judge whether to accept it."}}};function Re(e,t){if(e==="allow-all")return!0;if(e==="deny-all"||!e||typeof e!="object")return!1;var n=e.allow;if(!Array.isArray(n))return!1;var r;try{r=new URL(t)}catch{return!1}for(var o=r.hostname.toLowerCase(),i=0;i<n.length;i++){var l=n[i];if(!(typeof l!="string"||l==="")){if(l.indexOf("://")!==-1){try{if(new URL(l).origin===r.origin)return!0}catch{}continue}var a=l.toLowerCase();if(a.indexOf("*.")===0){var c=a.slice(2);if(o===c||o.endsWith("."+c))return!0}else if(o===a)return!0}}return!1}function Me(e){try{return new URL(e).hostname}catch{return"(unparseable-url)"}}function Ue(){return`var isNetworkAllowed = ${Re.toString()};
var networkUrlHost = ${Me.toString()};`}function Y(e){return typeof e=="string"?e:e.length===0?"self":e.join(" >>> ")}function ue(e){return typeof e=="string"?e==="self"?[]:[e]:e}function Pe(e){return"frames"in e?e.frames:[{frame:"self",include:e.include,...e.exclude?{exclude:e.exclude}:{}}]}function de(e){return"frames"in e?e.frames:[{frame:"self",include:e.include,...e.exclude?{exclude:e.exclude}:{}}]}var rn=String.raw`
'use strict';

var pending = new Map();
var bridgeSeq = 0;
var networkPolicy = 'deny-all';

${Ue()}

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
`,De="__webskill_sandbox__",on=`const ENVELOPE = ${JSON.stringify(De)};
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
`,He=new Set(["image/gif"]),Fe=[.9,.7,.5],fe=.75,Be=5;async function $e(e,t){const n=e.size;if(n<=t)return{blob:e,originalBytes:n,compressedBytes:n,scaled:!1};if(He.has(e.type))throw new q("ATTACHMENT_TYPE_REJECTED",`GIF cannot be compressed without dropping animation; the file is ${z(n)} which exceeds the ${z(t)} limit`);if(typeof createImageBitmap!="function"||typeof OffscreenCanvas!="function")throw new q("ATTACHMENT_TOO_LARGE",`Image is ${z(n)} which exceeds the ${z(t)} limit, and this browser cannot re-encode images`);const r=await createImageBitmap(e);try{let o=r.width,i=r.height,l=!1,a;for(let c=0;c<Be;c+=1){for(const u of Fe){const h=await Ve(r,o,i,u),w={blob:h,originalBytes:n,compressedBytes:h.size,scaled:l,quality:u};if(h.size<=t)return w;(!a||h.size<a.compressedBytes)&&(a=w)}o=Math.max(1,Math.round(o*fe)),i=Math.max(1,Math.round(i*fe)),l=!0}throw new q("ATTACHMENT_TOO_LARGE",`Image is still ${z(a?.compressedBytes??n)} after compression, which exceeds the ${z(t)} limit`)}finally{r.close()}}async function Ve(e,t,n,r){const o=new OffscreenCanvas(t,n),i=o.getContext("2d");if(!i)throw new q("ATTACHMENT_TOO_LARGE","Failed to acquire a 2D canvas context for image compression");return i.drawImage(e,0,0,t,n),o.convertToBlob({type:"image/jpeg",quality:r})}function z(e){return`${(e/1024/1024).toFixed(1)} MB`}function je(e){return"reason"in e}var ze=new Set(["IMG","CANVAS","SVG"]);function Ge(e){return ze.has(e.tagName.toUpperCase())}function he(e){let t="";for(let r=0;r<e.length;r+=32768)t+=String.fromCharCode(...e.subarray(r,r+32768));return btoa(t)}function pe(e){const t=e.indexOf(",");if(!e.startsWith("data:")||t===-1)return;const n=e.slice(5,t);if(n.endsWith(";base64"))return{mimeType:n.slice(0,-7),data:e.slice(t+1)}}async function K(e,t,n,r){const o=await $e(n,r),i=o.blob.type.split(";")[0]?.trim().toLowerCase()??"";if(!re.has(i))throw new Error(`the bytes normalized to "${i===""?"no content type":i}", which is not one of ${[...re].join(", ")}`);const l=await o.blob.arrayBuffer();return{id:e,mimeType:i,data:he(new Uint8Array(l)),level:t,originalBytes:o.originalBytes,bytes:o.compressedBytes}}async function We(e,t,n){const r=e.currentSrc!==""?e.currentSrc:e.src;if(r==="")throw new Error("the <img> element has no resolved source");const o=Math.max(e.naturalWidth,e.naturalHeight)>ne,i=pe(r);if(i){const a=Uint8Array.from(atob(i.data),c=>c.charCodeAt(0));return K(t,"src",await Se(new Blob([a],{type:i.mimeType}),o),n)}const l=await fetch(r,{mode:"cors"});if(l.type==="opaque")throw new Error("the response is opaque, so its bytes cannot be read");if(!l.ok)throw new Error(`fetching the source returned HTTP ${l.status}`);return K(t,"src",await Se(await l.blob(),o),n)}async function Xe(e,t,n){const r=pe(e.toDataURL("image/png"));if(r===void 0)throw new Error("the canvas produced an unreadable data URL");const o=Uint8Array.from(atob(r.data),i=>i.charCodeAt(0));return K(t,"canvas",new Blob([o],{type:r.mimeType}),n)}var qe="http://www.w3.org/2000/svg",ge={width:300,height:150},ne=2048;function me(e,t){const n=e.getAttribute?.(t);if(n==null)return;const r=Number.parseFloat(n);return Number.isFinite(r)&&r>0?r:void 0}function ve(e){const t=e.getBoundingClientRect?.();if(t!==void 0&&t.width>0&&t.height>0)return{width:t.width,height:t.height};const{naturalWidth:n,naturalHeight:r}=e;if(typeof n=="number"&&typeof r=="number"&&n>0&&r>0)return{width:n,height:r};const{width:o,height:i}=e;if(typeof o=="number"&&typeof i=="number"&&o>0&&i>0)return{width:o,height:i};const l=me(e,"width"),a=me(e,"height");if(l!==void 0&&a!==void 0)return{width:l,height:a};const c=e.getAttribute?.("viewBox")?.trim().split(/[\s,]+/);if(c?.length===4){const u=Number.parseFloat(c[2]??""),h=Number.parseFloat(c[3]??"");if(Number.isFinite(u)&&Number.isFinite(h)&&u>0&&h>0)return{width:u,height:h}}}function Ye(e){const t=ve(e)??ge,n=Math.min(1,ne/Math.max(t.width,t.height));return{width:Math.max(1,Math.round(t.width*n)),height:Math.max(1,Math.round(t.height*n))}}var Ke=2e3;async function we(e){const t=new Image;t.src=e;const n=typeof t.decode=="function"?t.decode():new Promise((o,i)=>{t.onload=()=>o(),t.onerror=()=>i(new Error("the browser could not decode the serialized SVG"))});let r;try{await Promise.race([n,new Promise((o,i)=>{r=setTimeout(()=>i(new Error("decoding the serialized SVG timed out")),Ke)})])}finally{r!==void 0&&clearTimeout(r)}return t}function Je(e,t,n){const{data:r}=e.getImageData(0,0,t,n);for(let o=3;o<r.length;o+=4)if(r[o]!==0)return!1;return!0}async function be(e){return await new Promise((t,n)=>{e.toBlob(r=>{r===null?n(new Error("the canvas could not be encoded as PNG")):t(r)},"image/png")})}async function Qe(e,t,n){if(typeof Image!="function"||typeof document>"u")throw new Error("this environment has no DOM image pipeline, so SVG cannot be rasterized");const{width:r,height:o}=Ye(e),i=e.cloneNode(!0);i.setAttribute("xmlns",qe),i.setAttribute("width",String(r)),i.setAttribute("height",String(o));const l=new XMLSerializer().serializeToString(i),a=await we(`data:image/svg+xml;base64,${he(new TextEncoder().encode(l))}`),c=document.createElement("canvas");c.width=r,c.height=o;const u=c.getContext("2d");if(u===null)throw new Error("a 2D canvas context is unavailable");if(u.drawImage(a,0,0,r,o),Je(u,r,o))throw new Error("the SVG rendered blank once detached from the page, so its appearance most likely comes from page CSS or external assets that do not apply inside an <img>");return K(t,"canvas",await be(c),n)}var re=new Set(["image/png","image/jpeg","image/gif","image/webp"]),ye=1024;function Ze(e){return[86,80,56,88].every((t,n)=>e[12+n]===t)&&((e[20]??0)&2)!==0}function et(e){for(let t=8;t+4<=e.length;t+=1){if(e[t]===73&&e[t+1]===68&&e[t+2]===65&&e[t+3]===84)return!1;if(e[t]===97&&e[t+1]===99&&e[t+2]===84&&e[t+3]===76)return!0}return!1}function tt(e){const t=(r,...o)=>o.every((i,l)=>e[r+l]===i);if(t(0,137,80,78,71,13,10,26,10))return"image/png";if(t(0,255,216,255))return"image/jpeg";if(t(0,71,73,70,56))return"image/gif";if(t(0,82,73,70,70)&&t(8,87,69,66,80))return"image/webp";if(t(0,66,77))return"image/bmp";const n=new TextDecoder("utf-8",{fatal:!1}).decode(e.subarray(0,ye));if(/<svg[\s>]/i.test(n))return"image/svg+xml"}async function Ee(e){if(typeof document>"u"||typeof Image!="function"||typeof URL?.createObjectURL!="function")throw new Error("this environment has no DOM image pipeline, so the image cannot be re-encoded");const t=URL.createObjectURL(e);try{const n=await we(t),r={width:n.naturalWidth,height:n.naturalHeight},o=r.width>0&&r.height>0?r:ge,i=Math.min(1,ne/Math.max(o.width,o.height)),l=Math.max(1,Math.round(o.width*i)),a=Math.max(1,Math.round(o.height*i)),c=document.createElement("canvas");c.width=l,c.height=a;const u=c.getContext("2d");if(u===null)throw new Error("a 2D canvas context is unavailable");return u.drawImage(n,0,0,l,a),await be(c)}finally{URL.revokeObjectURL(t)}}async function Se(e,t=!1){const n=e.type.split(";")[0]?.trim().toLowerCase()??"",r=new Uint8Array(await e.slice(0,ye).arrayBuffer()),o=tt(r);if(o!==void 0&&re.has(o)){const l=o===n?e:new Blob([e],{type:o}),a=o==="image/gif"||o==="image/webp"&&Ze(r)||o==="image/png"&&et(r);return t||a?await Ee(l):l}const i=o??(n.startsWith("image/")?n:void 0);if(i===void 0)throw new Error(`the response is not a recognizable image (the server described it as "${e.type===""?"no content type":e.type}")`);return await Ee(new Blob([e],{type:i}))}async function nt(e,t){const{id:n,maxBytes:r}=t,o=e.tagName.toUpperCase();if(o==="IMG")try{return await We(e,n,r)}catch(i){return{id:n,reason:`L1 could not read the image source: ${oe(i)}`,triedLevels:["src"]}}if(o==="CANVAS")try{return await Xe(e,n,r)}catch(i){return{id:n,reason:`L2 could not read the canvas: ${oe(i)}`,triedLevels:["canvas"]}}if(o==="SVG")try{return await Qe(e,n,r)}catch(i){return{id:n,reason:`L2 could not rasterize the SVG: ${oe(i)}`,triedLevels:["canvas"]}}return{id:n,reason:`<${e.tagName.toLowerCase()}> is not a capturable element`,triedLevels:[]}}function oe(e){return e instanceof DOMException&&e.name==="SecurityError"?"the canvas is tainted by cross-origin data":e instanceof TypeError?"the request was blocked, most likely by CORS":e instanceof Error?e.message:String(e)}var rt=/(?:^|[^a-z])(btn|button|actions?|click(?:able)?|link|menu|nav|tabs?|trigger|operate|operations?|handle|entry|toolbar|[a-z]*icons?(?:[-_][a-z0-9]+)?)(?:[^a-z]|$)/i,ot=/[a-z]*icons?[-_]([a-z0-9][a-z0-9-_]*)$/i,it=["to","routerlink","data-href","data-url"],at=new Set(["generic","img","cell","listitem"]),Te="unlabeled control",st=5,ct=e=>`${e.getAttribute("class")??""} ${e.getAttribute("id")??""}`;function lt(e,t){if(t===null)return!1;try{return t.getComputedStyle(e).cursor==="pointer"}catch{return!1}}function ut(e,t){if(t.interactiveHint?.(e)===!0)return!0;const n=e.getAttribute("tabindex");if(n!==null&&n.trim()!==""&&n.trim()!=="-1")return!0;const r=e.getAttribute("title");return r!==null&&r.trim()!==""||rt.test(ct(e))?!0:lt(e,t.view)}function dt(e){for(const t of(e.getAttribute("class")??"").split(/\s+/)){const n=ot.exec(t);if(n===null)continue;const r=n[1]?.split("__")[0];if(r!==void 0&&r!=="")return r}}function ft(e,t){if(t!==void 0)for(const n of t)for(const r of n.selectors)try{if(e.matches(r))return n.role}catch{}}function ht(e,t){const n=Ae(e,t);if(n!==void 0)return n;for(const o of it){const i=e.getAttribute(o);if(i!==null&&i.trim()!=="")return i.trim()}const r=e.closest("a[href]");if(r!==null&&r.getAttribute("role")===null)return Ae(r,t)}function Ae(e,t){const n=e.getAttribute("href")??e.getAttribute("xlink:href");if(n===null)return;const r=n.trim();if(!(r===""||r==="#"||/^javascript:/i.test(r)))try{const o=new URL(r,t.baseURI);return o.protocol==="http:"||o.protocol==="https:"?o.href:void 0}catch{return}}function pt(e,t){const n=e.parentElement?.children;let r=0;if(n!==void 0){for(const[l,a]of[...n].entries())if(a===e){r=l+1;break}}const o=r>0?`${Te} #${r}`:Te;let i=e.parentElement;for(let l=0;l<st&&i!==null;l+=1){const a=t(i);if(a!==void 0&&a!=="")return`${o} in "${a}"`;i=i.parentElement}return o}function gt(e){const{element:t,role:n,doc:r,hasActionableDescendant:o,selfActionable:i,context:l}=e,a=ft(t,l.roleHints);if(a!==void 0)return{role:a};if(i||l.interactiveHint?.(t)!==!0&&!at.has(n)||o&&n!=="img"||!ut(t,l))return;const c=ht(t,r);return c!==void 0?{role:"link",href:c}:{role:"button"}}var ke=new Set(["password","hidden"]),xe=new Set(["button","checkbox","combobox","form","link","radio","searchbox","switch","textbox"]),mt=new Set(["article","dialog","feed","grid","group","list","listitem","main","navigation","region","row","rowgroup","table","tabpanel","tree","treeitem"]),vt={A:"link",ARTICLE:"article",BUTTON:"button",CANVAS:"img",H1:"heading",H2:"heading",H3:"heading",H4:"heading",H5:"heading",H6:"heading",IMG:"img",LI:"listitem",NAV:"navigation",OL:"list",P:"paragraph",SELECT:"combobox",SVG:"img",TABLE:"table",TD:"cell",TEXTAREA:"textbox",TH:"columnheader",TR:"row",UL:"list"},wt={button:"button",checkbox:"checkbox",radio:"radio",submit:"button"},Oe=200,C=e=>{const t=e.replace(/\s+/g," ").trim();return t.length>Oe?`${t.slice(0,Oe)}…`:t};function bt(e){const t=e;return typeof t.href=="string"&&t.href!==""?t.href:e.getAttribute("href")??void 0}function yt(e){const t=e.getAttribute("role");if(t!==null&&t.trim()!=="")return t.trim();if(e.tagName==="INPUT"){const n=(e.getAttribute("type")??"text").toLowerCase();return wt[n]??"textbox"}return vt[e.tagName.toUpperCase()]??"generic"}function Et(e){let t="";for(const n of e.childNodes)n.nodeType===3&&(t+=n.nodeValue??"");return C(t)}var St=new Set(["INPUT","TEXTAREA","SELECT"]);function Tt(e){const t=e.labels;if(t&&t.length>0){const r=[...t].map(o=>o.textContent??"").filter(o=>o.trim()!=="").join(" ");if(r.trim()!=="")return C(r)}const n=e.closest("label")?.textContent??"";if(n.trim()!=="")return C(n);for(const r of["placeholder","title"]){const o=e.getAttribute(r);if(o!==null&&o.trim()!=="")return C(o)}}function ie(e,t){const n=e.getAttribute("aria-label");if(n!==null&&n.trim()!=="")return C(n);const r=e.getAttribute("aria-labelledby");if(r!==null){const i=r.split(/\s+/).map(l=>t.getElementById(l)?.textContent??"").filter(l=>l.trim()!=="");if(i.length>0)return C(i.join(" "))}if(e.tagName==="IMG"){const i=e.getAttribute("alt");if(i!==null&&i.trim()!=="")return C(i)}if(St.has(e.tagName))return Tt(e);const o=Et(e);return o===""?void 0:o}function At(e){if(e.tagName==="INPUT"){const t=(e.getAttribute("type")??"text").toLowerCase();if(ke.has(t))return;const n=e.value;return n===""?void 0:C(n)}if(e.tagName==="TEXTAREA"||e.tagName==="SELECT"){const t=e.value;return t===""?void 0:C(t)}if(e.getAttribute("role")==="combobox"){const t=e.getAttribute("data-value");return t===null||t===""?void 0:C(t)}}function kt(e,t){if(e.hasAttribute("hidden")||e.getAttribute("aria-hidden")==="true")return!0;const n=e.getAttribute("style")??"";if(/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n))return!0;if(t!==null){const r=t.getComputedStyle(e);if(r.display==="none"||r.visibility==="hidden")return!0}return!1}var xt=new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE"]),J="[role=dialog][open], dialog[open], [aria-modal=true]",Ot="Not captured: this image is smaller than the icon threshold";function Nt(e,t){if(t<=0)return!1;const n=ve(e);return n===void 0?!1:n.width*n.height<t}function Q(e,t,n,r,o,i,l,a,c){if(t.has(e)||xt.has(e.tagName)||kt(e,r))return;const u=[];for(const d of e.children){const f=Q(d,t,n,r,o,i,l,a,c);f!==void 0&&u.push(f)}let h=ie(e,n);const w=At(e);let y=yt(e),x;if(c!==void 0){const d=gt({element:e,role:y,doc:n,hasActionableDescendant:u.some(f=>f.ref!==void 0&&i?.isAction(f.ref)===!0),selfActionable:xe.has(y),context:c});d!==void 0&&(y=d.role,x=d.href,h===void 0&&(h=C(dt(e)??pt(e,f=>ie(f,n)))))}const S=x??(y==="link"?bt(e):void 0);if(y==="generic"&&h===void 0&&w===void 0&&u.length===0)return;if(c!==void 0&&y==="generic"&&h===void 0&&w===void 0&&u.length===1)return u[0];const g={role:y,...h!==void 0?{name:h}:{},...w!==void 0?{value:w}:{},...l!==void 0?{frame:l}:{},...S!==void 0?{href:S}:{},...a!==void 0?{provenance:a}:{},...u.length>0?{children:u}:{}},s=i?.issue(e,y,l);return s!==void 0&&(g.ref=s),o!==void 0&&Ge(e)&&(Nt(e,o.minImageArea)?g.imageNote=Ot:o.targets.push({element:e,node:g})),g}function Lt(e,t){const n=o=>{for(let i=o;i!==null;i=i.parentElement)if(t.has(i))return!0;return!1},r=[];e.tagName==="IFRAME"&&!n(e)&&r.push(e);for(const o of e.querySelectorAll("iframe"))n(o)||r.push(o);return r}function _t(e){for(const t of["aria-label","title","name","id"]){const n=e.getAttribute(t);if(n!==null&&n.trim()!=="")return C(n)}return"unnamed"}function Ne(e,t){try{const n=new URL(e,t);return n.protocol==="http:"||n.protocol==="https:"?n.href:void 0}catch{return}}function Ct(e,t){try{const r=e.contentWindow?.location?.href;if(r!==void 0&&r!=="about:blank"){const o=Ne(r,t.baseURI);if(o!==void 0)return o}}catch{}const n=e.getAttribute("src");if(!(n===null||n.trim()===""))return Ne(n,t.baseURI)}function It(e){try{const t=e.contentDocument;return t===null||t.body===null?void 0:t}catch{return}}var Rt=class{#e=new Map;#r=new WeakMap;#t;#n;constructor(e,t){this.#t=e,this.#n=t}useSets(e,t){this.#t=e,this.#n=t}prune(){for(const[e,t]of this.#e)t.element.isConnected||this.#e.delete(e)}issue(e,t,n){if(!this.#t.has(e)||this.#n.has(e))return;const r=xe.has(t)?"action":mt.has(t)?"anchor":void 0;if(r===void 0)return;const o=this.#r.get(e);if(o!==void 0&&this.#e.has(o))return this.#e.set(o,{element:e,kind:r,...n!==void 0?{frame:n}:{}}),o;const i=new Uint8Array(8);crypto.getRandomValues(i);const l=[...i].map(a=>a.toString(16).padStart(2,"0")).join("");return this.#e.set(l,{element:e,kind:r,...n!==void 0?{frame:n}:{}}),this.#r.set(e,l),l}isAction(e){return this.#e.get(e)?.kind==="action"}get table(){return this.#e}};function Mt(e={}){let t;const n=new Map,r=new Set,o=()=>e.document??globalThis.document,i=s=>e.promoteRoles===!0?{view:s,...e.interactiveHint!==void 0?{interactiveHint:e.interactiveHint}:{},...e.roleHints!==void 0?{roleHints:e.roleHints}:{}}:void 0;function l(s,d){const f=ue(s),p=Y(s);let v=d;const b=[];for(const[T,O]of f.entries()){const M=`step ${T+1} ("${O}") of frame path "${p}"`,U=v.querySelector(O);if(U===null||U.tagName!=="IFRAME")return{note:{frame:p,reason:"not-found",message:`Frame ${M} was not found in the page.`}};const F=U;let P,D;try{P=F.contentDocument,D=F.contentWindow?.location.origin}catch{P=null}if(P===null||D===void 0)return{note:{frame:p,reason:"cross-origin",message:`Frame ${M} is cross-origin and was not read.`}};const N=Y(f.slice(0,T+1)),W=n.get(N);if(W===void 0)n.set(N,D);else if(W!==D)return{note:{frame:p,reason:"origin-changed",message:`Frame ${M} now points at ${D} instead of the authorized ${W}; the grant was revoked.`}};v=P,b.push(F)}return{doc:v,frames:b}}const a=(s,d)=>{const f=new Set,p=new Set;if(d===void 0||d.include.length===0)return{actionable:f,excluded:p};for(const v of d.include)for(const b of s.querySelectorAll(v)){f.add(b);for(const T of b.querySelectorAll("*"))f.add(T)}for(const v of d.exclude??[])for(const b of s.querySelectorAll(v)){p.add(b);for(const T of b.querySelectorAll("*"))p.add(T)}return{actionable:f,excluded:p}},c=s=>e.actionScope===void 0?void 0:de(e.actionScope).find(d=>Y(d.frame)===s);function u(s,d,f){const p=o();if(p===void 0)return{nodes:[],frameNotes:[],nestedFrames:[],anchored:!1};t??=new Rt(new Set,new Set),t.prune();const v=t,b=[],T=[],O=[],M=new Set,U=[],F=new Set;for(const m of Pe(s)){if(m.include.length===0)continue;const k=Y(m.frame),A=l(m.frame,p);if("note"in A){T.push(A.note),b.push({role:"note",name:A.note.message,frame:k});continue}for(const B of A.frames)F.add(B);U.push({scope:m,label:k,doc:A.doc})}function P(m,k,A,B,$,_,V,I){for(const L of m)for(const E of Lt(L,A)){if(F.has(E)||M.has(E))continue;M.add(E);const H=_t(E);if(e.discoverNestedFrames===!0){const X=Ct(E,k);if(X!==void 0){O.push({url:X,hint:H,..._!==void 0?{frame:_}:{}});continue}const j=It(E);if(j!==void 0&&D(j,E,B,$,_,V,I))continue}b.push({role:"note",name:`A nested frame "${H}" inside "${$}" is not part of the authorized scope and was not read. Ask the user to authorize it if its content is needed.`,..._!==void 0?{frame:_}:{}})}}function D(m,k,A,B,$,_,V){const I=new Set;for(const j of A.exclude??[])for(const le of m.querySelectorAll(j))I.add(le);const L=new Set,E=new Set;if(_.has(k)){L.add(m.body);for(const j of m.body.querySelectorAll("*"))L.add(j);for(const j of c(B)?.exclude??[])for(const le of m.querySelectorAll(j))E.add(le)}v.useSets(L,E);const H=m.defaultView,X=Q(m.body,I,m,H,d,v,$,"inline-frame",i(H));return X!==void 0&&b.push(X),P([m.body],m,I,A,B,$,L,E),v.useSets(_,V),X!==void 0}let N=f===void 0;for(const{scope:m,label:k,doc:A}of U){const B=A.defaultView,$=k==="self"?void 0:k,_=a(A,c(k));v.useSets(_.actionable,_.excluded);const V=new Set;for(const L of m.exclude??[])for(const E of A.querySelectorAll(L))V.add(E);let I=[];for(const L of m.include)for(const E of A.querySelectorAll(L))I.includes(E)||I.push(E);if(f!==void 0){const L=I.some(H=>H===f||H.contains(f)),E=[...V].some(H=>H===f||H.contains(f));if(!L||E)continue;I=[f],N=!0}for(const L of I){const E=Q(L,V,A,B,d,v,$,void 0,i(B));E!==void 0&&b.push(E)}P(I,A,V,m,k,$,_.actionable,_.excluded)}if(f!==void 0)return{nodes:b,frameNotes:T,nestedFrames:O,anchored:N};S();const W=p.defaultView,tn=a(p,c("self"));for(const m of r){v.useSets(new Set([m,...m.querySelectorAll("*")]),tn.excluded);const k=Q(m,new Set,p,W,d,v,void 0,"modal-elevated",i(W));k!==void 0&&b.push(k)}for(const m of p.querySelectorAll(J)){if(r.has(m))continue;const k=ie(m,p)??"dialog";b.push({role:"note",name:`The dialog "${k}" is open but outside the authorized scope because it was opened manually. Ask the user to let you open it instead.`})}return{nodes:b,frameNotes:T,nestedFrames:O,anchored:N}}async function h(s,d,f){const p=[],{nodes:v,frameNotes:b,nestedFrames:T,anchored:O}=u(s,{targets:p,minImageArea:d.minImageArea??0},f),M=p.slice(0,d.maxImages),U=[];let F=0;for(const[P,D]of M.entries()){const N=await nt(D.element,{id:`img-${P+1}`,maxBytes:d.maxImageBytes});if(je(N)){D.node.imageNote=N.reason,F+=1;continue}D.node.imageId=N.id,U.push({id:N.id,mimeType:N.mimeType,data:N.data,level:N.level})}for(const P of p.slice(d.maxImages))P.node.imageNote="Not captured: the per-message image limit was reached";return{nodes:v,images:U,imagesOmitted:p.length-M.length,imageFailures:F,anchored:O,...b.length>0?{frameNotes:b}:{},...T.length>0?{nestedFrames:T}:{}}}function w(s,d){if(d===void 0)return u(s,void 0).nodes;if(!d.images||d.maxImages<=0){const{nodes:f,frameNotes:p,nestedFrames:v}=u(s,void 0);return Promise.resolve({nodes:f,...p.length>0?{frameNotes:p}:{},...v.length>0?{nestedFrames:v}:{}})}return h(s,d)}async function y(s,d,f){const p=t?.table.get(d)?.element;if(p===void 0||!p.isConnected)return{rejected:"unknown-ref"};if(f?.images===!0&&f.maxImages>0){const{anchored:M,...U}=await h(s,f,p);return M?U:{rejected:"out-of-scope"}}const{nodes:v,frameNotes:b,nestedFrames:T,anchored:O}=u(s,void 0,p);return O?{nodes:v,...b.length>0?{frameNotes:b}:{},...T.length>0?{nestedFrames:T}:{}}:{rejected:"out-of-scope"}}function x(){const s=o();return s===void 0?new Set:new Set(s.querySelectorAll(J))}function S(){for(const s of r)s.isConnected&&s.matches(J)||r.delete(s)}return{read:w,readSubtree:y,resolve:s=>t?.table.get(s)?.element,handleKindOf:s=>t?.table.get(s)?.kind,frameOf:s=>t?.table.get(s)?.frame,modalSnapshot:x,elevateNewModals:s=>{S();for(const d of x())if(!s.has(d))return r.add(d),d},modalStateOf:s=>{S();const d=s.closest(J);return d===null?"none":r.has(d)?"elevated":"unelevated"},inActionScope:s=>{const d=s.ownerDocument,f=g(d);if(f===void 0)return!1;const p=a(d,c(f));return p.actionable.has(s)&&!p.excluded.has(s)}};function g(s){const d=o();if(d!==void 0){if(s===d)return"self";if(e.actionScope!==void 0)for(const f of de(e.actionScope)){if(ue(f.frame).length===0)continue;const p=l(f.frame,d);if(!("note"in p)&&p.doc===s)return Y(f.frame)}}}}var Ut=(()=>{const e=new Uint8Array(8);return crypto.getRandomValues(e),[...e].map(t=>t.toString(16).padStart(2,"0")).join("")})();function G(e){const t=e?.location.href;return t===void 0?void 0:`${Ut}\0${t}`}var Pt=new Set(["INPUT","TEXTAREA"]),ae={min:300,max:5e3,default:800},Dt=250,Ht=80,Ft=64;function Bt(e){if(e.hasAttribute("hidden")||e.getAttribute("aria-hidden")==="true")return!0;const t=e.getAttribute("style")??"";if(/display\s*:\s*none|visibility\s*:\s*hidden/i.test(t))return!0;const n=e.ownerDocument.defaultView;if(n!==null){const r=n.getComputedStyle(e);if(r.display==="none"||r.visibility==="hidden")return!0}return!1}var Le=e=>(e.getAttribute("type")??"text").toLowerCase(),$t=e=>e.tagName==="INPUT"&&ke.has(Le(e)),Z=e=>e?.textContent?.replace(/\s+/g," ").trim()??"";function ee(e){const t=e.getAttribute("aria-labelledby");if(t!==null&&t.trim()!==""){const c=e.ownerDocument,u=t.split(/\s+/).map(h=>Z(c.getElementById(h))).filter(h=>h!=="").join(" ");if(u!=="")return u}const n=e.getAttribute("aria-label");if(n!==null&&n.trim()!=="")return n.trim();const r=e.labels;if(r&&r.length>0){const c=[...r].map(u=>Z(u)).filter(u=>u!=="").join(" ");if(c!=="")return c}const o=Z(e);if(o!=="")return o;const i=Z(e.closest("label"));if(i!=="")return i;const l=e.getAttribute("placeholder");if(l!==null&&l.trim()!=="")return l.trim();const a=e.getAttribute("title");return a!==null&&a.trim()!==""?a.trim():void 0}function Vt(e){const t=e.getAttribute("role");if(t!==null&&t.trim()!=="")return t.trim();if(e.tagName==="INPUT"){const n=Le(e);return n==="checkbox"||n==="radio"?n:n==="button"||n==="submit"?"button":"textbox"}return e.tagName==="BUTTON"?"button":e.tagName==="A"?"link":e.tagName==="TEXTAREA"?"textbox":e.tagName==="SELECT"?"combobox":e.tagName==="FORM"?"form":"generic"}var se=e=>{const t=ee(e);return{role:Vt(e),...t!==void 0?{name:t}:{},...$t(e)?{secret:!0}:{}}};function jt(e,t){const n=e.tagName==="INPUT"?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,r=Object.getOwnPropertyDescriptor(n,"value")?.set;r?r.call(e,t):e.value=t,e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}))}var R=e=>(e??"").replace(/\s+/g," ").trim().toLowerCase();function _e(e,t){const n=e.click;typeof n=="function"?n.call(e):e.dispatchEvent(new MouseEvent("click",t))}function ce(e){const t=e.ownerDocument.defaultView,n=e.getBoundingClientRect(),r={bubbles:!0,cancelable:!0,composed:!0,detail:1,button:0,clientX:n.left+n.width/2,clientY:n.top+n.height/2},o={...r,pointerId:1,pointerType:"mouse",isPrimary:!0},i=t?.PointerEvent;i!==void 0&&e.dispatchEvent(new i("pointerdown",{...o,buttons:1})),e.dispatchEvent(new MouseEvent("mousedown",{...r,buttons:1}))&&e.focus?.(),i!==void 0&&e.dispatchEvent(new i("pointerup",{...o,buttons:0})),e.dispatchEvent(new MouseEvent("mouseup",{...r,buttons:0})),_e(e,r)}async function te(e,t=2e3){const n=Date.now()+t;for(;;){const r=e();if(r!==void 0)return r;if(Date.now()>=n)return;await new Promise(o=>setTimeout(o,25))}}async function zt(e,t){const n=se(e),r=a=>({ok:!1,target:n,reason:a});if(t==="")return r("The select action needs a value.");if(e.tagName==="SELECT"){const a=e,c=[...a.options].find(u=>R(u.label)===R(t)||R(u.value)===R(t));return c===void 0?r(`No option named "${t}" is available.`):(a.value=c.value,a.dispatchEvent(new Event("input",{bubbles:!0})),a.dispatchEvent(new Event("change",{bubbles:!0})),R(a.selectedOptions[0]?.label)===R(c.label)?{ok:!0,target:n}:r(`The control did not accept "${t}".`))}const o=e.ownerDocument;ce(e);const i=await te(()=>o.querySelector("[role=listbox], [role=grid], [role=menu]")??void 0);if(i==null)return r("The options panel did not open.");const l=[...i.querySelectorAll("[role=option], [role=gridcell], [role=menuitem], option")].find(a=>R(ee(a))===R(t));return l===void 0?r(`No option named "${t}" is available.`):(_e(l,{bubbles:!0,cancelable:!0,composed:!0,detail:1,button:0}),await te(()=>{const a=`${ee(e)??""} ${e.value??""}`;return R(a).includes(R(t))?!0:void 0})===!0?{ok:!0,target:n}:r(`The control did not settle on "${t}".`))}function Gt(e,t,n){const r=R(t);if(r!=="true"&&r!=="false")return{ok:!1,target:n,reason:'Use "true" or "false".'};const o=r==="true",i=e.getAttribute("aria-checked")??e.getAttribute("aria-pressed"),l=i!==null?i==="true":e.tagName==="INPUT"?e.checked:void 0;return l===void 0?{ok:!1,target:n,reason:"The element is not a toggle."}:l===o?{ok:!0,target:n,noop:!0}:(ce(e),{ok:!0,target:n})}function Wt(e,t){try{const n=new DataTransfer;for(const r of t)n.items.add(r);e.files=n.files}catch(n){return`This browser cannot attach files programmatically: ${n instanceof Error?n.message:String(n)}`}e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}))}var Xt=e=>e==="auto"||e==="scroll"||e==="overlay";function qt(e){const t=e.ownerDocument,n=t.defaultView;if(n===null)return;for(let o=e;o!==null;o=o.parentElement){const i=n.getComputedStyle(o);if(Xt(i.overflowY)&&o.scrollHeight>o.clientHeight)return{container:o,isRoot:!1}}const r=t.scrollingElement??t.documentElement;if(r!==null&&r.scrollHeight>r.clientHeight)return{container:r,isRoot:!0}}function Yt(e){return typeof e!="number"||!Number.isFinite(e)?ae.default:Math.min(Math.max(Math.round(e),ae.min),ae.max)}function Kt(e){const t=e.ownerDocument.defaultView?.MutationObserver;let n;const r=t===void 0?void 0:new t(()=>n=Date.now());return r?.observe(e,{childList:!0,subtree:!0}),{settle:async o=>{const i=Date.now();try{for(;;){await new Promise(a=>setTimeout(a,20));const l=Date.now();if(l-i>=o)return;if(n===void 0){if(l-i>=Dt)return}else if(l-n>=Ht)return}}finally{r?.disconnect()}}}}function Jt(e){const{reader:t}=e,n=(a,c)=>{const u=t.frameOf(a);return{...c,...u!==void 0?{frame:u}:{}}},r=a=>{const c=t.resolve(a);if(c===void 0)return;const u=n(a,se(c));return t.modalStateOf(c)==="elevated"?{...u,elevated:!0}:u},o=async()=>{const a=(e.document??globalThis.document)?.defaultView,c={role:"document"};if(a==null)return{ok:!1,target:c,reason:"No browsing context is available."};if(a.history.length<=1)return{ok:!0,target:c,noop:!0};const u=G(a);return a.history.back(),await te(()=>{const h=G(a);return h!==void 0&&h!==u?h:void 0},500)===void 0?{ok:!0,target:c,noop:!0}:{ok:!0,target:c,navigated:!0,documentUrl:a.location.href}},i=async(a,c,u)=>{const h=qt(a);if(h===void 0)return{ok:!1,target:c,reason:"This area cannot be scrolled: nothing around this element has a scrollable region."};const{container:w,isRoot:y}=h;if(!y&&!t.inActionScope(w))return{ok:!1,target:c,reason:"The scrollable region around this element is outside the actionable scope."};const x=Math.max(w.clientHeight-Ft,Math.round(w.clientHeight/2),1),S=w.scrollTop,g=Kt(w);w.scrollTop=u==="down"?S+x:S-x,await g.settle(Yt(e.scrollSettleMs?.()));const s=w.scrollTop;return{ok:!0,target:c,scrolled:{atEnd:u==="down"?s>=w.scrollHeight-w.clientHeight-1:s<=0,movedBy:Math.abs(s-S)}}};return{execute:async a=>{if(a.action==="back")return await o();const c=t.resolve(a.ref);if(c===void 0)return{ok:!1,target:{role:"generic"},reason:"The element reference is unknown or expired."};const u=n(a.ref,se(c)),h=s=>({ok:!1,target:u,reason:s});if(t.handleKindOf(a.ref)==="anchor")return h("That reference points at a container, which cannot be acted on. Use it with perceive_page to read inside it, then act on an element that carries its own reference. If nothing inside it has one, this part of the page offers no action and retrying here will not help.");if(t.modalStateOf(c)==="unelevated")return h("That dialog is not in the authorized scope because it was opened manually. Ask me to open it, or add it to the host allowlist.");if(t.modalStateOf(c)!=="elevated"&&!t.inActionScope(c))return h("The element is no longer inside the actionable scope.");if(Bt(c))return h("The element is not visible.");if(c.hasAttribute("disabled"))return h("The element is disabled.");const w=t.modalSnapshot(),y=c.ownerDocument.defaultView,x=G(y),S=async s=>{if(!s.ok)return s;const d=await te(()=>{const T=t.elevateNewModals(w);if(T!==void 0)return{modal:T};const O=G(y);return O!==void 0&&O!==x?{key:O}:void 0},500),f=d!==void 0&&"modal"in d?d.modal:t.elevateNewModals(w),p=f===void 0?void 0:ee(f)??"dialog",v=G(y);return{...s,...p!==void 0?{elevatedModal:p}:{},...v!==void 0&&x!==void 0&&v!==x?{navigated:!0,documentUrl:y?.location.href}:{}}};if(a.action==="click")return ce(c),await S({ok:!0,target:u});if(a.action==="fill")return Pt.has(c.tagName)?c.hasAttribute("readonly")?h("The element is read-only."):(jt(c,a.value??""),await S({ok:!0,target:u})):h("The element is not a text control.");if(a.action==="select"){const s=await zt(c,a.value??"");return s.ok?await S({...s,target:u}):{...s,target:u}}if(a.action==="set")return await S(Gt(c,a.value??"",u));if(a.action==="scroll")return a.value!=="down"&&a.value!=="up"?h('Use "down" or "up".'):await i(c,u,a.value);if(a.action==="attach"){const s=await e.pickFiles?.();if(s===void 0||s.length===0)return{ok:!1,target:u,reason:"The user cancelled the file selection."};if(c.tagName!=="INPUT"||c.type!=="file")return h("The element is not a file input.");const d=Wt(c,s);return d!==void 0?h(d):await S({ok:!0,target:u})}const g=c.tagName==="FORM"?c:c.form;return g?(g.requestSubmit(),await S({ok:!0,target:u})):h("The element does not belong to a form.")},describe:r}}function Ce(e,t=[]){for(const n of e)n.ref!==void 0&&t.push(n.ref),n.children!==void 0&&Ce(n.children,t);return t}function Qt(e={}){const t=Mt({...e.document!==void 0?{document:e.document}:{},...e.actionScope!==void 0?{actionScope:e.actionScope}:{},...e.promoteRoles!==void 0?{promoteRoles:e.promoteRoles}:{},...e.interactiveHint!==void 0?{interactiveHint:e.interactiveHint}:{},...e.roleHints!==void 0?{roleHints:e.roleHints}:{},...e.discoverNestedFrames!==void 0?{discoverNestedFrames:e.discoverNestedFrames}:{}}),n=Jt({reader:t,...e.document!==void 0?{document:e.document}:{},...e.pickFiles!==void 0?{pickFiles:e.pickFiles}:{}}),r=()=>{const o=e.document??globalThis.document,i=G(o?.defaultView);if(i===void 0)return;const l=o.defaultView?.location.href,a=o.title;return{key:i,...l!==void 0?{url:l}:{},...a!==void 0&&a!==""?{title:a}:{}}};return{async handle(o){try{if(o.type==="perceive"){const i=o.capture===void 0?t.read(o.scope):await t.read(o.scope,o.capture),l=Array.isArray(i)?{nodes:i}:i,a=[];for(const u of Ce(l.nodes)){const h=n.describe(u);h!==void 0&&a.push({ref:u,...h})}const c=r();return{type:"perceive-result",result:l,targets:a,...c!==void 0?{document:c}:{}}}return{type:"execute-result",outcome:await n.execute(o.request)}}catch(i){return{type:"error",code:i instanceof q?i.code:"TOOL_EXECUTION_FAILED",message:i instanceof Error?i.message:String(i)}}}}}var Zt={include:["body"],exclude:["input[type=password]","input[type=hidden]",'[autocomplete^="cc-"]',"[data-ccs-no-ai]"]},en=[];(()=>{const e="ccs-fetch-proxy",t="ccs-fetch-proxy-out",n=EventTarget.prototype.addEventListener,r=Event.prototype.stopImmediatePropagation,o=EventTarget.prototype.dispatchEvent,i=new WeakSet,l=new Set(["click","mousedown","mouseup","pointerdown","pointerup"]);let a;function c(){if(a!==void 0)return a;try{const g=document,s=g.permissionsPolicy??g.featurePolicy;a=!!((typeof s?.features=="function"?s.features().includes("unload"):!1)&&typeof s?.allowsFeature=="function"&&!s.allowsFeature("unload"))}catch{a=!1}return a}function u(g,s,d){g==="unload"&&c()||(l.has(g)&&this instanceof Element&&i.add(this),n.call(this,g,s,d))}EventTarget.prototype.addEventListener=u;function h(){EventTarget.prototype.addEventListener===u&&(EventTarget.prototype.addEventListener=n)}const w=Qt({actionScope:Zt,promoteRoles:!0,interactiveHint:g=>i.has(g),roleHints:en,discoverNestedFrames:!0});let y;const x=g=>{const s=JSON.stringify({__ccsExt:!0,proto:e,to:"iso",...g});o.call(document,new CustomEvent(t,{detail:s}))};async function S(g,s,d){try{const f=d;if(s!==(f?.type==="execute"?"act":"perceive"))throw new Error(`op/payload mismatch: op=${String(s)} type=${String(f?.type)}`);const p=await w.handle(f);x({kind:"CCS_EXT_DOM_EXECUTE_RESULT",reqId:g,ok:!0,result:{reply:p,documentUrl:location.href}})}catch(f){x({kind:"CCS_EXT_DOM_EXECUTE_RESULT",reqId:g,ok:!1,error:f?.message??String(f)})}}n.call(window,"message",(g=>{if(g.source!==window||g.origin!==location.origin)return;const s=g.data;if(!(!s||s.__ccsExt!==!0||s.proto!==e)&&s.to==="dom"){if(r.call(g),s.kind==="CCS_EXT_HANDSHAKE"){y===void 0&&typeof s.authToken=="string"&&(y=s.authToken);return}y===void 0||s.authToken!==y||(s.kind==="CCS_EXT_DOM_DISARM"?h():s.kind==="CCS_EXT_DOM_EXECUTE"&&typeof s.reqId=="string"&&S(s.reqId,s.op,s.payload))}}))})()})();
