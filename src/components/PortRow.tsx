import { memo, type CSSProperties } from 'react';
import type { PortEntry } from '../types';
import type { ExternalState } from '../store';
import { Sparkline } from './Sparkline';

export interface PortRowProps {
  port: PortEntry;
  external: ExternalState | undefined;
  expanded: boolean;
  connections: number;
  history: number[] | undefined;
  isNew: boolean;
  flashing: boolean;
  onToggleExpand: (id: string) => void;
  onKill: (pid: number, target: { source: 'host' | 'wsl'; wslDistro?: string; force: boolean }) => void;
  onCheckExternal: (port: number) => void;
  style?: CSSProperties;
}

function stateColor(state: PortEntry['state']) {
  switch (state) {
    case 'LISTEN':
      return 'text-accent';
    case 'ESTABLISHED':
      return 'text-state-ok';
    case 'TIME_WAIT':
    case 'CLOSE_WAIT':
      return 'text-state-warn';
    default:
      return 'text-muted';
  }
}

function reachBadge(external: ExternalState | undefined) {
  if (!external || external.status === 'pending') return null;
  const r = external.result;
  if (r.error) return { label: 'ERR', cls: 'bg-muted/30 text-muted' };
  return r.reachable
    ? { label: 'OPEN', cls: 'bg-accent/20 text-accent' }
    : { label: 'CLOSED', cls: 'bg-danger/20 text-danger' };
}

function PortRowBase({
  port,
  external,
  expanded,
  connections,
  history,
  isNew,
  flashing,
  onToggleExpand,
  onKill,
  onCheckExternal,
  style,
}: PortRowProps) {
  const badge = reachBadge(external);
  const checking = external?.status === 'pending';
  const result = external?.status === 'done' ? external.result : null;

  return (
    <div
      style={style}
      className={`group relative px-2 py-1 border-b border-black/30 cursor-default transition-colors duration-150 ${
        expanded ? 'bg-bg-hover hover:bg-bg-hover/80' : 'hover:bg-bg-row'
      }`}
      onClick={() => onToggleExpand(port.id)}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity ease-out ${
          flashing ? 'opacity-100 duration-0' : 'opacity-0 duration-500'
        }`}
        style={{ backgroundColor: 'rgba(94, 234, 212, 0.18)' }}
      />
      <div className="relative z-10 flex items-center gap-1.5 text-xs font-mono">
        <span className={`font-semibold ${stateColor(port.state)}`}>{port.localPort}</span>
        <span className="text-muted text-[10px]">{port.protocol}</span>
        {port.source === 'wsl' && (
          <span className="text-[9px] px-1 rounded bg-state-info/20 text-state-info" title={port.wslDistro}>
            WSL
          </span>
        )}
        <span className="text-fg truncate flex-1 min-w-0">
          {port.processName ?? <span className="text-muted">–</span>}
        </span>
        {isNew && (
          <span className="text-[9px] px-1 rounded bg-accent/20 text-accent animate-pulse">NEW</span>
        )}
        {connections > 0 && (
          <span className="text-[9px] px-1 rounded bg-state-ok/20 text-state-ok" title={`${connections} active`}>
            {connections}
          </span>
        )}
        {history && history.length > 1 && <Sparkline data={history} width={36} height={10} />}
        {badge && <span className={`text-[9px] px-1 rounded ${badge.cls}`}>{badge.label}</span>}
      </div>
      <div className="relative z-10 flex items-center gap-2 text-[10px] text-muted font-mono truncate">
        <span>{port.state}</span>
        {port.pid != null && <span>pid {port.pid}</span>}
        <span className="truncate">{port.localAddress}</span>
      </div>
      {expanded && (
        <div className="relative z-10 mt-1 flex items-center gap-1 no-drag">
          <button
            disabled={checking}
            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-row hover:bg-bg-hover text-fg disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              onCheckExternal(port.localPort);
            }}
          >
            {checking ? '...' : 'External'}
          </button>
          {port.pid != null && (
            <>
              <button
                className="text-[10px] px-1.5 py-0.5 rounded bg-bg-row hover:bg-danger/40 text-fg"
                onClick={(e) => {
                  e.stopPropagation();
                  onKill(port.pid!, { source: port.source, wslDistro: port.wslDistro, force: false });
                }}
              >
                Kill
              </button>
              <button
                className="text-[10px] px-1.5 py-0.5 rounded bg-bg-row hover:bg-danger/60 text-fg"
                onClick={(e) => {
                  e.stopPropagation();
                  onKill(port.pid!, { source: port.source, wslDistro: port.wslDistro, force: true });
                }}
              >
                -9
              </button>
            </>
          )}
          <button
            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-row hover:bg-bg-hover text-fg"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(
                `${port.protocol} ${port.localAddress}:${port.localPort} ${port.processName ?? ''} pid=${port.pid ?? ''}`,
              );
            }}
          >
            Copy
          </button>
          {result && (
            <span className="text-[9px] text-muted truncate ml-auto">
              {result.latencyMs}ms {result.publicIp}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const PortRow = memo(PortRowBase, (prev, next) => {
  if (prev.expanded !== next.expanded) return false;
  if (prev.external !== next.external) return false;
  if (prev.connections !== next.connections) return false;
  if (prev.history !== next.history) return false;
  if (prev.isNew !== next.isNew) return false;
  if (prev.flashing !== next.flashing) return false;
  if (prev.onKill !== next.onKill) return false;
  if (prev.onCheckExternal !== next.onCheckExternal) return false;
  if (prev.onToggleExpand !== next.onToggleExpand) return false;
  if (prev.style !== next.style) return false;
  const a = prev.port;
  const b = next.port;
  return (
    a.id === b.id &&
    a.state === b.state &&
    a.pid === b.pid &&
    a.processName === b.processName &&
    a.remoteAddress === b.remoteAddress &&
    a.remotePort === b.remotePort
  );
});
