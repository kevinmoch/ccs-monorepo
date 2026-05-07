import { app, BrowserWindow } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let staticServer: Server | undefined;

async function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 1180, minHeight: 760, webPreferences: { preload: join(__dirname, '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false } });
  if (isDev && process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadURL(await startWebServer());
}

app.whenReady().then(() => {
  void createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

app.on('before-quit', () => {
  staticServer?.close();
});

function getWebRoot() {
  if (process.env.CCS_WEB_DIST_DIR) return process.env.CCS_WEB_DIST_DIR;
  if (app.isPackaged) return join(process.resourcesPath, 'web');
  return join(__dirname, '../../../../dist/web');
}

function startWebServer() {
  if (staticServer) {
    const address = staticServer.address() as AddressInfo;
    return Promise.resolve(`http://127.0.0.1:${address.port}/`);
  }

  const webRoot = resolve(getWebRoot());
  staticServer = createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    let filePath = resolve(webRoot, `.${requestPath}`);

    if (filePath !== webRoot && !filePath.startsWith(`${webRoot}${sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    if (!existsSync(filePath)) {
      filePath = join(webRoot, 'index.html');
    }

    response.setHeader('Content-Type', getContentType(filePath));
    createReadStream(filePath).pipe(response);
  });

  return new Promise<string>((resolveUrl) => {
    staticServer?.listen(0, '127.0.0.1', () => {
      const address = staticServer?.address() as AddressInfo;
      resolveUrl(`http://127.0.0.1:${address.port}/`);
    });
  });
}

function getContentType(filePath: string) {
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  };
  return contentTypes[extname(filePath)] ?? 'application/octet-stream';
}
