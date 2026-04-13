export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsUpdated: 'settings:updated',
  portsUpdate: 'ports:update',
  portsRefresh: 'ports:refresh',
  processKill: 'process:kill',
  portExternalCheck: 'port:external-check',
  windowHide: 'window:hide',
  windowSnap: 'window:snap',
  appQuit: 'app:quit',
  shellOpen: 'shell:open',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
