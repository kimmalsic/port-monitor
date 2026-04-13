import type { PortEntry, PortState, Protocol } from '../../shared/types';
import { runCommand } from '../util';

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$tcp = Get-NetTCPConnection | ForEach-Object {
  [PSCustomObject]@{
    proto = 'tcp'
    localAddress = $_.LocalAddress
    localPort = $_.LocalPort
    remoteAddress = $_.RemoteAddress
    remotePort = $_.RemotePort
    state = "$($_.State)"
    pid = $_.OwningProcess
  }
}
$udp = Get-NetUDPEndpoint | ForEach-Object {
  [PSCustomObject]@{
    proto = 'udp'
    localAddress = $_.LocalAddress
    localPort = $_.LocalPort
    remoteAddress = ''
    remotePort = 0
    state = 'LISTEN'
    pid = $_.OwningProcess
  }
}
$all = @($tcp) + @($udp)
$pids = $all | ForEach-Object { [int]$_.pid } | Sort-Object -Unique
$pmap = @{}
if ($pids.Count -gt 0) {
  Get-Process -Id $pids | ForEach-Object { $pmap[$_.Id] = $_.ProcessName }
}
$all | ForEach-Object {
  [PSCustomObject]@{
    proto = $_.proto
    localAddress = $_.localAddress
    localPort = $_.localPort
    remoteAddress = $_.remoteAddress
    remotePort = $_.remotePort
    state = $_.state
    pid = $_.pid
    processName = $pmap[[int]$_.pid]
  }
} | ConvertTo-Json -Compress -Depth 3
`.trim();

interface PsRow {
  proto: 'tcp' | 'udp';
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: string;
  pid: number;
  processName: string | null;
}

const STATE_NORMALIZE: Record<string, PortState> = {
  LISTEN: 'LISTEN',
  ESTABLISHED: 'ESTABLISHED',
  TIMEWAIT: 'TIME_WAIT',
  CLOSEWAIT: 'CLOSE_WAIT',
  SYNSENT: 'SYN_SENT',
  SYNRECEIVED: 'SYN_RECV',
  FINWAIT1: 'FIN_WAIT1',
  FINWAIT2: 'FIN_WAIT2',
  CLOSING: 'CLOSING',
  LASTACK: 'LAST_ACK',
};

function normalizeState(s: string): PortState {
  return STATE_NORMALIZE[s.toUpperCase().replace(/[_\s-]/g, '')] ?? 'UNKNOWN';
}

function toProtocol(proto: string, addr: string): Protocol {
  const v6 = addr.includes(':');
  if (proto === 'tcp') return v6 ? 'tcp6' : 'tcp';
  return v6 ? 'udp6' : 'udp';
}

export async function scanWindowsPorts(): Promise<PortEntry[]> {
  const { stdout, stderr, code, error } = await runCommand(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
  );
  if (error) throw error;
  if (code !== 0 && !stdout.trim()) {
    throw new Error(stderr.trim() || `powershell exited ${code}`);
  }
  if (!stdout.trim()) return [];

  let rows: PsRow[];
  try {
    const parsed = JSON.parse(stdout);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    throw new Error(`invalid powershell output: ${(e as Error).message}`);
  }

  return rows.map((r): PortEntry => {
    const protocol = toProtocol(r.proto, r.localAddress);
    return {
      id: `host:host:${protocol}:${r.localAddress}:${r.localPort}:${r.remoteAddress || '-'}:${r.remotePort || '-'}`,
      protocol,
      localAddress: r.localAddress,
      localPort: r.localPort,
      remoteAddress: r.remoteAddress && r.remotePort ? r.remoteAddress : null,
      remotePort: r.remotePort || null,
      state: normalizeState(r.state),
      pid: r.pid || null,
      processName: r.processName ?? null,
      source: 'host',
    };
  });
}
