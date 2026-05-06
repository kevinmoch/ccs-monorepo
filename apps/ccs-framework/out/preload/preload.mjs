import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("ccsElectron", { platform: process.platform });
