import { memo, useState } from 'react';
import { useAppStore } from '../store';
import { SettingsMenu } from './SettingsMenu';
import { SnapIcon, Corner } from './SnapIcon';
import { PulseDot } from './PulseDot';

const CORNERS: { key: Corner; label: string }[] = [
  { key: 'tl', label: '왼쪽 위' },
  { key: 'tr', label: '오른쪽 위' },
  { key: 'bl', label: '왼쪽 아래' },
  { key: 'br', label: '오른쪽 아래' },
];

function TitleBarBase() {
  const settings = useAppStore((s) => s.settings);
  const [menuOpen, setMenuOpen] = useState(false);

  const snap = settings?.window.snap ?? 'tr';

  return (
    <div className="drag relative flex items-center justify-between px-2 py-1.5 bg-bg-elev border-b border-black/50 select-none">
      <span className="text-xs font-semibold tracking-wide text-accent flex items-center gap-1.5">
        <PulseDot />
        PORTS
      </span>
      <div className="no-drag flex items-center gap-0.5">
        {CORNERS.map(({ key, label }) => (
          <button
            key={key}
            title={label}
            className={`w-5 h-5 rounded flex items-center justify-center ${snap === key ? 'bg-accent/20 text-accent' : 'hover:bg-bg-hover text-muted'}`}
            onClick={() => window.portMonitor.setSnap(key)}
          >
            <SnapIcon corner={key} className="w-3.5 h-3.5" />
          </button>
        ))}
        <button
          title="설정"
          className={`w-5 h-5 rounded text-sm leading-none ${menuOpen ? 'bg-accent/20 text-accent' : 'hover:bg-bg-hover text-muted'}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          ⋯
        </button>
        <button
          title="Hide"
          className="w-5 h-5 rounded text-xs hover:bg-bg-hover text-muted"
          onClick={() => window.portMonitor.hideWindow()}
        >
          ×
        </button>
      </div>
      {menuOpen && <SettingsMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

export const TitleBar = memo(TitleBarBase);
