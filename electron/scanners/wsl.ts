import type { PortEntry, PortState, Protocol } from '../../shared/types';
import { runCommand, isSafeWslDistroName } from '../util';

interface WslDistro {
  name: string;
  state: string;
  default: boolean;
}

async function runWsl(args: string[], encoding: 'utf8' | 'utf16le'): Promise<string> {
  const { stdout } = await runCommand('wsl.exe', args, { encoding });
  return stdout;
}

export async function listWslDistros(): Promise<WslDistro[]> {
  const raw = await runWsl(['-l', '-v'], 'utf16le').catch(() => '');
  if (!raw) return [];
  const clean = raw.replace(/\u0000/g, '');
  const lines = clean.split(/\r?\n/).slice(1).filter((l) => l.trim());
  return lines.map((line) => {
    const isDefault = line.startsWith('*');
    const rest = line.replace(/^\*/, '').trim();
    const parts = rest.split(/\s+/);
    return { default: isDefault, name: parts[0], state: parts[1] ?? 'Unknown' };
  });
}

const PORT_STATE: Record<string, PortState> = {
  LISTEN: 'LISTEN',
  ESTAB: 'ESTABLISHED',
  ESTABLISHED: 'ESTABLISHED',
  'TIME-WAIT': 'TIME_WAIT',
  'CLOSE-WAIT': 'CLOSE_WAIT',
  'SYN-SENT': 'SYN_SENT',
  'SYN-RECV': 'SYN_RECV',
  'FIN-WAIT-1': 'FIN_WAIT1',
  'FIN-WAIT-2': 'FIN_WAIT2',
  CLOSING: 'CLOSING',
  'LAST-ACK': 'LAST_ACK',
  UNCONN: 'LISTEN',
};

function parseHostPort(s: string): { addr: string; port: number } {
  const lastColon = s.lastIndexOf(':');
  if (lastColon < 0) return { addr: s, port: 0 };
  const addr = s.substring(0, lastColon).replace(/^\[|\]$/g, '');
  const port = parseInt(s.substring(lastColon + 1), 10);
  return { addr: addr || '*', port: isNaN(port) ? 0 : port };
}

function parseSsLine(line: string, distro: string): PortEntry | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const netid = parts[0].toLowerCase();
  const stateRaw = parts[1];
  const local = parts[4];
  const remote = parts[5] ?? '';
  const procField = parts.slice(6).join(' ');

  if (!['tcp', 'udp'].includes(netid)) return null;
  const { addr: la, port: lp } = parseHostPort(local);
  const { addr: ra, port: rp } = parseHostPort(remote);
  const protocol: Protocol = la.includes(':') ? (netid === 'tcp' ? 'tcp6' : 'udp6') : (netid as Protocol);
  const state = PORT_STATE[stateRaw.toUpperCase()] ?? 'UNKNOWN';

  let pid: number | null = null;
  let processName: string | null = null;
  const procMatch = procField.match(/\(\("?([^",)]+)"?,pid=(\d+)/);
  if (procMatch) {
    processName = procMatch[1];
    pid = parseInt(procMatch[2], 10);
  }

  return {
    id: `wsl:${distro}:${protocol}:${la}:${lp}:${ra || '-'}:${rp || '-'}`,
    protocol,
    localAddress: la,
    localPort: lp,
    remoteAddress: rp ? ra : null,
    remotePort: rp || null,
    state,
    pid,
    processName,
    source: 'wsl',
    wslDistro: distro,
  };
}

export async function scanWslPorts(): Promise<PortEntry[]> {
  const distros = await listWslDistros();
  const running = distros.filter(
    (d) => d.state.toLowerCase() === 'running' && isSafeWslDistroName(d.name),
  );
  if (running.length === 0) return [];

  const results = await Promise.all(
    running.map(async (d) => {
      const stdout = await runWsl(
        ['-d', d.name, '--', 'sh', '-c', 'ss -tulnpH 2>/dev/null || ss -tulnp 2>/dev/null'],
        'utf8',
      ).catch(() => '');
      const lines = stdout.split('\n').filter((l) => l.trim() && !/^Netid/.test(l));
      return lines
        .map((l) => parseSsLine(l, d.name))
        .filter((x): x is PortEntry => x !== null);
    }),
  );
  return results.flat();
}
