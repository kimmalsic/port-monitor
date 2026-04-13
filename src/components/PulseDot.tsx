import { useEffect, useState, memo } from 'react';
import { useAppStore } from '../store';

function PulseDotBase() {
  const lastScanAt = useAppStore((s) => s.scannedAt);
  const error = useAppStore((s) => s.error);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!lastScanAt) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 300);
    return () => clearTimeout(t);
  }, [lastScanAt]);

  const color = error ? 'bg-danger' : 'bg-accent';
  return (
    <span
      title={error ? `scan error: ${error}` : 'live'}
      className={`inline-block w-1.5 h-1.5 rounded-full ${color} transition-all duration-300 ${on ? 'scale-150 opacity-100' : 'scale-100 opacity-40'}`}
    />
  );
}

export const PulseDot = memo(PulseDotBase);
