/**
 * CCS SSL Mock Server
 *
 * 模拟一个常规网站服务：
 * - 仅支持 HTTPS（SSL）
 * - 监听 0.0.0.0:63735
 * - 提供 /ierp/ 目录下的静态文件（index.html 登录页、proxy.html）
 * - 提供 /kapi 接口：需登录 + 同源请求才能访问
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PORT = 63735;
const HOST = '0.0.0.0';

// SSL 证书路径
const CERT_PATH = path.join(ROOT, 'documents', 'cert.pem');
const KEY_PATH = path.join(ROOT, 'documents', 'key.pem');

// 静态文件根目录
const IERP_DIR = path.join(ROOT, 'apps', 'ccs-framework', 'public', 'ierp');

// 会话密钥（用于签名 cookie，模拟场景简单处理）
const SESSION_SECRET = 'ccs-mock-session-secret-2026';

// 用简单的 HMAC 签名 cookie 值，防止伪造
function signCookie(value) {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(value);
  return value + '.' + hmac.digest('hex');
}

function verifySignedCookie(signed) {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const expected = signCookie(value);
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signed, 'utf8')) ? value : null;
}

// 解析 cookie
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  });
  return cookies;
}

// MIME 类型
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * 检查请求是否同源
 * 如果 Origin 头存在且与 Host 不匹配，则为跨域请求
 */
function isSameOrigin(req) {
  const origin = req.headers['origin'];
  if (!origin) {
    // 没有 Origin 头，通常是同源请求（或直接浏览器导航）
    // 检查 Referer 作为辅助判断
    const referer = req.headers['referer'];
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const expectedHost = req.headers['host'] || `${HOST}:${PORT}`;
        return refUrl.host === expectedHost;
      } catch {
        return false;
      }
    }
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const expectedHost = req.headers['host'] || `${HOST}:${PORT}`;
    // 比较 host（包含端口）
    return originUrl.host === expectedHost;
  } catch {
    return false;
  }
}

/**
 * 获取当前登录用户名，未登录返回 null
 */
function getSessionUser(req) {
  const cookies = parseCookies(req.headers['cookie']);
  const signed = cookies['ccs_session'];
  if (!signed) return null;
  return verifySignedCookie(signed);
}

/**
 * 为公开接口设置 CORS 头（允许任意来源跨域携带 Cookie）
 */
function setPublicCorsHeaders(req, res) {
  const origin = req.headers['origin'];
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

/**
 * 处理 /kapi 请求
 */
function handleKapi(req, res) {
  // 1. 跨域检查
  if (!isSameOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden: cross-origin requests are not allowed' }));
    return;
  }

  // 2. 登录检查
  const username = getSessionUser(req);
  if (!username) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Unauthorized: please login first' }));
    return;
  }

  // 3. 返回用户名
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ username }));
}

/**
 * 处理 /ierp/login POST 请求（允许跨域）
 */
function handleLogin(req, res) {
  setPublicCorsHeaders(req, res);

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let params;
    try {
      params = JSON.parse(body);
    } catch {
      // 尝试解析 URL encoded
      params = Object.fromEntries(new URLSearchParams(body));
    }

    const { username, password } = params;

    // 模拟登录验证：任何非空用户名+密码即可登录
    if (!username || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Bad Request: username and password are required' }));
      return;
    }

    // 设置签名 cookie（SameSite=None 允许跨域携带）
    const signedValue = signCookie(username);
    const cookie = `ccs_session=${signedValue}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400`;

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': cookie
    });
    res.end(JSON.stringify({ success: true, username }));
  });
}

/**
 * 处理 /ierp/logout POST —— 清除登录态
 */
function handleLogout(req, res) {
  setPublicCorsHeaders(req, res);
  const cookie = 'ccs_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0';
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': cookie
  });
  res.end(JSON.stringify({ success: true, message: 'Logged out' }));
}

/**
 * 处理 /ierp/session GET —— 查询当前登录状态
 */
function handleSession(req, res) {
  setPublicCorsHeaders(req, res);
  const username = getSessionUser(req);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ loggedIn: !!username, username: username || null }));
}

/**
 * /ierp/ 目录下所有资源需要登录 + 同源才能访问。
 * 返回 true 表示放行，false 表示已拒绝（已写入响应）。
 */
function requireAuth(req, res) {
  // 跨域检查
  if (!isSameOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden: cross-origin requests are not allowed' }));
    return false;
  }
  // 登录检查
  if (!getSessionUser(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Unauthorized: please login first' }));
    return false;
  }
  return true;
}

/**
 * 处理静态文件请求
 */
function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // 安全检查：防止目录遍历
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(IERP_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 如果请求的是目录，尝试 index.html
      if (stats && stats.isDirectory()) {
        serveStatic(req, res, path.join(filePath, 'index.html'));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });
  });
}

// 创建 HTTPS 服务器
const serverOptions = {
  cert: fs.readFileSync(CERT_PATH),
  key: fs.readFileSync(KEY_PATH)
};

const server = https.createServer(serverOptions, (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathname = url.pathname;

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  // 路由: /kapi（自带鉴权）
  if (req.method === 'GET' && pathname === '/kapi') {
    handleKapi(req, res);
    return;
  }

  // 路由: /ierp/login —— 登录接口（公开，允许跨域）
  if (pathname === '/ierp/login') {
    if (req.method === 'OPTIONS') {
      setPublicCorsHeaders(req, res);
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'POST') {
      handleLogin(req, res);
      return;
    }
  }

  // 路由: /ierp/logout —— 登出接口（公开，允许跨域）
  if (req.method === 'POST' && pathname === '/ierp/logout') {
    handleLogout(req, res);
    return;
  }

  // 路由: /ierp/session —— 查询登录状态（公开，允许跨域）
  if (req.method === 'GET' && pathname === '/ierp/session') {
    handleSession(req, res);
    return;
  }

  // 路由: /ierp/ 或 /ierp/ccs/ 或 /ierp/index/login.html —— 登录页（公开，允许跨域）
  if (pathname === '/ierp/' || pathname === '/ierp/ccs/' || pathname === '/ierp/index/login.html') {
    setPublicCorsHeaders(req, res);
    serveStatic(req, res, path.join(IERP_DIR, 'index.html'));
    return;
  }

  // 路由: /ierp/monorepo/proxy.html —— 需登录，但允许跨域（供 iframe 嵌入使用）
  if (pathname === '/ierp/monorepo/proxy.html') {
    setPublicCorsHeaders(req, res);
    if (!getSessionUser(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unauthorized: please login first' }));
      return;
    }
    serveStatic(req, res, path.join(IERP_DIR, 'monorepo', 'proxy.html'));
    return;
  }

  // 路由: /ierp/* —— ierp 目录下其他资源需要登录 + 同源
  if (pathname.startsWith('/ierp/')) {
    if (!requireAuth(req, res)) return;

    const filePath = path.join(IERP_DIR, pathname.slice('/ierp/'.length));
    serveStatic(req, res, filePath);
    return;
  }

  // 路由: / —— 登录页（公开，允许跨域）
  if (pathname === '/') {
    setPublicCorsHeaders(req, res);
    serveStatic(req, res, path.join(IERP_DIR, 'index.html'));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`[ccs:ssl] Server running at https://${HOST}:${PORT}/`);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[ccs:ssl] Shutting down...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
