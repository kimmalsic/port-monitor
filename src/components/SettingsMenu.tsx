import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

interface Props {
  onClose: () => void;
}

export function SettingsMenu({ onClose }: Props) {
  const settings = useAppStore((s) => s.settings);
  const patchSettings = useAppStore((s) => s.patchSettings);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!settings) return null;

  const Check = ({
    checked,
    onClick,
    label,
  }: {
    checked: boolean;
    onClick: () => void;
    label: string;
  }) => (
    <button
      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-fg hover:bg-bg-hover text-left"
      onClick={onClick}
    >
      <span className={`w-3 inline-block text-accent text-xs ${checked ? '' : 'invisible'}`}>✓</span>
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <div className="no-drag fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        className="no-drag absolute top-7 right-1 z-50 w-[200px] bg-bg-elev text-fg border border-accent/30 rounded shadow-2xl py-1"
      >
        <Check
          checked={settings.alwaysOnTop}
          label="항상 위에 표시"
          onClick={() => patchSettings({ alwaysOnTop: !settings.alwaysOnTop })}
        />
        <Check
          checked={settings.autoHideOnBlur}
          label="포커스 잃으면 자동 숨김"
          onClick={() => patchSettings({ autoHideOnBlur: !settings.autoHideOnBlur })}
        />
        <Check
          checked={settings.includeWsl}
          label="WSL 포트 포함"
          onClick={() => patchSettings({ includeWsl: !settings.includeWsl })}
        />
        <div className="border-t border-muted/30 my-1" />
        <div className="px-3 pt-1 pb-0.5 text-[10px] text-muted uppercase tracking-wide">테마</div>
        <div className="flex gap-1 px-2 pb-1">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              className={`flex-1 text-[11px] px-2 py-1 rounded ${
                settings.theme === t
                  ? 'bg-accent/20 text-accent'
                  : 'hover:bg-bg-hover text-fg-dim'
              }`}
              onClick={() => patchSettings({ theme: t })}
            >
              {t === 'dark' ? '다크' : '라이트'}
            </button>
          ))}
        </div>
        <div className="border-t border-muted/30 my-1" />
        <button
          className="w-full px-3 py-2 text-xs text-danger hover:bg-danger/20 text-left flex items-center gap-2"
          onClick={() => window.portMonitor.quitApp()}
        >
          <span className="w-3 inline-block invisible">✓</span> 종료
        </button>
      </div>
    </>
  );
}
