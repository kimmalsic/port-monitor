import type {
  ExternalCheckResult,
  KillResult,
  KillTarget,
  PortsPayload,
  Settings,
} from '../shared/types';

export type {
  PortEntry,
  PortState,
  Protocol,
  Settings,
  ExternalCheckResult,
  PortsPayload,
  KillTarget,
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

declare global {
  interface Window {
    portMonitor: PortMonitorAPI;
  }
}
