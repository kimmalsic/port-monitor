import { useAppStore } from '../store';

export function StatusBar() {
  const ports = useAppStore((s) => s.ports);
  const scannedAt = useAppStore((s) => s.scannedAt);
  const error = useAppStore((s) => s.error);

  const listen = ports.filter((p) => p.state === 'LISTEN').length;
  const total = ports.length;
  const agoSec = scannedAt ? Math.round((Date.now() - scannedAt) / 1000) : null;

  return (
    <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted bg-bg-elev border-t border-black/50 font-mono">
      <span>
        {listen} listen / {total} total
      </span>
      <span className={error ? 'text-danger' : ''}>
        {error ? error : agoSec == null ? '—' : `${agoSec}s ago`}
      </span>
    </div>
  );
}
