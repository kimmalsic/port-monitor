export type PortState =
  | 'LISTEN'
  | 'ESTABLISHED'
  | 'TIME_WAIT'
  | 'CLOSE_WAIT'
  | 'SYN_SENT'
  | 'SYN_RECV'
  | 'FIN_WAIT1'
  | 'FIN_WAIT2'
  | 'CLOSING'
  | 'LAST_ACK'
  | 'UNKNOWN';

export type Protocol = 'tcp' | 'tcp6' | 'udp' | 'udp6';

export type CornerSnap = 'tl' | 'tr' | 'bl' | 'br';
export type EdgeSnap = CornerSnap;

export interface PortEntry {
  id: string;
  protocol: Protocol;
  localAddress: string;
  localPort: number;
  remoteAddress: string | null;
  remotePort: number | null;
  state: PortState;
  pid: number | null;
  processName: string | null;
  source: 'host' | 'wsl';
  wslDistro?: string;
}

export interface Settings {
  window: {
    width: number;
    height: number;
    x: number | null;
    y: number | null;
    snap: CornerSnap;
  };
  pollIntervalMs: number;
  theme: 'dark' | 'light';
  alwaysOnTop: boolean;
  startHidden: boolean;
  hotkey: string;
  autoHideOnBlur: boolean;
  includeWsl: boolean;
  filters: {
    listenOnly: boolean;
    query: string;
  };
}

export interface ExternalCheckResult {
  port: number;
  reachable: boolean;
  publicIp: string | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: number;
}

export interface PortsPayload {
  ports: PortEntry[];
  scannedAt: number;
  error: string | null;
}

export interface KillResult {
  ok: boolean;
  message: string;
}

export interface KillTarget {
  source: 'host' | 'wsl';
  wslDistro?: string;
  force?: boolean;
}
