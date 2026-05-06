import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 1180, minHeight: 760, webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false } });
  if (isDev && process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
