import { readFile, readdir, readlink } from 'node:fs/promises';
import type { PortEntry, PortState, Protocol } from '../../shared/types';

const STATE_MAP: Record<string, PortState> = {
  '01': 'ESTABLISHED',
  '02': 'SYN_SENT',
  '03': 'SYN_RECV',
  '04': 'FIN_WAIT1',
  '05': 'FIN_WAIT2',
  '06': 'TIME_WAIT',
  '07': 'UNKNOWN',
  '08': 'CLOSE_WAIT',
  '09': 'LAST_ACK',
  '0A': 'LISTEN',
  '0B': 'CLOSING',
};

function hexToIPv4(hex: string): string {
  const bytes = hex.match(/../g);
  if (!bytes || bytes.length !== 4) return '0.0.0.0';
  return bytes.reverse().map((b) => parseInt(b, 16)).join('.');
}

function hexToIPv6(hex: string): string {
  if (hex.length !== 32) return '::';
  const words: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    const w = hex.substring(i, i + 4);
    const le = w.substring(2, 4) + w.substring(0, 2);
    words.push(le);
  }
  return words.join(':').replace(/(^|:)0+([0-9a-f])/gi, '$1$2');
}

function parseHexAddr(raw: string, v6: boolean): { addr: string; port: number } {
  const [addrHex, portHex] = raw.split(':');
  const port = parseInt(portHex, 16);
  const addr = v6 ? hexToIPv6(addrHex) : hexToIPv4(addrHex);
  return { addr, port };
}

interface RawEntry {
  protocol: Protocol;
  localAddress: string;
  localPort: number;
  remoteAddress: string | null;
  remotePort: number | null;
  state: PortState;
  inode: string;
}

async function parseNetFile(path: string, protocol: Protocol): Promise<RawEntry[]> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  const lines = content.split('\n').slice(1);
  const v6 = protocol.endsWith('6');
  const isUdp = protocol.startsWith('udp');
  const entries: RawEntry[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;
    const local = parseHexAddr(parts[1], v6);
    const remote = parseHexAddr(parts[2], v6);
    const stateRaw = parts[3];
    const inode = parts[9];
    const state: PortState = isUdp
      ? stateRaw === '07'
        ? 'LISTEN'
        : 'UNKNOWN'
      : STATE_MAP[stateRaw] || 'UNKNOWN';
    entries.push({
      protocol,
      localAddress: local.addr,
      localPort: local.port,
      remoteAddress: remote.port === 0 ? null : remote.addr,
      remotePort: remote.port === 0 ? null : remote.port,
      state,
      inode,
    });
  }
  return entries;
}

interface ProcCacheEntry {
  pid: number;
  name: string;
}

let inodeCache: Map<string, ProcCacheEntry> = new Map();
let inodeCacheAt = 0;
const CACHE_TTL = 3000;

async function buildInodeMap(
  procRoot: string,
  wantedInodes: Set<string>,
): Promise<Map<string, ProcCacheEntry>> {
  const now = Date.now();
  if (now - inodeCacheAt < CACHE_TTL && inodeCache.size > 0) {
    const stillCovered = [...wantedInodes].every((i) => inodeCache.has(i));
    if (stillCovered) return inodeCache;
  }

  const map = new Map<string, ProcCacheEntry>();
  let pids: string[];
  try {
    pids = (await readdir(procRoot)).filter((n) => /^\d+$/.test(n));
  } catch {
    return map;
  }

  const CONCURRENCY = 32;
  let remaining = wantedInodes.size;

  const worker = async (slice: string[]) => {
    for (const pidStr of slice) {
      if (remaining === 0) return;
      const pid = parseInt(pidStr, 10);
      const fdDir = `${procRoot}/${pidStr}/fd`;
      let fds: string[];
      try {
        fds = await readdir(fdDir);
      } catch {
        continue;
      }
      let name: string | null = null;
      for (const fd of fds) {
        if (remaining === 0) return;
        try {
          const target = await readlink(`${fdDir}/${fd}`);
          const m = target.match(/socket:\[(\d+)\]/);
          if (!m) continue;
          if (!wantedInodes.has(m[1])) continue;
          if (!name) {
            try {
              name = (await readFile(`${procRoot}/${pidStr}/comm`, 'utf8')).trim();
            } catch {
              name = `pid-${pid}`;
            }
          }
          if (!map.has(m[1])) {
            map.set(m[1], { pid, name });
            remaining--;
          }
        } catch {
          // kernel threads / permission denied on some fds
        }
      }
    }
  };

  const chunks: string[][] = Array.from({ length: CONCURRENCY }, () => []);
  pids.forEach((p, i) => chunks[i % CONCURRENCY].push(p));
  await Promise.all(chunks.map(worker));

  inodeCache = map;
  inodeCacheAt = now;
  return map;
}

export async function scanLinuxPorts(opts?: {
  procRoot?: string;
}): Promise<PortEntry[]> {
  const procRoot = opts?.procRoot ?? '/proc';

  const [tcp, tcp6, udp, udp6] = await Promise.all([
    parseNetFile(`${procRoot}/net/tcp`, 'tcp'),
    parseNetFile(`${procRoot}/net/tcp6`, 'tcp6'),
    parseNetFile(`${procRoot}/net/udp`, 'udp'),
    parseNetFile(`${procRoot}/net/udp6`, 'udp6'),
  ]);

  const merged = [...tcp, ...tcp6, ...udp, ...udp6];
  const wantedInodes = new Set(merged.map((e) => e.inode).filter((i) => i && i !== '0'));
  const inodeMap = await buildInodeMap(procRoot, wantedInodes);

  return merged.map((e) => {
    const proc = inodeMap.get(e.inode) ?? null;
    return {
      id: `host:host:${e.protocol}:${e.localAddress}:${e.localPort}:${e.remoteAddress ?? '-'}:${e.remotePort ?? '-'}`,
      protocol: e.protocol,
      localAddress: e.localAddress,
      localPort: e.localPort,
      remoteAddress: e.remoteAddress,
      remotePort: e.remotePort,
      state: e.state,
      pid: proc?.pid ?? null,
      processName: proc?.name ?? null,
      source: 'host',
    } satisfies PortEntry;
  });
}
