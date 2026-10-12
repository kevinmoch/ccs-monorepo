import http from 'node:http';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `pnpm chat`：本地联调 mock 服务——收到的消息原样打到控制台（`auth` 也不打码，
 * 联调要核对的正是「更新后发出去的是不是新值」）。
 * 另把 `extensions/ccs-ai-assistant/release/`（`pnpm build:crx` 的产物）挂到 `/release` 下，
 * 本机就能托管扩展的 CRX 与 updates.xml，供拖入安装与 update_url 更新检查用。
 */

/** `/release` 静态托管：`pnpm build:crx` 的产物（CRX 与 updates.xml）按原文件名直接取用 */
const RELEASE_MOUNT = '/release';
const RELEASE_DIR = resolve(fileURLToPath(new URL('../extensions/ccs-ai-assistant/release/', import.meta.url)));

// 只绑回环：联调用的 token 不该被局域网里的别人收到
const HOST = '127.0.0.1';
const PORT = Number(process.env.CHAT_PORT ?? 3333);
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

const text = (value) => (typeof value === 'string' ? value : '(missing)');

function printMessage(payload) {
  console.log(`\n[chat] ${new Date().toISOString()} message received`);
  console.log(`receiver: ${text(payload.receiver)}`);
  console.log(`auth:     ${text(payload.auth)}`);
  console.log('content:');
  console.log(text(payload.content));
}

/** 静态托管用得到的 MIME；其余走 application/octet-stream */
const CONTENT_TYPES = {
  '.crx': 'application/x-chrome-extension',
  '.zip': 'application/zip',
  '.xml': 'application/xml; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

function sendFile(req, res, filePath, stats) {
  res.writeHead(200, {
    ...corsHeaders,
    'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stats.size,
    'Last-Modified': stats.mtime.toUTCString()
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  // stat 之后文件被删掉的话头已经发出去了，只能掐断连接让浏览器看到失败
  createReadStream(filePath)
    .on('error', () => res.destroy())
    .pipe(res);
}

/** 目录下没有 index.html 时的最简目录页：文件名 + 大小，能点开 CRX 就够 */
function renderDirectoryPage(requestPath, dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const items = entries.map((entry) => {
    const isDirectory = entry.isDirectory();
    const label = escapeHtml(`${entry.name}${isDirectory ? '/' : ''}`);
    const href = `${encodeURIComponent(entry.name)}${isDirectory ? '/' : ''}`;
    let suffix = '';
    if (!isDirectory) {
      try {
        suffix = ` <span>${statSync(join(dirPath, entry.name)).size} B</span>`;
      } catch {
        // 列完目录后被删了，显示不出大小就算了
      }
    }
    return `<li><a href="${href}">${label}</a>${suffix}</li>`;
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(requestPath)}</title>
</head>
<body>
<h1>${escapeHtml(requestPath)}</h1>
<ul>
${items.join('\n')}
</ul>
</body>
</html>
`;
}

/** `/release` 下的静态托管（装扩展 / update_url 检查用） */
function serveRelease(req, res, pathname) {
  const allow = 'GET, HEAD, OPTIONS';
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...corsHeaders, Allow: allow });
    res.end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, Allow: allow });
    res.end();
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname.slice(RELEASE_MOUNT.length));
  } catch {
    sendJson(res, 400, { ok: false, error: 'Malformed request path.' });
    return;
  }

  // 目录穿越防护：归一化后必须仍落在 RELEASE_DIR 内（浏览器会先自行规范化，这里防的是原生请求）
  const target = resolve(RELEASE_DIR, `.${decodedPath}`);
  if (target !== RELEASE_DIR && !target.startsWith(RELEASE_DIR + sep)) {
    sendJson(res, 403, { ok: false, error: 'Path escapes the release directory.' });
    return;
  }

  let stats;
  try {
    stats = statSync(target);
  } catch {
    sendJson(res, 404, { ok: false, error: 'Not found.' });
    return;
  }

  if (stats.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(302, { ...corsHeaders, Location: `${pathname}/` });
      res.end();
      return;
    }
    const indexPath = join(target, 'index.html');
    try {
      sendFile(req, res, indexPath, statSync(indexPath));
    } catch {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDirectoryPage(pathname, target));
    }
    return;
  }

  sendFile(req, res, target, stats);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    ({ pathname } = new URL(req.url ?? '/', `http://${HOST}`));
  } catch {
    sendJson(res, 400, { ok: false, error: 'Malformed request URL.' });
    return;
  }

  if (pathname === RELEASE_MOUNT || pathname.startsWith(`${RELEASE_MOUNT}/`)) {
    serveRelease(req, res, pathname);
    return;
  }

  if (pathname !== '/') {
    sendJson(res, 404, { ok: false, error: 'Not found.' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Use POST /.' });
    return;
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;
  req.on('data', (chunk) => {
    if (tooLarge) return;
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      tooLarge = true;
      sendJson(res, 413, { ok: false, error: 'Request body is too large.' });
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (tooLarge) return;
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      sendJson(res, 400, { ok: false, error: 'Body must be valid JSON.' });
      return;
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      sendJson(res, 400, { ok: false, error: 'Body must be a JSON object.' });
      return;
    }
    printMessage(payload);
    sendJson(res, 200, { ok: true });
  });
});

server.on('error', (error) => {
  const reason =
    error.code === 'EADDRINUSE' ? `port ${PORT} is already in use (is another "pnpm chat" running?)` : error.message;
  console.error(`[chat] cannot start: ${reason}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[chat] mock chat service is listening at http://localhost:${PORT}/ (Ctrl+C to stop)`);
  console.log(`[chat] extension release files are served at http://localhost:${PORT}${RELEASE_MOUNT}/`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[chat] shutting down on ${signal}`);
    // 浏览器的 keep-alive 连接会让 server.close() 一直等下去
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
