import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type {
  ExternalCheckResult,
  KillResult,
  KillTarget,
  PortsPayload,
  Settings,
} from '../shared/types';

export interface PortMonitorAPI {
  getSettings: () => Promise<Settings>;
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  onSettings: (cb: (s: Settings) => void) => () => void;
  onPorts: (cb: (p: PortsPayload) => void) => () => void;
  refreshNow: () => Promise<void>;
  killProcess: (pid: number, target: KillTarget) => Promise<KillResult>;
  checkExternalPort: (port: number) => Promise<ExternalCheckResult>;
  hideWindow: () => void;
  quitApp: () => void;
  setSnap: (snap: Settings['window']['snap']) => void;
  openExternalUrl: (url: string) => void;
  getPlatform: () => NodeJS.Platform;
}

const api: PortMonitorAPI = {
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
  onSettings: (cb) => {
    const handler = (_: unknown, s: Settings) => cb(s);
    ipcRenderer.on(IPC.settingsUpdated, handler);
    return () => ipcRenderer.off(IPC.settingsUpdated, handler);
  },
  onPorts: (cb) => {
    const handler = (_: unknown, p: PortsPayload) => cb(p);
    ipcRenderer.on(IPC.portsUpdate, handler);
    return () => ipcRenderer.off(IPC.portsUpdate, handler);
  },
  refreshNow: () => ipcRenderer.invoke(IPC.portsRefresh),
  killProcess: (pid, target) => ipcRenderer.invoke(IPC.processKill, pid, target),
  checkExternalPort: (port) => ipcRenderer.invoke(IPC.portExternalCheck, port),
  hideWindow: () => ipcRenderer.send(IPC.windowHide),
  quitApp: () => ipcRenderer.send(IPC.appQuit),
  setSnap: (snap) => ipcRenderer.send(IPC.windowSnap, snap),
  openExternalUrl: (url) => ipcRenderer.send(IPC.shellOpen, url),
  getPlatform: () => process.platform,
};

contextBridge.exposeInMainWorld('portMonitor', api);
