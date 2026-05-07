import { app, Menu, BrowserWindow } from "electron";
import { existsSync, statSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import { join, resolve, sep, extname } from "node:path";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let staticServer;
async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "../preload/preload.mjs"), contextIsolation: true, nodeIntegration: false }
  });
  if (isDev && process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadURL(await startWebServer());
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  void createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", () => {
  staticServer?.close();
});
function getWebRoot() {
  if (process.env.CCS_WEB_DIST_DIR) return process.env.CCS_WEB_DIST_DIR;
  if (app.isPackaged) return join(process.resourcesPath, "web");
  return join(__dirname, "../../../../dist/web");
}
function startWebServer() {
  if (staticServer) {
    const address = staticServer.address();
    return Promise.resolve(`http://127.0.0.1:${address.port}/`);
  }
  const webRoot = resolve(getWebRoot());
  staticServer = createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    let filePath = resolve(webRoot, `.${requestPath}`);
    if (filePath !== webRoot && !filePath.startsWith(`${webRoot}${sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, "index.html");
    }
    if (!existsSync(filePath)) {
      filePath = join(webRoot, "index.html");
    }
    response.setHeader("Content-Type", getContentType(filePath));
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolveUrl) => {
    staticServer?.listen(0, "127.0.0.1", () => {
      const address = staticServer?.address();
      resolveUrl(`http://127.0.0.1:${address.port}/`);
    });
  });
}
function getContentType(filePath) {
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  };
  return contentTypes[extname(filePath)] ?? "application/octet-stream";
}
