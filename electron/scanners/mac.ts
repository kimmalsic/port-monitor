import type { PortEntry, PortState, Protocol } from '../../shared/types';
import { runCommand } from '../util';

const STATE_MAP: Record<string, PortState> = {
  LISTEN: 'LISTEN',
  ESTABLISHED: 'ESTABLISHED',
  TIME_WAIT: 'TIME_WAIT',
  CLOSE_WAIT: 'CLOSE_WAIT',
  SYN_SENT: 'SYN_SENT',
  SYN_RECV: 'SYN_RECV',
  SYN_RECEIVED: 'SYN_RECV',
  FIN_WAIT_1: 'FIN_WAIT1',
  FIN_WAIT_2: 'FIN_WAIT2',
  CLOSING: 'CLOSING',
  LAST_ACK: 'LAST_ACK',
};

interface Endpoint {
  addr: string;
  port: number;
}

function parseEndpoint(s: string): Endpoint | null {
  // [::1]:3000, 127.0.0.1:3000, *:3000
  const v6 = s.match(/^\[([^\]]+)\]:(\d+)$/);
  const v4 = s.match(/^(\*|[^:]+):(\d+)$/);
  const m = v6 ?? v4;
  if (!m) return null;
  const port = parseInt(m[2], 10);
  if (!Number.isFinite(port)) return null;
  return { addr: m[1], port };
}

function parseName(raw: string): { local: Endpoint; remote: Endpoint | null } | null {
  const [localRaw, remoteRaw] = raw.split('->');
  const local = parseEndpoint(localRaw);
  if (!local) return null;
  const remote = remoteRaw ? parseEndpoint(remoteRaw) : null;
  return { local, remote };
}

export async function scanMacPorts(): Promise<PortEntry[]> {
  const { stdout, code, error } = await runCommand('lsof', [
    '-iTCP',
    '-iUDP',
    '-P',
    '-n',
    '-F',
    'pcnPT',
  ]);
  if (error) throw error;
  // lsof exits 1 when no matching files, which also means empty output.
  if (code !== 0 && !stdout.trim()) return [];

  const entries: PortEntry[] = [];
  let pid: number | null = null;
  let command: string | null = null;
  let proto: 'tcp' | 'udp' | null = null;
  let state: PortState = 'UNKNOWN';
  let name: string | null = null;

  const flush = () => {
    if (!name || !proto || pid == null) return;
    const parsed = parseName(name);
    if (!parsed) return;
    const { local, remote } = parsed;
    const v6 = local.addr.includes(':') && local.addr !== '*';
    const protocol: Protocol = v6 ? (proto === 'tcp' ? 'tcp6' : 'udp6') : proto;
    const rAddr = remote?.addr ?? null;
    const rPort = remote?.port ?? null;
    entries.push({
      id: `host:host:${protocol}:${local.addr}:${local.port}:${rAddr ?? '-'}:${rPort ?? '-'}`,
      protocol,
      localAddress: local.addr,
      localPort: local.port,
      remoteAddress: rAddr,
      remotePort: rPort,
      state: proto === 'udp' ? 'LISTEN' : state,
      pid,
      processName: command,
      source: 'host',
    });
  };

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const tag = line[0];
    const value = line.slice(1);
    switch (tag) {
      case 'p':
        flush();
        pid = parseInt(value, 10);
        command = null;
        proto = null;
        state = 'UNKNOWN';
        name = null;
        break;
      case 'c':
        command = value;
        break;
      case 'f':
        flush();
        proto = null;
        state = 'UNKNOWN';
        name = null;
        break;
      case 'P':
        proto = value.toLowerCase().startsWith('tcp') ? 'tcp' : 'udp';
        break;
      case 'T':
        if (value.startsWith('ST=')) {
          state = STATE_MAP[value.slice(3).toUpperCase()] ?? 'UNKNOWN';
        }
        break;
      case 'n':
        name = value;
        break;
    }
  }
  flush();

  return entries;
}
