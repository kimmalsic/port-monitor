import { useMemo, useRef, useEffect, useState, useCallback, memo } from 'react';
import { VariableSizeList as List, areEqual } from 'react-window';
import { useAppStore, ExternalState } from '../store';
import { PortRow } from './PortRow';
import type { PortEntry } from '../types';

const ROW_COLLAPSED = 44;
const ROW_EXPANDED = 72;

interface RowData {
  ports: PortEntry[];
  external: Record<number, ExternalState>;
  expandedIds: Set<string>;
  connections: Map<number, number>;
  history: Map<number, number[]>;
  firstSeenAt: Map<string, number>;
  flashAt: Map<string, number>;
  onToggleExpand: (id: string) => void;
  onKill: (
    pid: number,
    target: { source: 'host' | 'wsl'; wslDistro?: string; force: boolean },
  ) => void;
  onCheckExternal: (port: number) => void;
}

const Row = memo(function Row({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: RowData;
}) {
  const p = data.ports[index];
  return (
    <PortRow
      style={style}
      port={p}
      external={data.external[p.localPort]}
      expanded={data.expandedIds.has(p.id)}
      connections={data.connections.get(p.localPort) ?? 0}
      history={data.history.get(p.localPort)}
      isNew={data.firstSeenAt.has(p.id)}
      flashing={data.flashAt.has(p.id)}
      onToggleExpand={data.onToggleExpand}
      onKill={data.onKill}
      onCheckExternal={data.onCheckExternal}
    />
  );
}, areEqual);

export function PortList() {
  const ports = useAppStore((s) => s.ports);
  const query = useAppStore((s) => s.settings?.filters.query ?? '');
  const listenOnly = useAppStore((s) => s.settings?.filters.listenOnly ?? true);
  const external = useAppStore((s) => s.external);
  const expandedIds = useAppStore((s) => s.expandedIds);
  const connections = useAppStore((s) => s.connections);
  const history = useAppStore((s) => s.history);
  const firstSeenAt = useAppStore((s) => s.firstSeenAt);
  const flashAt = useAppStore((s) => s.flashAt);
  const toggleExpanded = useAppStore((s) => s.toggleExpanded);
  const startExternalCheck = useAppStore((s) => s.startExternalCheck);
  const finishExternalCheck = useAppStore((s) => s.finishExternalCheck);
  const pushToast = useAppStore((s) => s.pushToast);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ports
      .filter((p) => !listenOnly || p.state === 'LISTEN' || p.protocol.startsWith('udp'))
      .filter((p) => {
        if (!q) return true;
        return (
          String(p.localPort).includes(q) ||
          (p.processName?.toLowerCase().includes(q) ?? false) ||
          p.localAddress.toLowerCase().includes(q) ||
          (p.wslDistro?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        if (a.source !== b.source) return a.source === 'host' ? -1 : 1;
        return a.localPort - b.localPort;
      });
  }, [ports, listenOnly, query]);

  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [filtered, expandedIds]);

  const handleKill = useCallback(
    async (pid: number, target: { source: 'host' | 'wsl'; wslDistro?: string; force: boolean }) => {
      const label = `pid ${pid}${target.source === 'wsl' ? ` (WSL ${target.wslDistro})` : ''}`;
      const res = await window.portMonitor.killProcess(pid, target);
      if (res.ok) {
        pushToast('success', `${target.force ? '강제 종료' : '종료'} 완료 · ${label}`);
      } else {
        pushToast('error', `종료 실패 · ${label} — ${res.message}`);
      }
      await window.portMonitor.refreshNow();
    },
    [pushToast],
  );

  const handleCheckExternal = useCallback(
    async (port: number) => {
      const existing = useAppStore.getState().external[port];
      if (existing?.status === 'pending') return;
      startExternalCheck(port);
      pushToast('info', `외부 접근 테스트 · ${port}`, 1500);
      const r = await window.portMonitor.checkExternalPort(port);
      finishExternalCheck(r);
      if (r.error) {
        pushToast('error', `${port} 테스트 실패 · ${r.error}`);
      } else if (r.reachable) {
        pushToast('success', `${port} 외부 접근 가능 · ${r.latencyMs}ms`);
      } else {
        pushToast('info', `${port} 외부 접근 불가 (방화벽/NAT)`);
      }
    },
    [startExternalCheck, finishExternalCheck, pushToast],
  );

  const data = useMemo<RowData>(
    () => ({
      ports: filtered,
      external,
      expandedIds,
      connections,
      history,
      firstSeenAt,
      flashAt,
      onToggleExpand: toggleExpanded,
      onKill: handleKill,
      onCheckExternal: handleCheckExternal,
    }),
    [
      filtered,
      external,
      expandedIds,
      connections,
      history,
      firstSeenAt,
      flashAt,
      toggleExpanded,
      handleKill,
      handleCheckExternal,
    ],
  );

  const itemSize = useCallback(
    (i: number) => (expandedIds.has(filtered[i]?.id) ? ROW_EXPANDED : ROW_COLLAPSED),
    [filtered, expandedIds],
  );

  if (filtered.length === 0) {
    return (
      <div ref={containerRef} className="flex-1 min-h-0 flex items-center justify-center text-xs text-muted">
        no ports
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0">
      {size.h > 0 && (
        <List
          ref={listRef}
          height={size.h}
          width={size.w}
          itemCount={filtered.length}
          itemSize={itemSize}
          itemData={data}
          itemKey={(i, d) => d.ports[i].id}
          overscanCount={4}
        >
          {Row}
        </List>
      )}
    </div>
  );
}
